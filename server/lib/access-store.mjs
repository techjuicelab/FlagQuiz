/* 한 프로세스가 원자적 파일 교체·fsync 로 허용 목록과 유료 호출 한도를 보관한다. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { normalizeEmail } from './google-oidc.mjs';

export const SUPER_ADMIN_EMAIL = 'techjuicelab@gmail.com';
export const QUOTAS = Object.freeze({ userDaily: 120, globalMonthly: 3000, allowlist: 1000 });
export class AccessError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const ownedDirectories = new Set();
function deny(code = 'access-denied') { throw new AccessError(403, code); }
function emailInput(value) { try { return normalizeEmail(value); } catch { throw new AccessError(400, 'invalid-email'); } }
function isSubject(sub) { return typeof sub === 'string' && /^[\x21-\x7e]{1,255}$/.test(sub); }
function emptyState() { return { version: 1, users: [{ email: SUPER_ADMIN_EMAIL, sub: null, createdAt: 0, createdBy: 'system' }], sessions: [], quota: { daily: {}, monthly: {} } }; }
function validState(state) {
  if (!state || state.version !== 1 || !Array.isArray(state.users) || state.users.length < 1 || state.users.length > QUOTAS.allowlist ||
      !Array.isArray(state.sessions) || state.sessions.length > 5000 || !state.quota ||
      !state.quota.daily || typeof state.quota.daily !== 'object' || Array.isArray(state.quota.daily) ||
      !state.quota.monthly || typeof state.quota.monthly !== 'object' || Array.isArray(state.quota.monthly)) return false;
  const emails = new Set();
  for (const user of state.users) {
    try { if (normalizeEmail(user.email) !== user.email) return false; } catch { return false; }
    if (emails.has(user.email) || (user.sub !== null && !isSubject(user.sub))) return false;
    emails.add(user.email);
  }
  if (!emails.has(SUPER_ADMIN_EMAIL)) return false;
  for (const session of state.sessions) if (!/^[A-Za-z0-9_-]{43}$/.test(session.id) || !isSubject(session.sub) ||
      !emails.has(session.email) || !Number.isInteger(session.expiresAt) || !Number.isInteger(session.createdAt)) return false;
  for (const [day, users] of Object.entries(state.quota.daily)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !users || typeof users !== 'object' || Array.isArray(users)) return false;
    for (const [sub, count] of Object.entries(users)) if (!isSubject(sub) || !Number.isInteger(count) || count < 0 || count > QUOTAS.userDaily) return false;
  }
  for (const [month, count] of Object.entries(state.quota.monthly)) if (!/^\d{4}-\d{2}$/.test(month) || !Number.isInteger(count) || count < 0 || count > QUOTAS.globalMonthly) return false;
  return true;
}

export async function openAccessStore({ directory, clock = Date.now }) {
  if (!path.isAbsolute(directory)) throw new Error('STATE_DIR must be absolute');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  directory = await fs.realpath(directory);
  if (ownedDirectories.has(directory)) throw new Error('Access store is locked; run only one server per STATE_DIR');
  ownedDirectories.add(directory);
  const lockPath = path.join(directory, 'access.lock'), statePath = path.join(directory, 'access.json');
  const mutexPath = path.join(directory, 'access-mutex.sqlite');
  let mutex, lock;
  try {
    // PID 파일을 지우는 경합은 OS 의 배타적 잠금으로 막는다. SIGKILL 뒤에도 자동으로 해제된다.
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        mutex = new DatabaseSync(mutexPath, { timeout: 0 });
        mutex.exec('PRAGMA journal_mode=DELETE; PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE;');
        break;
      } catch (error) {
        mutex?.close(); mutex = null;
        if (attempt === 11 || !/locked|busy/i.test(error.message)) throw error;
        // 처음 생성할 때 짧게 겹치는 SQLite 읽기 잠금은 닫고 다시 경쟁한다.
        await new Promise(resolve => setTimeout(resolve, 20 + Math.floor(Math.random() * 20)));
      }
    }
    await fs.chmod(mutexPath, 0o600);
    let previous;
    try { previous = Number((await fs.readFile(lockPath, 'utf8')).trim()); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (Number.isInteger(previous) && previous > 0 && previous !== process.pid) {
      try { process.kill(previous, 0); throw new Error('live-owner'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    // 이 guard 를 얻은 뒤에는 새 서버끼리 PID 파일을 빼앗는 경합이 없다.
    lock = await fs.open(lockPath, 'w', 0o600); await lock.writeFile(String(process.pid)); await lock.sync();
  } catch {
    await lock?.close(); mutex?.close(); ownedDirectories.delete(directory);
    throw new Error('Access store is locked; run only one server per STATE_DIR');
  }
  let state, closed = false, unavailable = false, queue = Promise.resolve();
  async function persist(next) {
    const temp = path.join(directory, '.access-' + randomBytes(12).toString('hex') + '.tmp');
    let handle;
    try {
      handle = await fs.open(temp, 'wx', 0o600); await handle.writeFile(JSON.stringify(next)); await handle.sync(); await handle.close(); handle = null;
      await fs.rename(temp, statePath);
      const dir = await fs.open(directory, 'r'); try { await dir.sync(); } finally { await dir.close(); }
      state = next;
    } finally { await handle?.close(); await fs.rm(temp, { force: true }); }
  }
  try {
    let raw;
    try {
      if ((await fs.stat(statePath)).size > 4 * 1024 * 1024) throw new Error('Access store exceeds size limit');
      raw = await fs.readFile(statePath, 'utf8');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (raw !== undefined) {
      state = JSON.parse(raw); if (!validState(state)) throw new Error('Access store is invalid; access stays closed');
    } else await persist(emptyState());
  } catch (error) { await lock.close(); await fs.rm(lockPath, { force: true }); mutex.close(); ownedDirectories.delete(directory); throw error; }
  function access(next, session) {
    if (!session) return false;
    const user = next.users.find(item => item.email === session.email);
    return user && user.sub === session.sub;
  }
  function activeSession(next, session) {
    return access(next, session) && next.sessions.some(item => item.id === session.id && item.email === session.email &&
      item.sub === session.sub && item.expiresAt > clock());
  }
  function mutate(fn) {
    const job = queue.then(async () => {
      if (closed || unavailable) throw new AccessError(503, 'store-unavailable');
      const next = structuredClone(state), result = fn(next);
      try { await persist(next); } catch { unavailable = true; throw new AccessError(503, 'store-unavailable'); }
      return result;
    });
    queue = job.catch(() => {}); return job;
  }
  function identityOf(session) { return { sub: session.sub, email: session.email, role: session.email === SUPER_ADMIN_EMAIL ? 'superadmin' : 'user' }; }
  return {
    async createSession(identity, lifetime = 8 * 60 * 60 * 1000) {
      const email = normalizeEmail(identity.email); if (!isSubject(identity.sub)) deny('invalid-subject');
      return mutate(next => {
        const user = next.users.find(item => item.email === email); if (!user) deny();
        if (user.sub !== null && user.sub !== identity.sub) deny('account-changed');
        user.sub = identity.sub; user.lastLoginAt = clock();
        next.sessions = next.sessions.filter(session => session.expiresAt > clock());
        const existing = next.sessions.filter(session => session.email === email).sort((a, b) => a.createdAt - b.createdAt);
        while (existing.length >= 5) { const old = existing.shift(); next.sessions = next.sessions.filter(session => session.id !== old.id); }
        if (next.sessions.length >= 5000) throw new AccessError(429, 'session-limit');
        const session = { id: randomBytes(32).toString('base64url'), sub: identity.sub, email, createdAt: clock(), expiresAt: clock() + lifetime };
        next.sessions.push(session); return { ...session, ...identityOf(session) };
      });
    },
    session(id) {
      if (closed || unavailable) return null;
      const session = state.sessions.find(item => item.id === id);
      return session && session.expiresAt > clock() && access(state, session) ? { ...session, ...identityOf(session) } : null;
    },
    revokeSession(id) { return mutate(next => { next.sessions = next.sessions.filter(item => item.id !== id); }); },
    list() { if (closed || unavailable) throw new AccessError(503, 'store-unavailable'); return state.users.map(user => ({ ...user, role: user.email === SUPER_ADMIN_EMAIL ? 'superadmin' : 'user' })); },
    add(email, actor) {
      email = emailInput(email);
      return mutate(next => {
        if (!activeSession(next, actor) || actor.email !== SUPER_ADMIN_EMAIL) deny('admin-required');
        if (next.users.some(user => user.email === email)) return { email, created: false };
        if (next.users.length >= QUOTAS.allowlist) throw new AccessError(429, 'allowlist-limit');
        next.users.push({ email, sub: null, createdAt: clock(), createdBy: actor.email }); return { email, created: true };
      });
    },
    remove(email, actor) {
      email = emailInput(email);
      return mutate(next => {
        if (!activeSession(next, actor) || actor.email !== SUPER_ADMIN_EMAIL) deny('admin-required');
        if (email === SUPER_ADMIN_EMAIL) deny('immutable-superadmin');
        next.users = next.users.filter(user => user.email !== email);
        next.sessions = next.sessions.filter(session => session.email !== email); return { email };
      });
    },
    consumeSpeechQuota(session) {
      return mutate(next => {
        if (!activeSession(next, session)) deny();
        const date = new Date(clock()).toISOString(), day = date.slice(0, 10), month = date.slice(0, 7);
        const dailyUsers = next.quota.daily[day];
        const daily = dailyUsers && Object.hasOwn(dailyUsers, session.sub) ? dailyUsers[session.sub] : 0;
        const monthly = Object.hasOwn(next.quota.monthly, month) ? next.quota.monthly[month] : 0;
        if (daily >= QUOTAS.userDaily) throw new AccessError(429, 'daily-speech-limit');
        if (monthly >= QUOTAS.globalMonthly) throw new AccessError(429, 'monthly-speech-limit');
        // 이전 월은 정리하고, 현재 월의 일별 기록은 시계가 뒤로 가도 한도를 잊지 않도록 유지한다.
        next.quota.daily = Object.fromEntries(Object.entries(next.quota.daily).filter(([key]) => key.startsWith(month)));
        next.quota.monthly = { [month]: monthly + 1 };
        next.quota.daily[day] ||= {};
        Object.defineProperty(next.quota.daily[day], session.sub, { value: daily + 1, enumerable: true, writable: true, configurable: true });
        return { dailyUsed: daily + 1, dailyLimit: QUOTAS.userDaily, monthlyUsed: monthly + 1, monthlyLimit: QUOTAS.globalMonthly };
      });
    },
    async close() {
      await queue; if (closed) return; closed = true;
      try { await lock.close(); await fs.rm(lockPath, { force: true }); }
      finally { mutex.close(); ownedDirectories.delete(directory); }
    }
  };
}
