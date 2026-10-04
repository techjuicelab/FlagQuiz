/* TechJuice ID의 중앙 JWT만 검증한다. 앱 권한은 사용자 metadata가 아닌 tj 클레임에서 읽는다. */
import { createPublicKey, verify, createHash } from 'node:crypto';

const USERNAME = /^[a-z0-9][a-z0-9._-]{1,30}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = new Set(['admin', 'tester', 'user']);
const MAX_JSON_BYTES = 64 * 1024;

export class TechJuiceIdError extends Error {
  constructor(code = 'identity-unavailable', status) { super(code); this.code = code; this.status = status; }
}

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function email(value) {
  if (typeof value !== 'string') throw new TechJuiceIdError('invalid-email');
  const result = value.trim().toLowerCase();
  if (result.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new TechJuiceIdError('invalid-email');
  return result;
}
function unresolved(value) { return typeof value !== 'string' || !value.trim() || /^['"]?op:\/\//.test(value.trim()); }
function appKey(value) {
  if (unresolved(value) || value.trim().startsWith('sb_secret_')) return false;
  // 키 형식을 인증에 사용하지 않는다. 잘못 주입한 중앙 관리용 키만 추가로 거절한다.
  try {
    const parts = value.trim().split('.');
    if (parts.length === 3 && decode(parts[1]).role !== 'anon') return false;
  } catch { return false; }
  return true;
}
function decode(part) {
  if (typeof part !== 'string' || !/^[A-Za-z0-9_-]+$/.test(part)) throw new TechJuiceIdError('invalid-token');
  const bytes = Buffer.from(part, 'base64url');
  if (bytes.toString('base64url') !== part) throw new TechJuiceIdError('invalid-token');
  try { const value = JSON.parse(bytes.toString('utf8')); if (!object(value)) throw new Error(); return value; }
  catch { throw new TechJuiceIdError('invalid-token'); }
}

async function jsonResponse(response) {
  if (!response?.ok) throw new TechJuiceIdError('identity-unavailable', response?.status);
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) throw new TechJuiceIdError();
  const reader = response.body?.getReader();
  if (!reader) throw new TechJuiceIdError();
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_JSON_BYTES) { await reader.cancel(); throw new Error(); }
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { throw new TechJuiceIdError(); }
}

export function createTechJuiceId({ supabaseUrl, anonKey, appSlug = 'flagquiz', fetchImpl = globalThis.fetch, clock = Date.now, timeoutMs = 8000 } = {}) {
  let base = '';
  try {
    const url = new URL(supabaseUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error();
    base = url.origin;
  } catch { /* 설정이 없거나 잘못되면 외부 호출하지 않는다. */ }
  const ready = Boolean(base && appKey(anonKey) && /^[a-z0-9-]{2,32}$/.test(appSlug));
  const issuer = base + '/auth/v1';
  let keys = [], expiresAt = 0, refreshing = null, lastUnknownRefresh = -Infinity;

  async function request(path, body) {
    if (!ready) throw new TechJuiceIdError();
    try {
      return await jsonResponse(await fetchImpl(base + path, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
        headers: { apikey: anonKey, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      }));
    } catch (error) {
      if (error instanceof TechJuiceIdError) throw error;
      throw new TechJuiceIdError();
    }
  }

  async function refreshKeys(force = false) {
    if (!force && keys.length && expiresAt > clock()) return;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const document = await request('/auth/v1/.well-known/jwks.json');
      if (!object(document) || !Array.isArray(document.keys) || !document.keys.length || document.keys.length > 30) throw new TechJuiceIdError();
      keys = document.keys.filter(key => object(key) && typeof key.kid === 'string' && key.kid.length >= 1 && key.kid.length <= 200 &&
        (key.use === undefined || key.use === 'sig') && (key.key_ops === undefined || (Array.isArray(key.key_ops) && key.key_ops.includes('verify'))) &&
        ((key.kty === 'EC' && key.crv === 'P-256' && (key.alg === undefined || key.alg === 'ES256')) ||
         (key.kty === 'RSA' && (key.alg === undefined || key.alg === 'RS256'))));
      if (!keys.length) throw new TechJuiceIdError();
      expiresAt = clock() + 5 * 60_000;
    })();
    try { return await refreshing; } finally { refreshing = null; }
  }

  async function verifyAccessToken(token) {
    if (!ready || typeof token !== 'string' || token.length > 16384) throw new TechJuiceIdError('invalid-token');
    const parts = token.split('.');
    if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[2])) throw new TechJuiceIdError('invalid-token');
    const header = decode(parts[0]), claims = decode(parts[1]);
    if (!['ES256', 'RS256'].includes(header.alg) || typeof header.kid !== 'string' || !header.kid || header.kid.length > 200 ||
        header.crit !== undefined || header.jku !== undefined || header.jwk !== undefined || header.x5u !== undefined) throw new TechJuiceIdError('invalid-token');
    await refreshKeys();
    let jwk = keys.find(key => key.kid === header.kid && (header.alg === 'ES256' ? key.kty === 'EC' : key.kty === 'RSA'));
    if (!jwk && clock() - lastUnknownRefresh >= 60_000) {
      lastUnknownRefresh = clock(); await refreshKeys(true);
      jwk = keys.find(key => key.kid === header.kid && (header.alg === 'ES256' ? key.kty === 'EC' : key.kty === 'RSA'));
    }
    if (!jwk) throw new TechJuiceIdError('invalid-signature');
    try {
      const signature = Buffer.from(parts[2], 'base64url');
      if (signature.toString('base64url') !== parts[2]) throw new Error();
      const key = createPublicKey({ key: jwk, format: 'jwk' });
      const publicKey = header.alg === 'ES256' ? { key, dsaEncoding: 'ieee-p1363' } : key;
      if ((header.alg === 'ES256' && signature.length !== 64) || (header.alg === 'RS256' && key.asymmetricKeyDetails?.modulusLength < 2048) ||
          !verify('sha256', Buffer.from(parts[0] + '.' + parts[1]), publicKey, signature)) throw new Error();
    } catch { throw new TechJuiceIdError('invalid-signature'); }
    const time = Math.floor(clock() / 1000);
    if (claims.iss !== issuer) throw new TechJuiceIdError('invalid-issuer');
    if (claims.aud !== 'authenticated' && !(Array.isArray(claims.aud) && claims.aud.includes('authenticated'))) throw new TechJuiceIdError('invalid-audience');
    if (!Number.isInteger(claims.exp) || claims.exp <= time || !Number.isInteger(claims.iat) || claims.iat > time + 60 || claims.iat > claims.exp ||
        (claims.nbf !== undefined && (!Number.isInteger(claims.nbf) || claims.nbf > time))) throw new TechJuiceIdError('expired-token');
    if (typeof claims.sub !== 'string' || !UUID.test(claims.sub)) throw new TechJuiceIdError('invalid-subject');
    if (claims.role !== 'authenticated' || claims.is_anonymous !== false) throw new TechJuiceIdError('invalid-role');
    const tj = claims.tj;
    if (!object(tj) || typeof tj.disabled !== 'boolean' || tj.disabled || typeof tj.superadmin !== 'boolean' || !object(tj.roles)) throw new TechJuiceIdError('access-denied');
    const techjuiceRole = tj.superadmin ? 'admin' : Object.hasOwn(tj.roles, appSlug) ? tj.roles[appSlug] : null;
    if (!ROLES.has(techjuiceRole)) throw new TechJuiceIdError('access-denied');
    const sub = claims.sub.toLowerCase();
    const state = await sessionState(sub);
    if (!state || state.disabled) throw new TechJuiceIdError('access-denied');
    if (claims.exp <= Math.floor(clock() / 1000)) throw new TechJuiceIdError('expired-token');
    // 중앙 계정 인증 완료 표시다. 합성 이메일은 실제 메일 수신 확인을 뜻하지 않는다.
    return { sub, email: email(claims.email), emailVerified: true, techjuiceRole, superadmin: tj.superadmin,
      generation: state.gen, expiresAt: claims.exp * 1000 };
  }

  async function tokenGrant(grantType, body) {
    const document = await request('/auth/v1/token?grant_type=' + grantType, body);
    if (!object(document) || typeof document.access_token !== 'string') throw new TechJuiceIdError();
    return verifyAccessToken(document.access_token);
  }

  async function sessionState(sub) {
    if (!ready || typeof sub !== 'string' || !UUID.test(sub)) return null;
    try {
      const rows = await request('/rest/v1/rpc/tj_session_state', { p_sub: sub.toLowerCase() });
      const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
      if (!object(row) || !Number.isInteger(row.gen) || row.gen < 1 || row.gen > 2147483647 || typeof row.disabled !== 'boolean') return null;
      return { gen: row.gen, disabled: row.disabled };
    } catch { return null; }
  }

  async function resolveIdentifier(identifier) {
    if (!ready || typeof identifier !== 'string') return null;
    const name = identifier.trim().toLowerCase();
    try {
      if (name.includes('@')) return email(name);
      if (!USERNAME.test(name)) return null;
      return email(await request('/rest/v1/rpc/email_for_username', { p_username: name }));
    } catch { return null; }
  }

  async function passwordGrant(identifier, password) {
    if (!ready || typeof identifier !== 'string' || typeof password !== 'string' || !password || password.length > 1024) return null;
    const name = identifier.trim().toLowerCase();
    try {
      if (name.includes('@')) return await tokenGrant('password', { email: email(name), password });
      if (!USERNAME.test(name)) return null;
      const synthetic = name + '@users.techjuicelab.space';
      try { return await tokenGrant('password', { email: synthetic, password }); }
      catch (error) { if (![400, 401].includes(error.status)) return null; }
      const real = await resolveIdentifier(name);
      if (!real || real === synthetic) return null;
      return await tokenGrant('password', { email: real, password });
    } catch { return null; }
  }

  function validVerifier(verifier) { return typeof verifier === 'string' && /^[A-Za-z0-9._~-]{43,128}$/.test(verifier); }
  function authorizationUrl({ redirectUri, state, verifier } = {}) {
    if (!ready || !validVerifier(verifier) || typeof state !== 'string' || !/^[A-Za-z0-9_-]{20,256}$/.test(state)) throw new TechJuiceIdError('invalid-oauth-state');
    let callback;
    try {
      callback = new URL(redirectUri);
      if ((callback.protocol !== 'https:' && !(callback.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname))) ||
          callback.username || callback.password || callback.hash) throw new Error();
    } catch { throw new TechJuiceIdError('invalid-redirect'); }
    // state·verifier는 호출 서버의 짧은 HttpOnly pending 쿠키에 보관하고 콜백에서 한 번만 확인한다.
    callback.searchParams.set('state', state);
    const url = new URL(issuer + '/authorize');
    url.search = new URLSearchParams({ provider: 'google', redirect_to: callback.href, scopes: 'openid email profile',
      code_challenge_method: 's256', code_challenge: createHash('sha256').update(verifier).digest('base64url') }).toString();
    return url.href;
  }

  async function exchangeCode({ code, verifier } = {}) {
    if (!ready || !validVerifier(verifier) || typeof code !== 'string' || !/^[A-Za-z0-9_-]{1,4096}$/.test(code)) return null;
    try { return await tokenGrant('pkce', { auth_code: code, code_verifier: verifier }); }
    catch { return null; }
  }

  return { ready, passwordGrant, verifyAccessToken, sessionState, resolveIdentifier, authorizationUrl, exchangeCode };
}
