/* 그림이 보류된 소재(그림 없음)를 앱과 배포 게이트가 같은 기준으로 다루는지 본다.
 * 전량 공개 때는 실제 원장에 보류가 0건일 수 있으므로, 이 계약은 승인 소재 하나에 noArt를
 * 주입한 독립 fixture로 검증한다. 실제 원장은 별도 전량 공개 게이트가 검사한다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { checkArtSet } from '../scripts/lib/art-gate.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const AXIS = { symbol: 'symbol', landmark: 'place' };
const DIR = { symbol: 'symbols', place: 'places' };
const ledger = JSON.parse(fs.readFileSync(path.join(root, 'docs/image-prompts/presets.json'), 'utf8'));
const approved = ledger.items.filter((item) => item.status === 'approved-image').map((item) => ({ code: item.code, axis: AXIS[item.kind] }));
const fileOf = ({ code, axis }) => 'images/' + DIR[axis] + '/' + code + '.webp';

function makeHeldFixture(f) {
  const item = approved[0];
  assert.ok(item, '보류 동작을 검증할 승인 소재가 없다');
  f.subjects[item.code][item.axis].noArt = true;
  return item;
}

function loadQuiz() {
  const c = { console, Math }; c.window = c; vm.createContext(c);
  for (const f of ['js/util.js', 'data/countries.js', 'data/subjects.js', 'data/confusion-groups.js', 'js/quiz.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), c);
  }
  return c.FQ;
}

function loadCard() {
  let modal;
  const saved = new Map();
  const c = {
    localStorage: { getItem: (key) => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) },
    document: {
      addEventListener() {}, querySelector: (sel) => sel === '.modal-back' ? modal : null,
      body: { appendChild: (el) => { modal = el; } },
      createElement: () => ({ addEventListener() {}, querySelector: () => null })
    }
  };
  c.window = c; vm.createContext(c);
  for (const f of ['js/storage.js', 'js/features.js', 'data/countries.js', 'data/subjects.js', 'js/ui.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), c);
  }
  c.FQ.quiz = { LEVEL_LABEL: {} };
  c.FQ.audio = { stopSpeaking() {} };
  return { f: c.FQ, render(code) { c.FQ.ui.countryModal(c.FQ.countries.find((x) => x.code === code)); return modal.innerHTML; } };
}

test('보류한 소재의 나라는 그림 모드의 정답에도 오답 보기에도 오르지 않는다', () => {
  const f = loadQuiz();
  const { code, axis } = makeHeldFixture(f);
  // 보류는 자료가 빈 것이 아니다. 문장은 있는데 그림 파일만 없어 아이가 빈 그림을 보고 못 푼다.
  assert.ok(f.subjects[code][axis], code + ' ' + axis + ' 소재 문장이 사라졌다');
  assert.ok(!f.quiz.pool({ axis }).some((c) => c.code === code), '정답 출제 풀에 보류국이 있다: ' + code);
  const answer = f.quiz.pool({ axis })[0];
  const heldCountry = f.quiz.byCode(code);
  const full = f.countries.slice();
  // source 를 비우면 후보가 모자라 반드시 fallbackPool 경로를 탄다.
  for (let i = 0; i < 50; i++) {
    for (const c of f.quiz.distractors(answer, 3, [], axis, { axis })) {
      assert.notEqual(c.code, code, '오답 폴백에 보류국이 올라왔다: ' + code);
    }
  }
  // 목록까지 굶기면 혼동군 완화 분기도 탄다. 보기가 모자랄지언정 보류국을 끌어오면 안 된다.
  f.countries = [answer, heldCountry].concat(full.filter((c) => !f.subjects[c.code] || !f.subjects[c.code][axis]).slice(0, 3));
  try {
    for (let i = 0; i < 50; i++) {
      for (const c of f.quiz.distractors(answer, 3, [], axis, { axis })) {
        assert.notEqual(c.code, code, '굶주림 완화 분기에서 보류국이 올라왔다: ' + code);
      }
    }
  } finally { f.countries = full; }
});

test('보류한 소재는 도감에서 그림 없이 이름만 남는다', () => {
  const { f, render } = loadCard();
  const { code, axis } = makeHeldFixture(f);
  const name = f.subjects[code][axis].ko;
  const html = render(code);
  const mine = (html.match(/<figure class="country-art">[\s\S]*?<\/figure>/g) || []).filter((x) => x.includes(name));
  assert.equal(mine.length, 1, '보류 소재의 이름이 도감에서 사라졌다: ' + code + ' ' + name);
  assert.ok(!mine[0].includes('<img'), '보류 소재에 깨진 그림이 붙었다: ' + code);
  assert.ok(!html.includes(fileOf({ code, axis })), '보류 소재의 그림 경로가 남아 있다: ' + code);
  assert.equal(f.ui.artFor(code, axis), null);
  // 대조군 — 승인된 소재는 그대로 그림이 나온다.
  const fresh = loadCard();
  const sample = approved.find((candidate) => candidate.code !== code || candidate.axis !== axis);
  assert.ok(fresh.render(sample.code).includes('<img src="' + fileOf(sample) + '"'), '승인 그림이 도감에서 사라졌다: ' + sample.code);
  assert.equal(fresh.f.ui.artFor(sample.code, sample.axis).src, fileOf(sample));
});

test('그림 게이트는 원장이 승인한 수만 통과시키고 누락과 보류 위반을 거부한다', (t) => {
  const f = loadQuiz();
  const codes = f.countries.map((c) => c.code);
  assert.ok(ledger.items.every((item) => item.status === 'approved-image' || item.status === 'held'), '원장에 승인도 보류도 아닌 항목이 생겼다');

  // ① 지금 이 저장소가 전량 공개 게이트를 그대로 통과한다.
  const now = checkArtSet(root, f.subjects, codes, true);
  assert.deepEqual(now.errors, []);
  assert.equal(now.counts.symbol + now.counts.place, approved.length);

  // 게이트는 파일 이름만 보므로 이름만 옮긴 사본으로 누락·위반을 만들어 본다.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fq-art-hold-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  for (const dir of Object.values(DIR)) {
    fs.mkdirSync(path.join(tmp, 'images', dir), { recursive: true });
    for (const name of fs.readdirSync(path.join(root, 'images', dir))) fs.writeFileSync(path.join(tmp, 'images', dir, name), '');
  }
  assert.deepEqual(checkArtSet(tmp, f.subjects, codes, true).errors, [], '이름만 옮긴 사본부터 통과해야 뒤의 실패가 주입한 것이라고 말할 수 있다');

  // ② 보류가 아닌 그림 하나가 사라지면 전량 공개를 막는다.
  const victim = approved[0];
  fs.unlinkSync(path.join(tmp, fileOf(victim)));
  assert.deepEqual(checkArtSet(tmp, f.subjects, codes, true).errors, ['필요한 그림 없음: ' + DIR[victim.axis] + '/' + victim.code + '.webp']);
  assert.deepEqual(checkArtSet(tmp, f.subjects, codes).errors, [], '공개 전에는 아직 없는 그림을 나무라지 않는다');
  fs.writeFileSync(path.join(tmp, fileOf(victim)), '');

  // ③ 보류한 자리에 그림이 생기면 원장이 낡은 것이다. 공개 여부와 상관없이 막는다.
  const item = makeHeldFixture(f);
  const message = '보류한 소재의 그림: ' + DIR[item.axis] + '/' + item.code + '.webp';
  for (const required of [false, true]) {
    const result = checkArtSet(tmp, f.subjects, codes, required);
    assert.deepEqual(result.errors, [message]);
    assert.equal(result.counts.symbol + result.counts.place, approved.length - 1, '보류한 그림을 공개 수에 넣었다');
  }
});

test('보류 소재도 이름은 남는다 — 해설·결과 줄이 빈칸이 되지 않는다', () => {
  const { f } = loadCard();
  const item = makeHeldFixture(f);
  assert.equal(f.ui.artFor(item.code, item.axis), null, '보류인데 그림 경로를 만든다: ' + item.code);
  assert.ok(f.ui.artAlt(item.code, item.axis), '보류 소재의 이름까지 사라졌다: ' + item.code);
  // 그림이 있는 소재는 둘 다 이름이 나오고 서로 어긋나지 않는다.
  const withArt = approved.find((candidate) => candidate.code !== item.code || candidate.axis !== item.axis);
  assert.equal(f.ui.artAlt(withArt.code, withArt.axis), f.ui.artFor(withArt.code, withArt.axis).alt);
});

test('그림 없는 나라가 그림 문제로 그려져도 화면이 죽지 않는다', () => {
  // 옛 자료와 새 화면이 캐시에 섞여 굳으면 닿을 수 있는 자리다. 여기서 예외가 나면
  // 아이가 시작을 눌러도 화면이 멈춘 채 아무 일도 일어나지 않는다.
  const { f } = loadCard();
  const item = makeHeldFixture(f);
  const q = { mode: item.axis === 'place' ? 'place' : 'symbol', country: { code: item.code } };
  assert.doesNotThrow(() => {
    const art = f.ui.artFor(q.country.code, q.mode);
    // app.js 가 하는 그대로: 그림이 없으면 img 를 만들지 않는다.
    const html = art ? '<img src="' + art.src + '" alt="' + art.alt + '">' : '<div id="art-error"></div>';
    assert.ok(html.indexOf('<img') === -1, '그림이 없는데 img 태그를 만든다');
  });
});
