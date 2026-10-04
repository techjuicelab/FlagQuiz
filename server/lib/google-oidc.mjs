/* Google 서버의 공개 키로 ID token 을 검증한다. 사용자 입력 이메일은 신뢰하지 않는다. */
import { createPublicKey, verify, createHash } from 'node:crypto';

export const GOOGLE = Object.freeze({
  authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  jwks: 'https://www.googleapis.com/oauth2/v3/certs'
});

export class IdentityError extends Error {
  constructor(code = 'identity-unavailable') { super(code); this.code = code; }
}

export function normalizeEmail(value) {
  if (typeof value !== 'string') throw new IdentityError('invalid-email');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(email) ||
      email.split('@')[0].length > 64 || email.includes('..')) throw new IdentityError('invalid-email');
  return email;
}

function decodePart(part) {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new IdentityError('invalid-token');
  try {
    const decoded = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error();
    return decoded;
  } catch { throw new IdentityError('invalid-token'); }
}

export function checkClaims(claims, { clientId, nonce, now = Date.now() }) {
  const time = Math.floor(now / 1000);
  if (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') throw new IdentityError('invalid-issuer');
  if (claims.aud !== clientId || (claims.azp !== undefined && claims.azp !== clientId)) throw new IdentityError('invalid-audience');
  if (!Number.isInteger(claims.exp) || claims.exp <= time || !Number.isInteger(claims.iat) || claims.iat > time + 60 || claims.iat > claims.exp ||
      (claims.nbf !== undefined && (!Number.isInteger(claims.nbf) || claims.nbf > time + 60))) throw new IdentityError('expired-token');
  if (typeof claims.sub !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(claims.sub)) throw new IdentityError('invalid-subject');
  if (claims.email_verified !== true) throw new IdentityError('unverified-email');
  if (typeof nonce !== 'string' || nonce.length < 20 || claims.nonce !== nonce) throw new IdentityError('invalid-nonce');
  const email = normalizeEmail(claims.email), domain = email.slice(email.lastIndexOf('@') + 1);
  // 외부 메일은 Google 계정 생성 당시만 확인됐을 수 있다. 현재 권위가 있는 호스팅 계정만 받는다.
  if (domain !== 'gmail.com') {
    const hosted = typeof claims.hd === 'string' ? claims.hd.toLowerCase() : '';
    if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(hosted) || hosted.length > 253 || hosted.includes('..') || hosted !== domain) {
      throw new IdentityError('hosted-account-required');
    }
  }
  return { sub: claims.sub, email };
}

async function jsonResponse(response, maximum = 1024 * 1024) {
  if (!response.ok) throw new IdentityError('identity-unavailable');
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > maximum) throw new IdentityError('identity-unavailable');
  const reader = response.body?.getReader();
  if (!reader) throw new IdentityError('identity-unavailable');
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new IdentityError('identity-unavailable'); }
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { throw new IdentityError('identity-unavailable'); }
}

export function createGoogleOidc({ clientId, clientSecret, redirectUri, fetchImpl = fetch, clock = Date.now }) {
  let keys = [], expiresAt = 0, refreshing = null, lastUnknownRefresh = 0;
  async function refresh(force = false) {
    if (!force && keys.length && expiresAt > clock()) return;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const response = await fetchImpl(GOOGLE.jwks, { signal: AbortSignal.timeout(8000), redirect: 'error' });
        const document = await jsonResponse(response);
        if (!Array.isArray(document.keys) || document.keys.length < 1 || document.keys.length > 30) throw new IdentityError();
        const valid = document.keys.filter(key => key.kty === 'RSA' && typeof key.kid === 'string' && key.kid.length <= 200 &&
          (!key.use || key.use === 'sig') && (!key.alg || key.alg === 'RS256'));
        if (!valid.length) throw new IdentityError();
        keys = valid;
        const maxAge = Number(/\bmax-age=(\d+)\b/.exec(response.headers.get('cache-control') || '')?.[1] || 300);
        expiresAt = clock() + Math.min(3600, Math.max(30, maxAge)) * 1000;
      } catch { throw new IdentityError('identity-unavailable'); }
      finally { refreshing = null; }
    })();
    return refreshing;
  }
  async function verifyIdToken(token, nonce) {
    if (typeof token !== 'string' || token.length > 16384) throw new IdentityError('invalid-token');
    const parts = token.split('.');
    if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[2])) throw new IdentityError('invalid-token');
    const header = decodePart(parts[0]), claims = decodePart(parts[1]);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 200 || header.crit !== undefined) throw new IdentityError('invalid-token');
    await refresh();
    let jwk = keys.find(key => key.kid === header.kid);
    if (!jwk && clock() - lastUnknownRefresh > 60000) {
      lastUnknownRefresh = clock(); await refresh(true); jwk = keys.find(key => key.kid === header.kid);
    }
    if (!jwk) throw new IdentityError('invalid-signature');
    try {
      const key = createPublicKey({ key: jwk, format: 'jwk' });
      if (key.asymmetricKeyDetails?.modulusLength < 2048 ||
          !verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), key, Buffer.from(parts[2], 'base64url'))) throw new Error();
    } catch { throw new IdentityError('invalid-signature'); }
    return checkClaims(claims, { clientId, nonce, now: clock() });
  }
  return {
    authorizationUrl({ state, nonce, verifier }) {
      const url = new URL(GOOGLE.authorization);
      url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
        scope: 'openid email', state, nonce, prompt: 'select_account', code_challenge_method: 'S256',
        code_challenge: createHash('sha256').update(verifier).digest('base64url') }).toString();
      return url.href;
    },
    verifyIdToken,
    async exchangeCode({ code, nonce, verifier }) {
      if (typeof code !== 'string' || code.length < 1 || code.length > 4096) throw new IdentityError('invalid-code');
      let document;
      try {
        document = await jsonResponse(await fetchImpl(GOOGLE.token, { method: 'POST', redirect: 'error',
          signal: AbortSignal.timeout(8000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret,
            redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier }) }));
      } catch { throw new IdentityError('identity-unavailable'); }
      return verifyIdToken(document.id_token, nonce);
    }
  };
}
