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

for (const file of ['js/util.js', 'js/storage.js', 'data/countries.js', 'js/progress.js', 'js/quiz.js']) {
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
const { util, quiz, storage } = FQ;
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
  ok(!quiz.checkText(quiz.byCode('dm'), '도미니카공화국').correct, '도미니카연방 ≠ 도미니카공화국');
  ok(!quiz.checkText(quiz.byCode('is'), '아일랜드').correct, '아이슬란드 ≠ 아일랜드');
  ok(!quiz.checkText(quiz.byCode('ie'), '아이슬란드').correct, '아일랜드 ≠ 아이슬란드');
  ok(!quiz.checkText(quiz.byCode('gw'), '기니').correct, '기니비사우 ≠ 기니');
  ok(!quiz.checkText(quiz.byCode('gq'), '기니').correct, '적도기니 ≠ 기니');
  ok(!quiz.checkText(quiz.byCode('gn'), '기니비사우').correct, '기니 ≠ 기니비사우');
  ok(!quiz.checkText(quiz.byCode('cd'), '콩고공화국').correct, '콩고민주공화국 ≠ 콩고공화국');
  ok(!quiz.checkText(quiz.byCode('in'), '인도네시아').correct, '인도 ≠ 인도네시아');
  ok(!quiz.checkText(quiz.byCode('gh'), '차드').correct, '가나 ≠ 차드');
  ok(!quiz.checkText(quiz.byCode('td'), '가나').correct, '차드 ≠ 가나');
  ok(!quiz.checkText(quiz.byCode('kp'), '대한민국').correct, '북한 ≠ 대한민국');
  ok(quiz.checkText(quiz.byCode('kr'), '한국').correct, '별칭 인정');
  ok(quiz.checkText(quiz.byCode('br'), '브라찔').correct, '살짝 틀리게 말해도 인정');
  ok(!quiz.checkText(quiz.byCode('kr'), '').correct, '빈 답은 오답');
});

group('아이가 말한 그대로 인정하기', () => {
  // 두 번 말하기, 앞뒤에 다른 말, 조사, 살짝 틀린 발음, 여러 낱말로 끊어 말하기
  const ACCEPT = [
    ['br', '브라질 브라질'], ['br', '브라질 브라질 브라질'], ['br', '브라질브라질'],
    ['br', '음 그러니까 브라질이요'], ['br', '브라찔'], ['br', '음 브라찔이요'],
    ['br', '브라질입니다'], ['br', '정답은 브라질'], ['br', '어 브라질 맞나?'],
    ['fr', '프랑스 프랑스요'], ['fr', '프랑쓰'],
    ['ph', '피리핀'], ['ph', '필리핀 필리핀'],
    ['nl', '네델란드'], ['kr', '한국 한국'], ['kr', '대한민국이요'],
    ['us', '미국이요'], ['us', '미국 미국'], ['us', '어 미국!'], ['us', '미쿡'],
    ['jp', '일본 일본이요'], ['jp', '일번'], ['th', '태국이요'],
    ['eg', '이집트 이집트'], ['au', '호주 호주요'], ['tr', '터키요'],
    ['id', '인도네시아 인도네시아'], ['in', '인도 인도'], ['in', '인도요'],
    ['gh', '가나요'], ['pe', '페루 페루'], ['ca', '캐나다 캐나다'],
    ['om', '오만이요'], ['to', '통가요'], ['ni', '니카라과요'],
    // 여러 낱말로 끊어 말한 이름
    ['za', '남아프리카 공화국'], ['ae', '아랍 에미리트'], ['pg', '파푸아 뉴기니'],
    ['ba', '보스니아 헤르체고비나'], ['kn', '세인트 키츠 네비스']
  ];
  for (const [code, said] of ACCEPT) {
    ok(quiz.checkText(quiz.byCode(code), said).correct, '인정해야 함', code + ' ← "' + said + '"');
  }

  // 모른다고 하거나 무엇인지 물어보는 말 — 답과 국기 특징을 알려 주고 넘어간다
  const GIVE_UP = [
    '몰라요', '모릅니다', '모르겠어요', '모르겠습니다', '몰라', '아 나 모르겠어', '기억 안 나', '생각이 안 나',
    '이거 뭐지요?', '이게 뭔가요', '이게 뭐예요?',
    '이건 뭘까', '뭐지', '뭐야', '어느 나라야', '어디지', '무슨 나라예요',
    '답이 뭐야', '정답이 뭐지', '알려줘', '가르쳐 주세요',
    '패스', '다음', '넘어가요', '스킵'
  ];
  for (const said of GIVE_UP) {
    ok(quiz.isGiveUp(said), '넘어가기로 받아야 함', said);
  }
  // 나라 이름은 넘어가기로 새지 않아야 한다
  for (const c of countries) {
    ok(!quiz.isGiveUp(c.ko), '나라 이름은 넘어가기가 아님', c.ko);
  }
});

group('받아쓰기가 로마자로 적어 보낸 경우', () => {
  // 아이패드·아이폰 받아쓰기는 "시리아" 를 시리 호출로 알아듣고 "Siri야" 로 적어 보낸다.
  // 실제로 아이패드에서 나온 문제라 로마자를 한글 소리로 옮겨 견준다.
  const SIRI = ['Siri야', 'siri야', 'Siri 야', 'SIRI야', '시리야', 'Syria'];
  for (const said of SIRI) {
    ok(quiz.checkText(quiz.byCode('sy'), said).correct, '시리아로 인정해야 함', said);
  }
  ok(util.latinToJamo('Siri야') === util.compareKey('시리야'), '로마자를 한글 소리로 옮김',
    util.latinToJamo('Siri야'));
  // 로마자가 없으면 건드리지 않는다
  ok(util.latinToJamo('시리아') === util.compareKey('시리아'), '한글은 그대로 분해');
  // 영어 이름을 그대로 말해도 인정한다
  for (const [code, said] of [['br', 'Brazil'], ['jp', 'Japan'], ['fr', 'France'], ['gh', 'Ghana']]) {
    ok(quiz.checkText(quiz.byCode(code), said).correct, '영어 이름 인정', code + ' ← ' + said);
  }
});

group('웅얼거림은 나라 이름으로 잡히지 않아야 한다', () => {
  // 말하기 모드는 마이크를 계속 열어 두므로, 아이와 부모의 평소 말이 그대로 들어온다.
  // 이런 말이 나라 이름으로 잡히면 엉뚱하게 오답 처리된다.
  const FILLER = [
    '음 그러니까 뭐지', '어… 저기', '아 알겠다', '그거 뭐더라', '아니 잠깐만', '음', '어', '아', '아 진짜', '우와 멋있다',
    '다시 해볼래', '잠깐만요', '어렵다', '쉽다', '아 맞다',
    '생각났어', '기다려', '하나만 더', '재밌다', '또 할래',
    '엄마 이거 봐', '내가 맞췄어', '우와 신기해', '아 진짜 어렵다', '저기요',
    '있잖아', '그게 아니고', '아 알 것 같아', '조금만 기다려',
    '너무 어려워', '한 번 더', '아이고', '아하', '으음', '에이', '치', '와', '앗', '오',
    '그래', '응', '아니야', '맞아', '좋아', '싫어', '배고파', '졸려',
    '하나 둘 셋', '빨리빨리', '그만할래', '아 그거', '이제 알았다'
  ];
  for (const said of FILLER) {
    const hit = quiz.findCountry(said);
    ok(!hit, '나라 이름이 아니어야 함', '"' + said + '" → ' + (hit ? hit.ko : ''));
  }
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

group('말 안에서 이름 찾기 (containsDistance)', () => {
  const d = (a, b) => util.containsDistance(util.compareKey(a), util.compareKey(b));
  ok(d('브라질 브라질', '브라질') === 0, '두 번 말해도 거리 0');
  ok(d('음 그러니까 브라질이요', '브라질') === 0, '앞뒤에 다른 말이 붙어도 거리 0');
  ok(d('브라찔', '브라질') === 1, '한 글자 틀리면 거리 1');
  ok(d('니제르', '나이지리아') > 3, '니제르와 나이지리아는 멀어야 함', String(d('니제르', '나이지리아')));
  ok(d('오스트리아', '오스트레일리아') > 3, '오스트리아와 오스트레일리아는 멀어야 함');
  ok(d('', '브라질') === util.compareKey('브라질').length, '빈 말은 이름 길이만큼 멀다');
});

group('보상 체계', () => {
  const P = FQ.progress;

  // 별
  ok(P.starsFor(10, 10) === 3, '다 맞히면 별 셋');
  ok(P.starsFor(9, 10) === 3, '90%면 별 셋');
  ok(P.starsFor(7, 10) === 2, '70%면 별 둘');
  ok(P.starsFor(4, 10) === 1, '40%면 별 하나');
  ok(P.starsFor(3, 10) === 0, '30%면 별 없음');
  ok(P.starsFor(0, 0) === 0, '문제가 없으면 별 없음');

  // 여행 상자는 누적 학습 카드 5장마다
  ok(P.chestOpensAt(5) && P.chestOpensAt(10) && P.chestOpensAt(15), '5·10·15장에 열림');
  ok(!P.chestOpensAt(0) && !P.chestOpensAt(4) && !P.chestOpensAt(6), '그 밖에는 안 열림');
  ok(P.chestProgress(3).left === 2, '3장이면 두 장 남음');
  ok(P.chestProgress(5).left === 5, '열린 직후에는 다시 다섯 장');

  // 연속으로 맞힐수록 경험치를 더 준다
  ok(P.xpFor(1) === 10, '기본 경험치 10');
  ok(P.xpFor(3) > P.xpFor(2), '3연속부터 더 받음');
  ok(P.xpFor(7) > P.xpFor(5), '7연속부터 더 받음');

  // 레벨은 다섯 단계, 경험치가 쌓이면 올라간다
  ok(P.LEVELS.length === 5, '레벨 다섯 단계');
  const start = P.level();
  ok(start.number === 1 && start.into === 0, '처음에는 레벨 1');
  P.addXp(P.LEVELS[1].from);
  ok(P.level().number === 2, '경험치를 채우면 레벨 2');
  P.addXp(P.LEVELS[4].from);
  const top = P.level();
  ok(top.number === 5 && top.isMax && top.ratio === 1, '마지막 레벨에서는 가득 참');

  // 스티커는 "한 번이라도 맞힌 나라"
  // 앞의 검사들이 이미 몇 나라를 맞혀 두었으므로, 아직 안 맞힌 나라를 골라 확인한다
  const before = P.stickers();
  ok(before.total === countries.length, '스티커 칸은 나라 수와 같다', String(before.total));
  const target = countries.find((c) => !P.hasSticker(c.code));
  ok(!!target, '아직 못 얻은 스티커가 남아 있다');
  if (target) {
    ok(!P.hasSticker(target.code), '아직 못 얻은 스티커');
    FQ.storage.recordAnswer(target.code, true);
    ok(P.hasSticker(target.code), '맞히면 스티커를 얻는다');
    const after = P.stickers();
    ok(after.owned === before.owned + 1, '모은 개수가 하나 늘어난다',
      before.owned + ' → ' + after.owned);
    ok(after.byContinent[target.continent].owned >= 1, '대륙별로도 세어진다');
  }

  // 하루 도전
  const d = P.daily();
  ok(d.target === 5 && d.done === 0, '오늘의 도전은 5개로 시작');
  ok(['아시아','유럽','아프리카','북아메리카','남아메리카','오세아니아'].includes(d.continent),
    '오늘의 대륙이 정해진다', d.continent);
  ok(P.continentForDay('2026-09-10') === P.continentForDay('2026-09-10'), '같은 날은 같은 대륙');
  const mine = countries.find((c) => c.continent === d.continent);
  const other = countries.find((c) => c.continent !== d.continent);
  P.noteDaily(other, true);
  ok(P.daily().done === 0, '다른 대륙은 도전에 안 들어감');
  for (let i = 0; i < 4; i++) P.noteDaily(mine, true);
  ok(P.daily().done === 4 && !P.daily().complete, '네 개까지는 진행 중');
  ok(P.noteDaily(mine, true) === true, '다섯 번째에서 도전 완료');
  ok(P.daily().complete, '완료로 남는다');
  ok(P.noteDaily(mine, true) === false, '완료 뒤에는 더 오르지 않음');
  ok(P.noteDaily(mine, false) === false, '틀린 답은 도전에 안 들어감');
});

group('오답노트 졸업', () => {
  // 복습 한 판을 다 맞혔는데 개수가 그대로면 아이 입장에서는 아무 일도 없던 것과 같다.
  // 한 번 맞히면 목록에서는 빠지되, 가중치는 두 번 연속까지 계속 높게 남아야 한다.
  storage.resetProgress();
  const code = countries[0].code;
  storage.recordAnswer(code, false);
  ok(storage.wrongList().indexOf(code) !== -1, '틀리면 오답노트에 들어간다');
  const wAfterWrong = storage.weightOf(code);
  storage.recordAnswer(code, true);
  ok(storage.wrongList().indexOf(code) === -1, '한 번 맞히면 오답노트에서 빠진다');
  ok(storage.weightOf(code) > 1.2, '그래도 아직은 자주 나온다 (완전히 놓아주지 않는다)');
  storage.recordAnswer(code, true);
  ok(storage.weightOf(code) <= 1.2, '두 번 연속 맞히면 그제서야 보통 빈도로 내려온다');
  ok(wAfterWrong > storage.weightOf(code), '틀린 직후가 가장 자주 나온다');
  storage.recordAnswer(code, false);
  ok(storage.wrongList().indexOf(code) !== -1, '다시 틀리면 오답노트로 돌아온다');
  storage.resetProgress();
});

group('보물상자 보너스 점수', () => {
  // 상자 화면이 '보너스 별 +5점' 이라 적어 놓고 점수를 안 올리던 것을 막는다.
  const g = quiz.createGame({ mode: 'choice4', level: '1', continent: 'all', count: 3, players: ['민규'] });
  const before = g.score;
  g.addBonus(5);
  ok(g.score === before + 5, '보너스가 점수에 실제로 더해진다');
  ok(g.bonusScore === 5, '보너스만 따로도 셈한다');
  ok(g.playerScores[0].score === before + 5, '지금 차례인 사람 점수에도 더해진다');
  g.addBonus(0);
  ok(g.score === before + 5, '0점은 아무것도 바꾸지 않는다');
  g.addBonus(-3);
  ok(g.score === before + 5, '음수는 무시한다');
  ok(g.summary().bonusScore === 5, '결과에도 실려 나간다');
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
