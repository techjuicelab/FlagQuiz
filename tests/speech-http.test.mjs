/* 실제 HTTP pause·WAV 파서·quota·공급자 어댑터를 연결한다. 외부 공급자는 가짜 응답만 사용한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAuthServer, readConfig } from '../server/auth-server.mjs';

const NOW = Date.UTC(2026, 9, 3, 12);
function wav(durationMs = 1000) {
  const samples = durationMs * 16, audio = Buffer.alloc(44 + samples * 2);
  audio.write('RIFF', 0); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8); audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22); audio.writeUInt32LE(16000, 24); audio.writeUInt32LE(32000, 28);
  audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(samples * 2, 40);
  return audio;
}
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'flagquiz-speech-http-'));
  const stateDirectory = path.join(directory, 'state'); let calls = 0, paused = false;
  const app = await createAuthServer({ config: readConfig({ AUTH_PROVIDER: 'techjuice-id', PUBLIC_ORIGIN: 'http://127.0.0.1',
    TJID_SUPABASE_URL: 'https://fixture.supabase.co', TJID_SUPABASE_ANON_KEY: 'fixture-public', SESSION_SECRET: 's'.repeat(64),
    GROQ_API_KEY: 'fixture-not-real', STATE_DIR: stateDirectory, STATIC_ROOT: path.join(directory, 'site') }), clock: () => NOW,
    techjuiceId: { ready: true, sessionState: async () => ({ gen: 1, disabled: false }),
      passwordGrant: async (identifier, password) => identifier === 'fixture-child' && password === 'fixture-password' ? {
        sub: '22222222-2222-4222-8222-222222222222', email: 'fixture-child@example.invalid', techjuiceRole: 'user',
        emailVerified: true, generation: 1, expiresAt: NOW + 3600_000
      } : null },
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://api.groq.com/openai/v1/audio/transcriptions'); assert.equal(options.method, 'POST');
      assert.equal(options.body.get('model'), 'whisper-large-v3-turbo'); assert.equal(options.body.get('language'), 'ko');
      assert.deepEqual(Buffer.from(await options.body.get('file').arrayBuffer()), wav());
      const saved = JSON.parse(await fs.readFile(path.join(stateDirectory, 'access.json'), 'utf8'));
      assert.equal(saved.quota.monthly['2026-10'], 1);
      return new Response(JSON.stringify({ text: '대한민국' }), { headers: { 'Content-Type': 'application/json' } });
    } });
  app.server.prependListener('request', req => {
    if (req.url === '/api/speech') req.once('pause', () => { paused = true; });
  });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port; app.config.publicOrigin = base;
  t.after(async () => { await app.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const request = (route, options = {}) => fetch(base + route, { ...options, redirect: 'manual', signal: AbortSignal.timeout(3000) });
  const page = await request('/login'), html = await page.text();
  const csrf = /name="csrf" value="([A-Za-z0-9_-]+)"/.exec(html)[1], loginCookie = page.headers.getSetCookie()[0].split(';')[0];
  const login = await request('/api/auth/password', { method: 'POST', headers: { Cookie: loginCookie, Origin: base,
    'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ identifier: 'fixture-child', password: 'fixture-password', csrf }) });
  assert.equal(login.status, 303); await login.arrayBuffer();
  const cookie = login.headers.getSetCookie().find(value => value.startsWith('flagquiz_session=')).split(';')[0];
  const session = await (await request('/api/auth/session', { headers: { Cookie: cookie } })).json();
  const headers = { Cookie: cookie, Origin: base, 'X-CSRF-Token': session.csrfToken, 'Content-Type': 'audio/wav',
    'X-Audio-Duration-Ms': '1000', 'X-Player-Id': '0', 'X-Turn-Id': '1' };
  return { request, headers, stateDirectory, get calls() { return calls; }, get paused() { return paused; } };
}
test('인증된 실제 HTTP의 pause한 WAV 본문을 읽고 quota 저장 뒤 공급자를 한 번 호출한다', async t => {
  const f = await fixture(t);
  const response = await f.request('/api/speech', { method: 'POST', headers: f.headers, body: wav() });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { text: '대한민국', playerId: '0', turnId: '1', quota: { dailyUsed: 1, dailyLimit: 120 } });
  assert.equal(f.paused, true); assert.equal(f.calls, 1);
});
test('재개한 실제 HTTP 본문도 잘못된 WAV는 quota·공급자 호출 전에 거절한다', async t => {
  const f = await fixture(t), audio = wav(); audio.writeUInt32LE(48000, 24);
  const response = await f.request('/api/speech', { method: 'POST', headers: f.headers, body: audio });
  assert.equal(response.status, 400); assert.deepEqual(await response.json(), { error: 'invalid_audio' });
  assert.equal(f.paused, true); assert.equal(f.calls, 0);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.stateDirectory, 'access.json'), 'utf8')).quota.monthly, {});
});
