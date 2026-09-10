/* Typecast 원음을 미리 생성한다. API 키는 op run으로 이 프로세스에만 전달한다.
 * --plan: 필요한 문구와 누락 목록 저장, --check: 배포 가능 여부 검사
 * --sample: 실제 문구 4개만 생성, 기본 실행: 설정한 목소리로 누락 파일 생성
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { voiceCorpus, voiceSamples, root } from './voice-corpus.mjs';

export const digest = data => crypto.createHash('sha256').update(data).digest('hex');

export async function loadVoiceConfig(appRoot = root) {
  const voice = JSON.parse(await fs.readFile(path.join(appRoot, 'data/voice-config.json'), 'utf8'));
  if (!voice.name || !voice.id || !voice.model || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(voice.slug || '') ||
      !Array.isArray(voice.aliases) || !voice.aliases.length || voice.aliases.some(name => typeof name !== 'string' || !name.trim())) {
    throw new Error('음성 설정의 이름·별칭·ID·모델·폴더를 확인하세요.');
  }
  return voice;
}

// 캐시 키와 API 호출이 반드시 같은 요청 객체를 사용한다.
export function synthesisRequest(voice, entry) {
  return {
    voice_id: voice.id, model: voice.model, language: 'kor', text: entry.text,
    prompt: {
      emotion_type: 'preset', emotion_preset: entry.kind === 'cheer' ? 'happy' : 'normal',
      emotion_intensity: entry.kind === 'cheer' ? 1 : 0.5
    },
    output: { audio_format: 'mp3', audio_tempo: entry.kind === 'name' ? 0.95 : 1, target_lufs: -18 },
    seed: 42
  };
}

export const requestHash = (voice, entry) => digest(JSON.stringify(synthesisRequest(voice, entry)));
export const keyFor = (voice, entry) => requestHash(voice, entry).slice(0, 24);
const characters = entries => entries.reduce((count, entry) => count + entry.text.length, 0);

export async function generateVoice({
  appRoot = root, voice, corpus = voiceCorpus(), sample = false, plan = false, check = false,
  apiKey = process.env.TYPECAST_API_KEY, secondaryApiKey = process.env.TYPECAST_API_KEY_SECONDARY,
  fetchImpl = globalThis.fetch, log = console.log,
  requestDelayMs = 500, sleepImpl = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
  voice ||= await loadVoiceConfig(appRoot);
  const outputDir = path.join(appRoot, 'audio', voice.slug);
  const manifestPath = path.join(appRoot, 'js/voice-manifest.js');
  const ledgerPath = path.join(outputDir, 'ledger.json');
  const selected = sample ? voiceSamples(corpus) : corpus;
  let ledger;
  try { ledger = JSON.parse(await fs.readFile(ledgerPath, 'utf8')); }
  catch (error) {
    // 원장이 손상된 상태에서 새로 생성하면 이미 받은 음원을 중복 과금할 수 있다.
    if (error.code !== 'ENOENT') throw new Error('음성 원장을 읽을 수 없습니다. ledger.json을 확인하세요.');
    ledger = {};
  }
  await fs.mkdir(outputDir, { recursive: true });

  async function available(entry) {
    const key = keyFor(voice, entry), item = ledger[key];
    if (!item || item.text !== entry.text || item.voiceId !== voice.id || item.requestHash !== requestHash(voice, entry)) return false;
    try {
      const file = await fs.readFile(path.join(outputDir, key + '.mp3'));
      return file.length > 1000 && digest(file) === item.sha256;
    } catch { return false; }
  }

  async function publishManifest() {
    // 완료 판정은 디스크에 남은 원장 기준이다. 메모리에만 남은 기록으로 활성화하지 않는다.
    try { ledger = JSON.parse(await fs.readFile(ledgerPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; ledger = {}; }
    const clips = {}, missing = [];
    for (const entry of corpus) {
      if (await available(entry)) {
        const key = keyFor(voice, entry);
        clips[entry.text] = { src: 'audio/' + voice.slug + '/' + key + '.mp3', sha256: ledger[key].sha256 };
      } else missing.push(entry);
    }
    const metadata = { name: voice.name, id: voice.id, model: voice.model };
    const manifest = { voice: metadata, ready: missing.length === 0, expectedClips: corpus.length, clips };
    await fs.writeFile(manifestPath, '/* 자동 생성: npm run voice:plan. 전체 음원 준비 후에만 활성화한다. */\nwindow.FQ = window.FQ || {};\nwindow.FQ.voiceManifest = ' + JSON.stringify(manifest, null, 2) + ';\n');
    await fs.writeFile(path.join(outputDir, 'pending.json'), JSON.stringify({ voice: metadata, count: missing.length, characters: characters(missing), entries: missing }, null, 2) + '\n');
    return missing;
  }

  const pending = await publishManifest();
  const selectedTexts = new Set(selected.map(entry => entry.text));
  const work = pending.filter(entry => selectedTexts.has(entry.text));
  const summary = {
    voice: voice.name, ready: !pending.length, total: corpus.length,
    missing: pending.length, characters: characters(pending),
    mode: sample ? 'sample' : 'full', selectedMissing: work.length, selectedCharacters: characters(work)
  };
  log(JSON.stringify(summary));
  if (plan) return { ...summary, exitCode: 0 };
  if (check) return { ...summary, exitCode: pending.length ? 1 : 0 };
  if (!work.length) return { ...summary, exitCode: 0 };
  if (!apiKey) throw new Error('1Password 참조로 실행하세요: npm run voice:generate');

  // 같은 키가 두 변수에 들어 있어도 크레딧을 이중으로 계산하지 않는다.
  const credentials = [{ label: 'primary', key: apiKey }];
  if (!sample && secondaryApiKey && secondaryApiKey !== apiKey) credentials.push({ label: 'secondary', key: secondaryApiKey });
  let requestStart = Promise.resolve();
  async function api(credential, endpoint, body) {
    for (let attempt = 0; ; attempt++) {
      // 서로 다른 계정도 같은 연결에서 순간적으로 몰리지 않게 요청 시작을 나눈다.
      requestStart = requestStart.then(() => sleepImpl(requestDelayMs));
      await requestStart;
      const response = await fetchImpl('https://api.typecast.ai' + endpoint, {
        method: body ? 'POST' : 'GET',
        headers: { 'X-API-KEY': credential.key, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(90000)
      });
      if (response.status === 429 && attempt < 3) {
        const retry = response.headers.get('retry-after');
        const parsed = retry == null ? NaN : (/^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now());
        const delay = Number.isFinite(parsed) ? Math.max(500, parsed) : 5000 * Math.pow(2, attempt);
        log('요청 제한 [' + credential.label + ']: ' + Math.ceil(delay / 1000) + '초 뒤 재시도 (' + (attempt + 1) + '/3)');
        await response.arrayBuffer();
        // 429는 생성이 거부된 확정 응답에 한해서만 재시도한다. 네트워크/5xx는 그대로 중단한다.
        for (let remaining = delay; remaining > 0; remaining -= 60000) await sleepImpl(Math.min(60000, remaining));
        continue;
      }
      if (!response.ok) throw new Error('Typecast ' + credential.label + ' HTTP ' + response.status + ' (' + endpoint + ')');
      return response;
    }
  }

  let remainingPending = pending;
  try {
    for (const credential of credentials) {
      // 사용하는 키마다 지정한 캐릭터와 지원 모델이 일치할 때만 생성한다.
      const detail = await (await api(credential, '/v3/voices/' + voice.id)).json();
      const names = typeof detail.voice_name === 'string' ? [detail.voice_name] : Object.values(detail.voice_name || {});
      const aliases = new Set(voice.aliases.map(name => name.trim().toLowerCase()));
      if (!names.some(name => typeof name === 'string' && aliases.has(name.trim().toLowerCase())) ||
          !detail.models?.some(model => model.version === voice.model)) {
        throw new Error(credential.label + ': ' + voice.name + ' 이름과 지원 모델을 확인하지 못했습니다. 생성하지 않았습니다.');
      }
      const subscription = await (await api(credential, '/v1/users/me/subscription')).json();
      const credits = subscription.credits || {};
      credential.remaining = credits.plan_credits - credits.used_credits;
      if (!Number.isFinite(credential.remaining) || credential.remaining < 0) {
        throw new Error(credential.label + ': 잔여 크레딧을 확인할 수 없습니다.');
      }
      // API가 밝힌 키별 한도를 지킨다. 한도가 없으면 한 건씩 요청한다.
      const limit = Number(subscription.limits?.concurrency_limit);
      credential.concurrency = sample || !Number.isFinite(limit) ? 1 : Math.max(1, Math.min(2, Math.floor(limit)));
      credential.jobs = [];
      log(JSON.stringify({ account: credential.label, credits: credential.remaining, concurrency: credential.concurrency }));
    }
    const needed = characters(work);
    const remaining = credentials.reduce((count, credential) => count + credential.remaining, 0);
    if (!Number.isFinite(remaining) || remaining < needed) {
      throw new Error((sample ? '샘플' : '전체') + ' 생성에 필요한 크레딧이 부족하거나 잔여량을 확인할 수 없습니다. 필요 문자: ' + needed);
    }

    // 동시 요청을 시작하기 전에 문장별 크레딧을 예약한다. 한 문장은 한 키에서 완결한다.
    for (const entry of work) {
      const credential = credentials.find(account => account.remaining >= entry.text.length);
      if (!credential) throw new Error('문장 하나를 생성할 크레딧이 남은 키가 없습니다. 생성하지 않았습니다.');
      credential.remaining -= entry.text.length;
      credential.jobs.push(entry);
    }

    let failed = false;
    let writeLedger = Promise.resolve();
    const workers = [];
    async function worker(credential) {
      while (!failed && credential.jobs.length) {
        const entry = credential.jobs.shift();
        try {
          const key = keyFor(voice, entry);
          // 응답이 불확실해도 다른 키로 재요청하지 않는다.
          const response = await api(credential, '/v1/text-to-speech', synthesisRequest(voice, entry));
          if (!/^audio\//.test(response.headers.get('content-type') || '')) throw new Error('오디오가 아닌 응답입니다.');
          const bytes = Buffer.from(await response.arrayBuffer());
          if (bytes.length <= 1000) throw new Error('음성 파일이 비정상적으로 작습니다.');
          await fs.writeFile(path.join(outputDir, key + '.mp3'), bytes);
          ledger[key] = {
            text: entry.text, kind: entry.kind, voiceId: voice.id, model: voice.model,
            requestHash: requestHash(voice, entry), sha256: digest(bytes)
          };
          // 여러 요청이 끝나도 원장 쓰기는 직렬화하고 임시 파일을 원자적으로 교체한다.
          writeLedger = writeLedger.catch(() => {}).then(async () => {
            await fs.writeFile(ledgerPath + '.tmp', JSON.stringify(ledger, null, 2) + '\n');
            await fs.rename(ledgerPath + '.tmp', ledgerPath);
          });
          await writeLedger;
          log('생성 완료 [' + credential.label + ']: ' + entry.text);
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    }
    for (const credential of credentials) {
      const count = Math.min(credential.concurrency, credential.jobs.length);
      for (let i = 0; i < count; i++) workers.push(worker(credential));
    }
    // 실패한 뒤에도 이미 진행 중인 요청의 저장이 끝난 후 manifest를 검사한다.
    const results = await Promise.allSettled(workers);
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
  } finally {
    remainingPending = await publishManifest();
  }
  return {
    ...summary, ready: !remainingPending.length, missing: remainingPending.length,
    characters: characters(remainingPending), selectedMissing: 0, selectedCharacters: 0, exitCode: 0
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await generateVoice({
      sample: process.argv.includes('--sample'), plan: process.argv.includes('--plan'), check: process.argv.includes('--check')
    });
    process.exitCode = result.exitCode;
  } catch (error) {
    // 응답 전문과 키는 로그에 남기지 않는다.
    console.error(error.message);
    process.exitCode = 1;
  }
}
