import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openAccessStore, SUPER_ADMIN_EMAIL } from '../server/lib/access-store.mjs';

const central = (email = 'central-child@gmail.com', patch = {}) => ({ email, sub: 'central-child-sub', techjuiceRole: 'user', generation: 1, ...patch });
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'flagquiz-central-store-'));
  let store = await openAccessStore({ directory });
  t.after(async () => { await store.close(); await fs.rm(directory, { recursive: true, force: true }); });
  return { directory, get store() { return store; }, async reopen() { await store.close(); store = await openAccessStore({ directory }); } };
}
const trusted = { trustedCentralIdentity: true };

test('검증된 중앙 사용자만 최초 로그인에 등록하며 TECH 이메일에서만 최고 관리자를 파생한다', async t => {
  const f = await fixture(t);
  for (const role of ['user', 'tester', 'admin']) {
    const session = await f.store.createSession(central(role + '@gmail.com', { sub: role + '-sub', techjuiceRole: role, superadmin: true }), undefined, trusted);
    assert.equal(session.role, 'user'); assert.equal(session.generation, 1);
    assert.equal(f.store.session(session.id).generation, 1);
  }
  const admin = await f.store.createSession(central(SUPER_ADMIN_EMAIL, { sub: 'tech-admin-sub', techjuiceRole: 'user' }), undefined, trusted);
  assert.equal(admin.role, 'superadmin');
  await f.reopen(); assert.equal(f.store.session(admin.id).generation, 1);
});

test('중앙 신뢰 옵션·앱 role·양의 generation이 빠지면 자동 등록하지 않는다', async t => {
  const f = await fixture(t);
  await assert.rejects(f.store.createSession(central()), /access-denied/);
  await assert.rejects(f.store.createSession(central(), undefined, { trustedCentralIdentity: 'true' }), /access-denied/);
  for (const patch of [{ techjuiceRole: undefined }, { techjuiceRole: 'superadmin' }, { generation: 0 }, { generation: '1' }, { generation: NaN }]) {
    await assert.rejects(f.store.createSession(central(undefined, patch), undefined, trusted), /invalid-central-identity/);
  }
  assert.equal(f.store.list().length, 1);
});

test('관리자 삭제는 재시작 뒤에도 중앙 재등록을 막고 명시적 추가만 차단을 해제한다', async t => {
  const f = await fixture(t), admin = await f.store.createSession({ email: SUPER_ADMIN_EMAIL, sub: 'admin-sub' });
  const child = await f.store.createSession(central(), undefined, trusted); await f.store.consumeSpeechQuota(child);
  await f.store.remove(child.email, admin); assert.equal(f.store.session(child.id), null);
  await f.reopen(); await assert.rejects(f.store.createSession(central(), undefined, trusted), /access-denied/);
  await f.store.add(child.email, f.store.session(admin.id));
  const readded = await f.store.createSession(central(undefined, { generation: 2 }), undefined, trusted);
  assert.equal(readded.generation, 2); assert.equal((await f.store.consumeSpeechQuota(readded)).dailyUsed, 2);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.directory, 'access.json'), 'utf8')).blockedEmails, []);
});

test('중앙 로그인도 기존 sub 연결을 덮어쓰지 않고 Google 방식의 수동 허용 목록을 유지한다', async t => {
  const f = await fixture(t), admin = await f.store.createSession({ email: SUPER_ADMIN_EMAIL, sub: 'admin-sub' });
  await f.store.add('legacy@gmail.com', admin); await f.store.createSession({ email: 'legacy@gmail.com', sub: 'google-sub' });
  await assert.rejects(f.store.createSession(central('legacy@gmail.com'), undefined, trusted), /account-changed/);
  await assert.rejects(f.store.createSession({ email: 'unlisted@gmail.com', sub: 'google-new' }), /access-denied/);
});

test('blockedEmails 없는 v1은 호환하고 손상된 차단 목록·generation은 원본을 보존하며 닫힌다', async t => {
  for (const patch of [{ blockedEmails: 'bad' }, { blockedEmails: ['not-email'] }, { blockedEmails: [SUPER_ADMIN_EMAIL] },
    { blockedEmails: ['blocked@gmail.com', 'blocked@gmail.com'] }, { generation: 0 }]) {
    const f = await fixture(t); await f.store.createSession({ email: SUPER_ADMIN_EMAIL, sub: 'admin-sub' }); await f.store.close();
    const file = path.join(f.directory, 'access.json'), data = JSON.parse(await fs.readFile(file, 'utf8'));
    if ('generation' in patch) data.sessions[0].generation = patch.generation; else Object.assign(data, patch);
    const original = JSON.stringify(data); await fs.writeFile(file, original);
    await assert.rejects(openAccessStore({ directory: f.directory }), /invalid/); assert.equal(await fs.readFile(file, 'utf8'), original);
  }
  const f = await fixture(t); await f.store.close(); const file = path.join(f.directory, 'access.json'), old = JSON.parse(await fs.readFile(file, 'utf8'));
  delete old.blockedEmails; await fs.writeFile(file, JSON.stringify(old)); await f.reopen();
  assert.equal((await f.store.createSession(central(), undefined, trusted)).generation, 1);
});
