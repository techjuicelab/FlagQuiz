/* 실제 API를 호출하지 않고 음원 재사용·크레딧·완성 판정 경계를 검사한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { voiceCorpus, voiceSamples } from '../scripts/voice-corpus.mjs';
import { generateVoice, loadVoiceConfig, keyFor, requestHash, synthesisRequest, digest } from '../scripts/generate-voice.mjs';

const voice = await loadVoiceConfig();
const sampleCorpus = voiceSamples();
const extra = { text: '다음 나라를 만나 볼까요?', kind: 'explanation' };
const corpus = [...sampleCorpus, extra];
const sampleCharacters = sampleCorpus.reduce((count, entry) => count + entry.text.length, 0);
const fakeKey = 'test-only-not-a-real-api-key';

async function fixture(t, entries = corpus) {
  const appRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flagquiz-voice-'));
  t.after(() => fs.rm(appRoot, { recursive: true, force: true }));
  await fs.mkdir(path.join(appRoot, 'js'));
  const logs = [];
  return {
    appRoot,
    logs,
    run: options => generateVoice({ appRoot, voice, corpus: entries, apiKey: fakeKey, secondaryApiKey: null, requestDelayMs: 0, sleepImpl: async () => {}, log: text => logs.push(text), ...options }),
    async manifest() {
      const context = { window: {} };
      vm.runInNewContext(await fs.readFile(path.join(appRoot, 'js/voice-manifest.js'), 'utf8'), context);
      return JSON.parse(JSON.stringify(context.window.FQ.voiceManifest));
    },
    async ledger() { return JSON.parse(await fs.readFile(path.join(appRoot, 'audio/sua/ledger.json'), 'utf8')); }
  };
}

function fakeApi({ credits = 100000, name = { eng: 'Sua', kor: '수아' }, model = 'ssfm-v30', synth, key = fakeKey, concurrency = 1 } = {}) {
  const requests = [];
  const fetchImpl = async (url, options) => {
    assert.equal(options.headers['X-API-KEY'], key);
    requests.push({ url, body: options.body ? JSON.parse(options.body) : null });
    if (url.endsWith('/v3/voices/' + voice.id)) return Response.json({ voice_name: name, models: [{ version: model }] });
    if (url.endsWith('/v1/users/me/subscription')) return Response.json({ credits: { plan_credits: credits, used_credits: 0 }, limits: { concurrency_limit: concurrency } });
    assert.ok(url.endsWith('/v1/text-to-speech'));
    const body = JSON.parse(options.body);
    if (synth) return synth(body);
    return new Response(Buffer.alloc(2048, requests.length), { headers: { 'Content-Type': 'audio/mpeg' } });
  };
  return { fetchImpl, requests, get posts() { return requests.filter(request => request.body); } };
}

const noApi = async () => { throw new Error('이 경로에서 API를 호출하면 안 됩니다.'); };

test('Sua 설정과 대표 문구는 앱에서 쓰는 고유 문구를 그대로 보존한다', () => {
  assert.equal(voice.name, 'Sua');
  assert.equal(voice.id, 'tc_6699eb5749dfac016c29445c');
  assert.equal(voice.slug, 'sua');
  assert.ok(voice.aliases.includes('수아'));
  const all = voiceCorpus();
  assert.equal(new Set(all.map(entry => entry.text)).size, all.length);
  const samples = voiceSamples(all);
  assert.deepEqual(samples.slice(0, 3).map(entry => entry.text), ['정답!', '잘했어!', '대한민국']);
  for (const entry of samples) assert.ok(all.includes(entry));
  assert.equal(samples[3].kind, 'explanation');
});

test('캐시 키는 목소리 ID·모델과 실제 발성 설정을 포함하며 표시 이름과 무관하다', () => {
  const entry = sampleCorpus[0];
  assert.equal(requestHash(voice, entry), digest(JSON.stringify(synthesisRequest(voice, entry))));
  assert.equal(keyFor(voice, entry), requestHash(voice, entry).slice(0, 24));
  assert.notEqual(keyFor(voice, entry), keyFor({ ...voice, id: 'other-voice' }, entry));
  assert.notEqual(keyFor(voice, entry), keyFor({ ...voice, model: 'ssfm-v21' }, entry));
  assert.notEqual(keyFor(voice, entry), keyFor(voice, { ...entry, kind: 'name' }));
  assert.notEqual(keyFor(voice, entry), keyFor(voice, { ...entry, kind: 'explanation' }));
  assert.notEqual(keyFor(voice, entry), keyFor(voice, { ...entry, text: '정답' }));
  assert.equal(keyFor(voice, entry), keyFor({ ...voice, name: '수아', aliases: ['수아'] }, entry));
  assert.equal(synthesisRequest(voice, entry).prompt.emotion_preset, 'happy');
  assert.equal(synthesisRequest(voice, sampleCorpus[2]).output.audio_tempo, 0.95);
});

test('전체 크레딧이 부족해도 샘플 분량만 생성하고 앱은 미완성 상태를 유지한다', async t => {
  const env = await fixture(t, voiceCorpus());
  const api = fakeApi({ credits: sampleCharacters });
  const result = await env.run({ sample: true, corpus: voiceCorpus(), fetchImpl: api.fetchImpl });
  assert.equal(api.posts.length, 4);
  assert.equal(result.missing, voiceCorpus().length - 4);
  assert.equal(result.ready, false);
  const manifest = await env.manifest();
  assert.equal(manifest.ready, false);
  assert.equal(manifest.expectedClips, voiceCorpus().length);
  assert.equal(Object.keys(manifest.clips).length, 4);
  const ledger = await env.ledger();
  for (const entry of sampleCorpus) {
    const key = keyFor(voice, entry);
    assert.equal(manifest.clips[entry.text].src, 'audio/sua/' + key + '.mp3');
    assert.equal(ledger[key].requestHash, requestHash(voice, entry));
    assert.deepEqual(api.posts.find(request => request.body.text === entry.text).body, synthesisRequest(voice, entry));
  }
  assert.ok(!env.logs.join('\n').includes(fakeKey));
});

test('샘플 재실행은 API를 호출하지 않고 본 생성도 이미 받은 샘플을 재사용한다', async t => {
  const env = await fixture(t);
  const first = fakeApi({ credits: sampleCharacters });
  await env.run({ sample: true, fetchImpl: first.fetchImpl });
  const ledgerBefore = await env.ledger();
  const repeated = await env.run({ sample: true, fetchImpl: noApi });
  assert.equal(repeated.selectedMissing, 0);
  assert.deepEqual(await env.ledger(), ledgerBefore);

  const full = fakeApi({ credits: extra.text.length });
  const result = await env.run({ fetchImpl: full.fetchImpl });
  assert.deepEqual(full.posts.map(request => request.body.text), [extra.text]);
  assert.equal(result.ready, true);
  assert.equal(result.missing, 0);
  assert.equal((await env.manifest()).ready, true);
  for (const [key, value] of Object.entries(ledgerBefore)) assert.deepEqual((await env.ledger())[key], value);
  assert.equal((await env.run({ check: true, fetchImpl: noApi })).exitCode, 0);
});

test('잔여 전체 문구의 크레딧이 부족하면 한 문장도 추가 생성하지 않는다', async t => {
  const env = await fixture(t);
  await env.run({ sample: true, fetchImpl: fakeApi({ credits: sampleCharacters }).fetchImpl });
  const api = fakeApi({ credits: extra.text.length - 1 });
  await assert.rejects(env.run({ fetchImpl: api.fetchImpl }), new RegExp('전체.*필요 문자: ' + extra.text.length));
  assert.equal(api.posts.length, 0);
  assert.equal((await env.manifest()).ready, false);
  assert.equal(Object.keys(await env.ledger()).length, 4);
});

test('--plan과 --check는 API 없이 전체 파일의 완성을 판정한다', async t => {
  const env = await fixture(t);
  assert.equal((await env.run({ plan: true, fetchImpl: noApi })).exitCode, 0);
  assert.equal((await env.run({ check: true, fetchImpl: noApi })).exitCode, 1);
  await env.run({ sample: true, fetchImpl: fakeApi().fetchImpl });
  assert.equal((await env.run({ sample: true, check: true, fetchImpl: noApi })).exitCode, 1);
});

test('해시가 다른 파일 또는 달라진 발성 설정은 완성된 음원으로 인정하지 않는다', async t => {
  const env = await fixture(t, sampleCorpus);
  await env.run({ fetchImpl: fakeApi().fetchImpl });
  assert.equal((await env.manifest()).ready, true);
  const entry = sampleCorpus[0];
  await fs.writeFile(path.join(env.appRoot, 'audio/sua', keyFor(voice, entry) + '.mp3'), Buffer.alloc(2048, 99));
  const check = await env.run({ check: true, fetchImpl: noApi });
  assert.equal(check.missing, 1);
  assert.equal(check.exitCode, 1);
  const changed = sampleCorpus.map(item => item.text === '대한민국' ? { ...item, kind: 'explanation' } : item);
  assert.equal((await env.run({ check: true, corpus: changed, fetchImpl: noApi })).missing, 2);
});

test('다른 캐릭터 또는 미지원 모델이면 유료 생성 전에 중단한다', async t => {
  const env = await fixture(t);
  for (const options of [{ name: 'Junwoo' }, { model: 'ssfm-v21' }]) {
    const api = fakeApi(options);
    await assert.rejects(env.run({ sample: true, fetchImpl: api.fetchImpl }), /이름과 지원 모델/);
    assert.equal(api.posts.length, 0);
  }
});

test('오디오가 아닌 응답과 짧은 파일은 등록하지 않으며 자동으로 재요청하지 않는다', async t => {
  const env = await fixture(t);
  for (const synth of [() => Response.json({ message: 'failed' }), () => new Response(Buffer.alloc(1000), { headers: { 'Content-Type': 'audio/mpeg' } })]) {
    const api = fakeApi({ synth });
    await assert.rejects(env.run({ sample: true, fetchImpl: api.fetchImpl }), /오디오가 아닌|비정상적으로 작습니다/);
    assert.equal(api.posts.length, 1);
    assert.equal(Object.keys((await env.manifest()).clips).length, 0);
  }
});

test('중간 네트워크 오류 뒤에도 이미 완료한 음원과 미완성 manifest를 보존한다', async t => {
  const env = await fixture(t);
  let posts = 0;
  const api = fakeApi({ synth() {
    if (++posts === 2) throw new Error('연결이 끊겼습니다.');
    return new Response(Buffer.alloc(2048, 1), { headers: { 'Content-Type': 'audio/mpeg' } });
  } });
  await assert.rejects(env.run({ sample: true, fetchImpl: api.fetchImpl }), /연결이 끊겼습니다/);
  assert.equal(api.posts.length, 2);
  const manifest = await env.manifest();
  assert.equal(manifest.ready, false);
  assert.equal(Object.keys(manifest.clips).length, 1);
  assert.equal(Object.keys(await env.ledger()).length, 1);
});

test('손상된 원장을 빈 원장으로 덮어써 중복 생성하지 않는다', async t => {
  const env = await fixture(t);
  await fs.mkdir(path.join(env.appRoot, 'audio/sua'), { recursive: true });
  await fs.writeFile(path.join(env.appRoot, 'audio/sua/ledger.json'), '{broken');
  await assert.rejects(env.run({ fetchImpl: noApi }), /원장을 읽을 수 없습니다/);
  assert.equal(await fs.readFile(path.join(env.appRoot, 'audio/sua/ledger.json'), 'utf8'), '{broken');
});

test('샘플은 두 번째 키가 있어도 primary만 검증하고 사용한다', async t => {
  const env = await fixture(t);
  const api = fakeApi({ credits: sampleCharacters });
  await env.run({ sample: true, secondaryApiKey: 'unused-secondary', fetchImpl: api.fetchImpl });
  assert.equal(api.posts.length, 4);
});

test('서로 다른 두 키의 크레딧을 예약하고 키별 동시 요청 2개를 넘지 않는다', async t => {
  const entries = Array.from({ length: 12 }, (_, index) => ({ text: '나라 ' + String(index).padStart(2, '0'), kind: 'explanation' }));
  const env = await fixture(t, entries);
  const secondKey = 'second-test-only-key';
  const active = { primary: 0, secondary: 0 }, peak = { primary: 0, secondary: 0 };
  function synth(label) {
    return async () => {
      active[label]++;
      peak[label] = Math.max(peak[label], active[label]);
      await new Promise(resolve => setTimeout(resolve, 2));
      active[label]--;
      return new Response(Buffer.alloc(2048, 1), { headers: { 'Content-Type': 'audio/mpeg' } });
    };
  }
  const primary = fakeApi({ credits: 30, concurrency: 2, synth: synth('primary') });
  const secondary = fakeApi({ key: secondKey, credits: 30, concurrency: 2, synth: synth('secondary') });
  const fetchImpl = (url, options) => (options.headers['X-API-KEY'] === fakeKey ? primary : secondary).fetchImpl(url, options);
  await env.run({ secondaryApiKey: secondKey, fetchImpl });
  assert.equal(primary.posts.length, 6);
  assert.equal(secondary.posts.length, 6);
  assert.deepEqual(peak, { primary: 2, secondary: 2 });
  assert.deepEqual(active, { primary: 0, secondary: 0 });
  const texts = [...primary.posts, ...secondary.posts].map(request => request.body.text);
  assert.equal(new Set(texts).size, entries.length);
  assert.equal(Object.keys(await env.ledger()).length, entries.length);
  assert.equal((await env.manifest()).ready, true);
  assert.ok(!env.logs.join('\n').includes(secondKey));
});

test('동일한 키를 두 번 설정해도 크레딧을 두 배로 계산하지 않는다', async t => {
  const env = await fixture(t);
  const needed = corpus.reduce((count, entry) => count + entry.text.length, 0);
  const api = fakeApi({ credits: needed - 1 });
  await assert.rejects(env.run({ secondaryApiKey: fakeKey, fetchImpl: api.fetchImpl }), /크레딧이 부족/);
  assert.equal(api.requests.filter(request => request.url.endsWith('/subscription')).length, 1);
  assert.equal(api.posts.length, 0);
});

test('secondary 목소리 검증이 실패하면 primary에도 유료 요청을 보내지 않는다', async t => {
  const env = await fixture(t);
  const secondKey = 'second-test-only-key';
  const primary = fakeApi();
  const secondary = fakeApi({ key: secondKey, name: 'Junwoo' });
  const fetchImpl = (url, options) => (options.headers['X-API-KEY'] === fakeKey ? primary : secondary).fetchImpl(url, options);
  await assert.rejects(env.run({ secondaryApiKey: secondKey, fetchImpl }), /secondary.*이름과 지원 모델/);
  assert.equal(primary.posts.length + secondary.posts.length, 0);
});

test('동시 요청 하나가 실패하면 추가 예약을 실행하지 않고 진행 중인 성공 파일은 보존한다', async t => {
  const entries = Array.from({ length: 6 }, (_, index) => ({ text: '안내 문구 ' + index, kind: 'explanation' }));
  const env = await fixture(t, entries);
  let count = 0, completed = 0;
  const api = fakeApi({ concurrency: 2, synth: async () => {
    if (++count === 1) throw new Error('네트워크 연결 중단');
    await new Promise(resolve => setTimeout(resolve, 3));
    completed++;
    return new Response(Buffer.alloc(2048, 5), { headers: { 'Content-Type': 'audio/mpeg' } });
  } });
  await assert.rejects(env.run({ fetchImpl: api.fetchImpl }), /네트워크 연결 중단/);
  assert.equal(api.posts.length, 2);
  assert.equal(completed, 1);
  assert.equal(Object.keys(await env.ledger()).length, 1);
  const manifest = await env.manifest();
  assert.equal(manifest.ready, false);
  assert.equal(Object.keys(manifest.clips).length, 1);
});

test('429 확정 거부만 Retry-After를 지켜 재시도하고 성공 음원은 한 번 저장한다', async t => {
  const env = await fixture(t, [extra]);
  const sleeps = []; let attempts = 0;
  const api = fakeApi({ synth() {
    if (++attempts === 1) return new Response('{}', {status:429,headers:{'Retry-After':'2'}});
    return new Response(Buffer.alloc(2048, 7), {headers:{'Content-Type':'audio/mpeg'}});
  }});
  const result = await env.run({fetchImpl:api.fetchImpl,sleepImpl:async ms=>sleeps.push(ms)});
  assert.equal(result.ready,true);
  assert.equal(attempts,2);
  assert.ok(sleeps.includes(2000));
  assert.equal(Object.keys(await env.ledger()).length,1);
});

test('429 재시도는 3회로 제한하고 서버 오류는 자동 재요청하지 않는다', async t => {
  for (const status of [429,500]) {
    const env = await fixture(t,[extra]);
    const api = fakeApi({synth:()=>new Response('{}',{status})});
    await assert.rejects(env.run({fetchImpl:api.fetchImpl}),new RegExp('HTTP '+status));
    assert.equal(api.posts.length,status===429?4:1);
    assert.equal((await env.manifest()).ready,false);
  }
});

test('원장 저장이 한 번 실패해도 진행 중인 성공 음원을 디스크와 manifest에 복구하고 재사용한다', async t => {
  const entries = Array.from({ length: 3 }, (_, index) => ({ text: '저장 복구 안내 ' + index, kind: 'explanation' }));
  const env = await fixture(t, entries);
  const ledgerPath = path.join(env.appRoot, 'audio/sua/ledger.json');
  const originalRename = fs.rename;
  let markBothStarted, markWriteFailed;
  const bothStarted = new Promise(resolve => { markBothStarted = resolve; });
  const writeFailed = new Promise(resolve => { markWriteFailed = resolve; });
  let renameAttempts = 0, started = 0;
  t.mock.method(fs, 'rename', async (source, destination) => {
    if (source === ledgerPath + '.tmp' && destination === ledgerPath && ++renameAttempts === 1) {
      markWriteFailed();
      throw Object.assign(new Error('원장 저장 일시 실패'), { code: 'EIO' });
    }
    return originalRename(source, destination);
  });
  const api = fakeApi({ concurrency: 2, synth: async () => {
    const index = started++;
    if (started === 2) markBothStarted();
    // 첫 저장 실패 시점에 두 번째 응답이 진행 중임을 보장한다.
    if (index === 0) await bothStarted;
    else await writeFailed;
    return new Response(Buffer.alloc(2048, index + 1), { headers: { 'Content-Type': 'audio/mpeg' } });
  } });
  await assert.rejects(env.run({ fetchImpl: api.fetchImpl }), /원장 저장 일시 실패/);
  assert.equal(api.posts.length, 2);
  assert.equal(renameAttempts, 2);
  const ledger = await env.ledger();
  const manifest = await env.manifest();
  assert.equal(manifest.ready, false);
  assert.equal(manifest.expectedClips, entries.length);
  assert.deepEqual(Object.keys(ledger).sort(), entries.slice(0, 2).map(entry => keyFor(voice, entry)).sort());
  assert.deepEqual(Object.keys(manifest.clips).sort(), entries.slice(0, 2).map(entry => entry.text).sort());
  for (const entry of entries.slice(0, 2)) {
    const key = keyFor(voice, entry);
    const bytes = await fs.readFile(path.join(env.appRoot, 'audio/sua', key + '.mp3'));
    assert.equal(ledger[key].requestHash, requestHash(voice, entry));
    assert.equal(ledger[key].sha256, digest(bytes));
    assert.equal(manifest.clips[entry.text].sha256, ledger[key].sha256);
  }
  const resumed = fakeApi({ credits: entries[2].text.length });
  assert.equal((await env.run({ fetchImpl: resumed.fetchImpl })).ready, true);
  assert.deepEqual(resumed.posts.map(request => request.body.text), [entries[2].text]);
  assert.equal(Object.keys(await env.ledger()).length, entries.length);
  assert.equal((await env.manifest()).ready, true);
});
