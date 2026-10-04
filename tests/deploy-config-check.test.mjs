/* 실제 Compose 해석과 stdin CLI로 배포 설정 검사·입력 제한·비밀 출력 차단을 검증한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { MAX_CONFIG_BYTES, PrivateConfigCheckError, checkPrivateComposeConfig, readPrivateComposeConfig } from '../scripts/check-private-config.mjs';

const script = fileURLToPath(new URL('../scripts/check-private-config.mjs', import.meta.url));
const compose = fileURLToPath(new URL('../deploy/compose.prod.yml', import.meta.url));
const workflow = fileURLToPath(new URL('../.forgejo/workflows/deploy.yml', import.meta.url));
const secret = 'fixture secret with # $ and " quotes; never output';
const environment = overrides => ({
  AUTH_PROVIDER: 'techjuice-id', PUBLIC_ORIGIN: 'https://flagquiz.test',
  TJID_SUPABASE_URL: 'https://identity.test', TJID_SUPABASE_ANON_KEY: 'sb_publishable_fixture',
  TJID_APP_SLUG: 'flagquiz', TJID_GOOGLE_ENABLED: 'false', TRUSTED_PROXY_IPS: '172.19.0.3',
  SESSION_SECRET: secret, GROQ_API_KEY: 'fixture_groq_$dollar#hash',
  HOST: '0.0.0.0', PORT: '8090', STATE_DIR: '/var/lib/flagquiz', STATIC_ROOT: '/app/_site',
  ...overrides
});
const document = overrides => ({ services: { web: { environment: Object.fromEntries(Object.entries(environment(overrides))
  .map(([name, value]) => [name, typeof value === 'string' ? value.replaceAll('$', () => '$$') : value])) } } });
const cli = (input, args = []) => spawnSync(process.execPath, ['--no-warnings', script, ...args], { input, encoding: 'utf8' });
async function directory(t) {
  const value = await fs.mkdtemp(path.join(os.tmpdir(), 'flagquiz-deploy-config-'));
  t.after(() => fs.rm(value, { recursive: true, force: true }));
  return value;
}
function rejected(value) {
  assert.throws(() => checkPrivateComposeConfig(value), error => {
    assert.ok(error instanceof PrivateConfigCheckError);
    assert.equal(error.message, 'Private config check failed');
    assert.equal(error.cause, undefined);
    return true;
  });
}

test('Compose web 환경만 검사하고 다른 서비스와 부모 환경 값을 인증 설정에 쓰지 않는다', () => {
  const value = document();
  value.services.backup = { environment: { SESSION_SECRET: 'not-valid', GROQ_API_KEY: '' } };
  assert.deepEqual(checkPrivateComposeConfig(value), { ok: true });
  for (const name of ['PUBLIC_ORIGIN', 'TJID_SUPABASE_URL', 'TJID_SUPABASE_ANON_KEY', 'SESSION_SECRET', 'STATE_DIR', 'GROQ_API_KEY']) {
    rejected(document({ [name]: '' }));
  }
});

test('서비스·환경 JSON 형태가 잘못되거나 문자열이 아닌 값이면 차단한다', () => {
  for (const value of [null, [], {}, { services: [] }, { services: {} }, { services: { web: null } },
    { services: { web: { environment: [] } } }, { services: { web: { environment: {} } } }]) rejected(value);
  for (const value of [null, true, 8090, {}, []]) rejected(document({ PORT: value }));
  const inherited = Object.create(environment());
  rejected({ services: { web: { environment: inherited } } });
});

test('실제 readConfig와 같은 URL·인증·경로·포트·프록시 규칙으로 미완성 설정을 차단한다', () => {
  for (const overrides of [
    { AUTH_PROVIDER: 'invalid' }, { PUBLIC_ORIGIN: 'http://flagquiz.test' },
    { PUBLIC_ORIGIN: 'https://flagquiz.test/path' }, { SESSION_SECRET: 'too-short' },
    { STATE_DIR: 'relative' }, { STATE_DIR: '/app/_site/private' }, { PORT: '70000' },
    { TRUSTED_PROXY_IPS: '172.19.0.0/16' }, { TJID_SUPABASE_URL: 'https://identity.test/path' },
    { TJID_SUPABASE_ANON_KEY: 'sb_secret_forbidden' }, { TJID_APP_SLUG: 'FlagQuiz' },
    { GROQ_API_KEY: 'op://fixture/secret/key' }, { SESSION_SECRET: '"op://fixture/secret/session"' }
  ]) rejected(document(overrides));
});

test('Compose 출력의 $$를 한 번 복원하고 실제 비밀의 바이트 길이를 검사한다', () => {
  assert.deepEqual(checkPrivateComposeConfig(document({ SESSION_SECRET: '$'.repeat(32), GROQ_API_KEY: 'fixture$$groq' })), { ok: true });
  rejected(document({ SESSION_SECRET: '$'.repeat(16) }));
  const noncanonical = document();
  noncanonical.services.web.environment.SESSION_SECRET = secret;
  rejected(noncanonical);
});

test('JSON 입력은 UTF-8 바이트 기준 64KiB 이하이고 초과한 뒤 다음 chunk를 읽지 않는다', async () => {
  const json = JSON.stringify(document());
  assert.deepEqual(await readPrivateComposeConfig(Readable.from([json.padEnd(MAX_CONFIG_BYTES, ' ')])), { ok: true });
  let chunksRead = 0;
  async function* oversized() {
    chunksRead++; yield Buffer.from(json);
    chunksRead++; yield Buffer.alloc(MAX_CONFIG_BYTES);
    chunksRead++; yield Buffer.from('not-read');
  }
  await assert.rejects(readPrivateComposeConfig(oversized()), PrivateConfigCheckError);
  assert.equal(chunksRead, 2);
  await assert.rejects(readPrivateComposeConfig(Readable.from(['한'.repeat(MAX_CONFIG_BYTES / 2)])), PrivateConfigCheckError);
  for (const input of ['', '{broken', 'null', '[]']) {
    await assert.rejects(readPrivateComposeConfig(Readable.from([input])), PrivateConfigCheckError);
  }
  await assert.rejects(readPrivateComposeConfig(Readable.from([Buffer.from([0xff])])), PrivateConfigCheckError);
});

test('CLI는 성공·실패 한 줄만 출력하고 값·예외·argv를 출력하지 않는다', () => {
  const good = cli(JSON.stringify(document()));
  assert.equal(good.status, 0); assert.equal(good.stdout, '운영 설정 검사 통과\n'); assert.equal(good.stderr, '');
  for (const result of [
    cli(JSON.stringify(document({ PUBLIC_ORIGIN: secret }))),
    cli(JSON.stringify(document({ GROQ_API_KEY: 'op://fixture/secret/key' }))),
    cli('{"private":"' + secret + '"'),
    cli(JSON.stringify(document()).padEnd(MAX_CONFIG_BYTES + 1, ' ')),
    cli(JSON.stringify(document()), [secret])
  ]) {
    assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.equal(result.stderr, '운영 설정 검사 실패\n');
    assert.equal((result.stdout + result.stderr).includes(secret), false);
  }
});

test('설정 검사는 서버나 운영 데이터 디렉터리를 만들지 않는다', async t => {
  const parent = await directory(t), state = path.join(parent, 'uncreated-state');
  const result = cli(JSON.stringify(document({ STATE_DIR: state })));
  assert.equal(result.status, 0);
  assert.deepEqual(await fs.readdir(parent), []);
});

test('표준 quoted dotenv는 Compose 해석 후 그대로 사전 검사를 통과한다', async t => {
  const probe = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) { t.skip('Docker Compose CLI가 없는 환경'); return; }
  const parent = await directory(t), envFile = path.join(parent, '.env');
  const values = environment();
  await fs.writeFile(envFile, Object.entries(values).map(([name, value]) => name + "='" + value + "'").join('\n') + '\n', { mode: 0o600 });
  const result = spawnSync('docker', ['compose', '--env-file', envFile, '-p', 'flagquiz-config-test', '-f', compose, 'config', '--format', 'json'], {
    encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, APP: 'flagquiz', TAG: 'a'.repeat(12) }, maxBuffer: MAX_CONFIG_BYTES
  });
  assert.equal(result.status, 0, 'fixture Compose JSON 생성이 성공해야 한다');
  const canonical = JSON.parse(result.stdout);
  assert.equal(canonical.services.web.environment.SESSION_SECRET, secret.replaceAll('$', () => '$$'));
  assert.equal(canonical.services.web.environment.GROQ_API_KEY, values.GROQ_API_KEY.replaceAll('$', () => '$$'));
  assert.equal(canonical.services.web.environment.PUBLIC_ORIGIN, values.PUBLIC_ORIGIN);
  const checked = cli(result.stdout);
  assert.equal(checked.status, 0); assert.equal(checked.stdout, '운영 설정 검사 통과\n'); assert.equal(checked.stderr, '');
  assert.deepEqual(await fs.readdir(parent), ['.env']);
});

async function runDeploymentFixture(t, scenario) {
  const parent = await directory(t), bin = path.join(parent, 'bin'), deploy = path.join(parent, 'deploy');
  await fs.mkdir(bin); await fs.mkdir(deploy); await fs.copyFile(compose, path.join(deploy, 'compose.prod.yml'));
  const commands = path.join(parent, 'commands.jsonl');
  // 실제 워크플로의 bash를 실행하고 Docker의 공개 상태만 모의한다. 설정 CLI는 실제 코드로 실행한다.
  const mock = `#!${process.execPath}
const fs = require('node:fs');
const {spawnSync} = require('node:child_process');
const args = process.argv.slice(2), s = JSON.parse(process.env.FQ_WORKFLOW_SCENARIO);
fs.appendFileSync(process.env.FQ_WORKFLOW_COMMANDS, JSON.stringify(args)+'\\n');
const error = () => { console.error('fixture-private-error-never-print'); process.exit(1); };
if (args[0]==='compose' && args.includes('config')) {
  if (args.includes('--quiet') && s.quietFails) error();
  if (args.includes('--format')) {
    const canonical = ${JSON.stringify(document())};
    if (s.configFails) canonical.services.web.environment.GROQ_API_KEY='';
    console.log(JSON.stringify(canonical));
    if (s.producerFails) error();
  }
}
if (args[0]==='run' && args.includes('scripts/check-private-config.mjs')) {
  const checked = spawnSync(${JSON.stringify(process.execPath)},['--no-warnings',${JSON.stringify(script)}],{input:fs.readFileSync(0),encoding:'utf8'});
  process.stdout.write(checked.stdout); process.stderr.write(checked.stderr); process.exit(checked.status);
}
if (args[0]==='ps' && s.oldImage) console.log('flagquiz:111111111111');
if (args[0]==='volume' && args[1]==='inspect' && s.volume!=='present') error();
if (args[0]==='volume' && args[1]==='ls') {
  if (!args.includes('name=^flagquiz-data$')) error();
  if (s.volume==='daemon') error();
  if (s.volume==='hidden') console.log('flagquiz-data');
}
if (args[0]==='run' && args.includes('scripts/check-private-state.mjs')) process.exit(s.stateExit || 0);
if (args[0]==='image' && args[1]==='inspect') console.log('1'.repeat(40));
if (args[0]==='compose' && args.includes('run') && s.backupFails) process.exit(1);
if (args[0]==='compose' && args.includes('up')) {
  const countFile = process.env.FQ_WORKFLOW_COMMANDS+'.count';
  const count = fs.existsSync(countFile) ? Number(fs.readFileSync(countFile))+1 : 1;
  fs.writeFileSync(countFile,String(count));
  if ((s.upFails && count===1) || s.rollbackFails) process.exit(1);
}
`;
  await fs.writeFile(path.join(bin, 'docker'), mock, { mode: 0o700 });
  const lines = (await fs.readFile(workflow, 'utf8')).split('\n');
  const start = lines.findIndex(line => line.trim() === 'run: |'); assert.ok(start >= 0);
  const body = lines.slice(start + 1).map(line => line.slice(10)).join('\n');
  const result = spawnSync('bash', [], { cwd: parent, input: body, encoding: 'utf8', env: {
    PATH: bin + path.delimiter + process.env.PATH, GITHUB_REF: 'refs/heads/main',
    GITHUB_REPOSITORY: 'techjuice/flagquiz', GITHUB_SHA: 'a'.repeat(40),
    APP_ENV_FILE: 'fixture-only-not-a-real-secret', FQ_WORKFLOW_SCENARIO: JSON.stringify(scenario), FQ_WORKFLOW_COMMANDS: commands
  } });
  const calls = (await fs.readFile(commands, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert.equal((result.stdout + result.stderr).includes('fixture-private-error-never-print'), false);
  assert.equal((result.stdout + result.stderr).includes(secret), false);
  assert.equal((await fs.readdir(deploy)).includes('.env'), false);
  return { result, calls };
}
const isUp = call => call[0] === 'compose' && call.includes('up');
const isBackup = call => call[0] === 'compose' && call.includes('run');

test('기존 운영 이미지가 있으면 데이터 볼륨 조회 실패를 첫 배포로 처리하지 않는다', async t => {
  for (const volume of ['absent', 'daemon', 'hidden']) {
    const { result, calls } = await runDeploymentFixture(t, { oldImage: true, volume });
    assert.equal(result.status, 1); assert.match(result.stderr, /운영 데이터 볼륨 확인 실패/);
    assert.equal(calls.some(isUp), false); assert.equal(calls.some(isBackup), false);
    assert.equal(calls.some(call => call[0] === 'volume' && call[1] === 'ls'), false);
  }
});

test('첫 배포도 목록 API가 볼륨 부재를 확인해야 초기화하고 daemon·조회 오류면 중단한다', async t => {
  const absent = await runDeploymentFixture(t, { volume: 'absent' });
  assert.equal(absent.result.status, 0); assert.equal(absent.calls.filter(isUp).length, 1);
  assert.equal(absent.calls.some(isBackup), false);
  assert.ok(absent.calls.some(call => call[0] === 'volume' && call[1] === 'ls'));
  for (const volume of ['daemon', 'hidden']) {
    const { result, calls } = await runDeploymentFixture(t, { volume });
    assert.equal(result.status, 1); assert.match(result.stderr, /운영 데이터 볼륨 확인 실패/);
    assert.equal(calls.some(isUp), false); assert.equal(calls.some(isBackup), false);
  }
});

test('설정·producer·백업·기존 데이터 검사가 실패하면 서비스를 교체하지 않는다', async t => {
  for (const overrides of [{ quietFails: true }, { configFails: true }, { producerFails: true }, { backupFails: true }, { stateExit: 1 }, { stateExit: 3 }]) {
    const { result, calls } = await runDeploymentFixture(t, { oldImage: true, volume: 'present', ...overrides });
    assert.equal(result.status, 1); assert.equal(calls.some(isUp), false);
    if (overrides.quietFails || overrides.configFails || overrides.producerFails) {
      assert.equal(calls.some(call => call[0] === 'volume'), false);
    }
  }
});

test('이미지 복귀는 백업 뒤 실패한 새 배포에만 실행하고 실패한 이미지를 latest로 만들지 않는다', async t => {
  const rollback = await runDeploymentFixture(t, { oldImage: true, volume: 'present', upFails: true });
  assert.equal(rollback.result.status, 1);
  assert.equal(rollback.calls.filter(isUp).length, 2); assert.equal(rollback.calls.filter(isBackup).length, 1);
  assert.equal(rollback.calls.some(call => call[0] === 'tag'), false);
  assert.ok(rollback.calls.findIndex(isBackup) < rollback.calls.findIndex(isUp));
  const first = await runDeploymentFixture(t, { volume: 'absent', upFails: true });
  assert.equal(first.result.status, 1); assert.equal(first.calls.filter(isUp).length, 1);
  assert.ok(first.calls.some(call => call[0] === 'compose' && call.includes('stop')));
  assert.equal(first.calls.some(call => call[0] === 'tag'), false);
});
