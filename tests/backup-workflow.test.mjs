import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

// 실제 워크플로의 브랜치 검사를 실행하되 Docker나 운영 데이터에 접근하기 전에 끝낸다.
const workflow = fs.readFileSync(new URL('../.forgejo/workflows/backup.yml', import.meta.url), 'utf8');
const guard = workflow.split('run: |')[1].split('APP=')[0];
function check(event, ref) {
  return spawnSync('bash', ['-c', guard], {
    env: { ...process.env, GITHUB_EVENT_NAME: event, GITHUB_REF: ref }, encoding: 'utf8'
  }).status;
}

test('실제 Forgejo 예약 백업의 짧은 main ref도 백업 단계로 진행한다', () => {
  assert.equal(check('schedule', 'main'), 0);
  assert.equal(check('schedule', 'refs/heads/main'), 0);
});

test('수동 백업은 main의 정규 ref에서만 진행한다', () => {
  assert.equal(check('workflow_dispatch', 'refs/heads/main'), 0);
  assert.equal(check('workflow_dispatch', 'main'), 1);
});

test('예약과 수동 백업 모두 다른 브랜치는 운영 데이터에 접근하기 전에 거부한다', () => {
  for (const event of ['schedule', 'workflow_dispatch']) {
    for (const ref of ['feature', 'refs/heads/feature', 'refs/pull/1/head', '']) {
      assert.equal(check(event, ref), 1, event + ' ' + ref);
    }
  }
});
