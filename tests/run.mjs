/* 브라우저용 스크립트를 그대로 불러와 돌리는 검사기.
 *   npm test
 * 데이터가 194개국 온전한지, 정답 판정이 나라를 헷갈리지 않는지 확인한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* --------- 아주 작은 브라우저 흉내 --------- */
const store = new Map();
const sandbox = {
  console,
  Math,
  Date,
  JSON,
  Object,
  Array,
  String,
  Number,
  Image: function () {},
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  },
  document: {
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, addEventListener() {} }),
    readyState: 'complete',
    body: { appendChild() {} }
  },
  addEventListener() {},
  requestAnimationFrame() {},
  cancelAnimationFrame() {},
  matchMedia: () => ({ matches: false }),
  scrollTo() {}
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);

for (const file of ['js/util.js', 'js/storage.js', 'data/countries.js', 'js/quiz.js']) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    console.error('✗ 파일이 없어요: ' + file);
    process.exit(1);
  }
  vm.runInContext(fs.readFileSync(full, 'utf8'), sandbox, { filename: file });
}

/** 유엔 회원국 193 + 바티칸. 목록이 바뀌면 여기도 함께 고쳐야 한다. */
const EXPECTED_COUNT = 194;

const FQ = sandbox.FQ;
const { util, quiz } = FQ;
const countries = FQ.countries;

/* --------- 검사 도구 --------- */
let pass = 0;
const failures = [];
function ok(cond, label, detail) {
  if (cond) pass++;
  else failures.push(label + (detail ? ' — ' + detail : ''));
}
function group(name, fn) {
  console.log('\n▶ ' + name);
  const before = failures.length;
  fn();
  const added = failures.length - before;
  console.log(added === 0 ? '  ✓ 통과' : '  ✗ ' + added + '건 실패');
}

const CONTINENTS = ['아시아', '유럽', '아프리카', '북아메리카', '남아메리카', '오세아니아'];

group('데이터 기본', () => {
  ok(Array.isArray(countries), '데이터가 배열이어야 함');
  ok(countries.length === EXPECTED_COUNT, EXPECTED_COUNT + '개국이어야 함', '실제 ' + countries.length);

  // 국가로 볼지 견해가 갈리는 지역은 넣지 않기로 했다
  const DISPUTED = { tw: '대만', ps: '팔레스타인', xk: '코소보', eh: '서사하라', ck: '쿡제도', nu: '니우에' };
  for (const [code, name] of Object.entries(DISPUTED)) {
    ok(!countries.some((c) => c.code === code), name + '(' + code + ') 은 넣지 않는다');
  }

  const codes = new Set();
  for (const c of countries) {
    ok(/^[a-z]{2}$/.test(c.code), 'code 형식', JSON.stringify(c.code));
    ok(!codes.has(c.code), 'code 중복 없음', c.code);
    codes.add(c.code);
    ok(typeof c.ko === 'string' && c.ko.length > 0, 'ko 있음', c.code);
    ok(typeof c.en === 'string' && c.en.length > 0, 'en 있음', c.code);
    ok(typeof c.capital === 'string' && c.capital.length > 0, 'capital 있음', c.code);
    ok(CONTINENTS.includes(c.continent), 'continent 값', c.code + ' / ' + c.continent);
    ok(typeof c.region === 'string' && c.region.length > 0, 'region 있음', c.code);
    ok([1, 2, 3].includes(c.level), 'level 1~3', c.code + ' / ' + c.level);
    ok(Array.isArray(c.aliases) && c.aliases.length >= 1, 'aliases 있음', c.code);
    ok(c.aliases.includes(c.ko), 'aliases 안에 ko 포함', c.code + ' / ' + JSON.stringify(c.aliases));
    ok(typeof c.fact === 'string' && c.fact.length >= 8, 'fact 있음', c.code);
    ok(typeof c.flagHint === 'string' && c.flagHint.length >= 8, 'flagHint 있음', c.code);
    ok(!c.flagHint.includes(c.ko), 'flagHint 에 나라 이름이 없어야 함', c.code + ' / ' + c.flagHint);
  }
});

group('국기 이미지 파일', () => {
  for (const c of countries) {
    ok(fs.existsSync(path.join(root, 'flags', c.code + '.svg')), '국기 파일 존재', c.code);
  }
  // 목록에서 뺀 나라의 국기가 남아 있으면 그대로 배포되므로 함께 확인한다
  const codes = new Set(countries.map((c) => c.code));
  const files = fs.readdirSync(path.join(root, 'flags')).filter((f) => f.endsWith('.svg'));
  for (const f of files) {
    ok(codes.has(f.replace('.svg', '')), '쓰이지 않는 국기 파일이 없어야 함', f);
  }
});

group('이름 충돌 (다른 나라와 헷갈리지 않기)', () => {
  const seen = new Map();
  for (const c of countries) {
    for (const a of c.aliases) {
      const key = util.normalize(a);
      if (seen.has(key) && seen.get(key) !== c.code) {
        failures.push('별칭 충돌: "' + a + '" → ' + seen.get(key) + ' / ' + c.code);
      } else {
        seen.set(key, c.code);
        pass++;
      }
    }
  }
});

group('정답 판정', () => {
  for (const c of countries) {
    const names = c.aliases.concat([c.en]);
    for (const n of names) {
      const r = quiz.checkText(c, n);
      ok(r.correct, '자기 이름은 정답', c.code + ' ← "' + n + '"');
    }
    // 공백/조사 섞인 입력
    ok(quiz.checkText(c, ' ' + c.ko + ' ').correct, '앞뒤 공백 허용', c.code);
  }
  ok(!quiz.checkText(quiz.byCode('kr'), '일본').correct, '다른 나라 이름은 오답');
  ok(!quiz.checkText(quiz.byCode('ne'), '나이지리아').correct, '니제르 ≠ 나이지리아');
  ok(!quiz.checkText(quiz.byCode('ng'), '니제르').correct, '나이지리아 ≠ 니제르');
  ok(!quiz.checkText(quiz.byCode('at'), '오스트레일리아').correct, '오스트리아 ≠ 오스트레일리아');
  ok(!quiz.checkText(quiz.byCode('sk'), '슬로베니아').correct, '슬로바키아 ≠ 슬로베니아');
  ok(!quiz.checkText(quiz.byCode('cg'), '콩고민주공화국').correct, '콩고공화국 ≠ 콩고민주공화국');
  ok(!quiz.checkText(quiz.byCode('do'), '도미니카 연방').correct, '도미니카공화국 ≠ 도미니카연방');
  ok(quiz.checkText(quiz.byCode('kr'), '한국').correct, '별칭 인정');
  ok(quiz.checkText(quiz.byCode('br'), '브라찔').correct, '살짝 틀리게 말해도 인정');
  ok(!quiz.checkText(quiz.byCode('kr'), '').correct, '빈 답은 오답');
});

group('오답 판정이 엉뚱한 나라로 새지 않는지', () => {
  // 각 나라의 대표 이름이 "자기 자신"과 가장 잘 맞아야 한다
  for (const c of countries) {
    const norm = util.normalize(c.ko);
    let bestScore = -1;
    let best = null;
    for (const other of countries) {
      for (const a of other.aliases.concat([other.en])) {
        const s = util.similarity(norm, util.normalize(a));
        if (s > bestScore) { bestScore = s; best = other; }
      }
    }
    ok(best.code === c.code, '가장 가까운 나라가 자기 자신', c.ko + ' → ' + best.ko);
  }
});

group('문제 만들기', () => {
  for (const mode of ['choice4', 'reverse', 'capital']) {
    for (const c of countries) {
      const q = quiz.makeQuestion(c, mode, countries);
      ok(q.options.length === 4, mode + ' 보기 4개', c.code);
      const set = new Set(q.options.map((o) => o.code));
      ok(set.size === 4, mode + ' 보기 중복 없음', c.code);
      ok(set.has(c.code), mode + ' 보기에 정답 포함', c.code);
      if (mode === 'capital') {
        const caps = new Set(q.options.map((o) => o.capital));
        ok(caps.size === 4, 'capital 보기의 수도가 서로 달라야 함', c.code);
      }
    }
  }
  // 대륙을 좁혀도 보기가 만들어져야 한다
  for (const cont of CONTINENTS) {
    const p = quiz.pool({ continent: cont, level: 'all' });
    ok(p.length >= 4, cont + ' 후보 4개 이상', String(p.length));
    const q = quiz.makeQuestion(p[0], 'choice4', p);
    ok(new Set(q.options.map((o) => o.code)).size === 4, cont + ' 보기 4개 유일');
  }
  // 오답노트가 1개뿐일 때도 보기를 채워야 한다
  const single = quiz.pool({ only: ['kr'] });
  ok(single.length === 1, 'only 필터 동작');
  const q1 = quiz.makeQuestion(single[0], 'choice4', single);
  ok(new Set(q1.options.map((o) => o.code)).size === 4, '후보가 1개여도 보기 4개');
});

group('난이도 / 대륙 필터', () => {
  const easy = quiz.pool({ level: '1' });
  const mid = quiz.pool({ level: '2' });
  const all = quiz.pool({ level: '3' });
  ok(easy.length >= 30 && easy.length <= 70, '쉬움 30~70개', String(easy.length));
  ok(mid.length > easy.length, '보통이 쉬움보다 많음', easy.length + ' → ' + mid.length);
  ok(all.length === EXPECTED_COUNT, '어려움은 전체', String(all.length));
  ok(easy.every((c) => c.level === 1), '쉬움은 level 1만');
  for (const cont of CONTINENTS) {
    ok(quiz.pool({ continent: cont }).every((c) => c.continent === cont), cont + ' 필터 정확');
  }
});

group('한 판 진행', () => {
  const g = quiz.createGame({ mode: 'choice4', count: 5, level: 'all', continent: 'all', players: ['민규'] });
  ok(g.total === 5, '문제 수 5개', String(g.total));
  ok(new Set(g.questions.map((q) => q.country.code)).size === 5, '같은 나라가 두 번 나오지 않음');
  let asked = 0;
  while (!g.isOver()) {
    const q = g.current();
    const r = g.submit({ code: q.country.code });
    ok(r.correct, '정답 제출이 정답 처리됨');
    asked++;
    g.next();
  }
  ok(asked === 5, '5문제 모두 진행', String(asked));
  ok(g.correct === 5, '5문제 정답', String(g.correct));
  ok(g.bestStreak === 5, '최고 연속 5', String(g.bestStreak));
  ok(g.score >= 50, '점수 누적', String(g.score));
  const s = g.summary();
  ok(s.wrong.length === 0, '틀린 나라 없음');
  ok(s.seconds >= 0, '소요 시간 기록');

  // 오답 경로
  const g2 = quiz.createGame({ mode: 'choice4', count: 3, players: ['민규'] });
  const q2 = g2.current();
  const wrongOpt = q2.options.find((o) => o.code !== q2.country.code);
  const r2 = g2.submit({ code: wrongOpt.code });
  ok(!r2.correct, '오답은 오답 처리');
  ok(r2.confusedWith && r2.confusedWith.code === wrongOpt.code, '고른 나라를 알려줌');
  ok(g2.streak === 0, '연속 초기화');
  ok(g2.summary().wrong.length === 1, '오답 목록에 담김');

  // 2인 대결: 차례가 번갈아 온다
  const g3 = quiz.createGame({ mode: 'choice4', count: 4, players: ['민규', '아빠'] });
  const turns = [];
  while (!g3.isOver()) {
    turns.push(g3.currentPlayer());
    g3.submit({ code: g3.current().country.code });
    g3.next();
  }
  ok(turns.join(',') === '민규,아빠,민규,아빠', '차례 번갈아', turns.join(','));
  ok(g3.summary().playerScores.every((p) => p.asked === 2), '각자 2문제씩');

  // 문항 수가 후보보다 많으면 후보 수만큼만
  const g4 = quiz.createGame({ mode: 'choice4', count: 'all', continent: '오세아니아', level: '3' });
  ok(g4.total === quiz.pool({ continent: '오세아니아', level: '3' }).length, '전부 모드 문항 수');
});

group('힌트 재료', () => {
  for (const c of countries) {
    ok(util.initialOf(c.ko).length === 1, '첫 소리 한 글자', c.ko);
    ok(util.initialOf(c.capital).length === 1, '수도 첫 소리 한 글자', c.capital);
  }
});

/* --------- 결과 --------- */
console.log('\n' + '='.repeat(52));
if (failures.length === 0) {
  console.log('✅ 검사 ' + pass + '건 모두 통과!');
  process.exit(0);
} else {
  console.log('❌ 통과 ' + pass + '건 / 실패 ' + failures.length + '건\n');
  const shown = failures.slice(0, 40);
  shown.forEach((f) => console.log('  - ' + f));
  if (failures.length > shown.length) console.log('  … 그 밖에 ' + (failures.length - shown.length) + '건');
  process.exit(1);
}
