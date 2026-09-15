# 이미지 프롬프트 키트 (FQ-IMG-v1)

GPT 계열 이미지 도구에 그대로 붙여넣어 쓰는 프롬프트 모음이다.

> **화풍은 아직 확정 전이다.** 후보 두 가지가 아래 A/B로 있고, 둘 중 하나를 고른 뒤에
> 본 생성에 들어간다. 나중에 바꾸면 이미 만든 장수를 전부 다시 뽑아야 한다.

---

## 0. 왜 프롬프트보다 표가 먼저인가

사실 오류와 소재 부적절은 그림이 아니라 **주제 한 문장**에서 결정된다.
그림을 먼저 만들면 틀린 것을 예쁘게 그리게 된다. 순서는 이렇다.

```
표 194행 작성 → 아빠가 표만 승인(20분) → 기준 그림 확정(30분)
  → 파일럿 8~12장 + 민규 반응 확인 → 본 생성 10장/30분
```

아빠 승인은 CSV의 '한국어 주제 한 줄'만 보고 한다. 여기서 걸러진 오류는 이미지 한 장 값을 통째로 아낀다.

---

## 1. 무엇을 그릴 것인가 — 소재 선정 규칙

### 상징물

【정의】국가 상징물 = "그 나라가 스스로 자기 표식으로 삼은 것" 중, 만 4세가 이름 없이 그림만 보고 다른 카드와 구별할 수 있는 것. 이 두 조건을 동시에 만족해야 한다. "유명한 것"이 아니라 "그 나라가 고른 것"이라는 기준이 고정관념 방어의 핵심 장치다.

【선정 우선순위 — 위에서부터 찾고, 없으면 내려간다】
1순위. 그 나라 국기에 실제로 그려진 사물·생물 — 실측 36개국(부탄 용, 레바논 백향목, 캄보디아 사원, 멕시코 독수리와 뱀과 선인장, 스리랑카 사자, 키프로스 올리브, 과테말라 케찰, 도미니카연방 앵무, 파푸아뉴기니 극락조, 키리바시 군함조, 아이티 야자, 벨리즈 마호가니, 에콰도르 콘도르, 짐바브웨 짐바브웨새, 우간다 회색관두루미, 산마리노 탑 세 개 등). 민규가 국기를 이미 90% 외웠으므로 전이가 즉시 일어난다. 이 앱에서만 쓸 수 있는 자산이고, "왜 하필 그걸 골랐냐"는 반박이 원천 차단된다.
2순위. 공식 지정 국조·국화·국수(國獸)·국목 — 법·헌법·국장에 명시된 것만.
3순위. 그 나라 국장(coat of arms)에 있는 요소.
4순위. 그 나라 사람이 매일 먹고 입고 타는 것 중 세계적으로 그 나라와 1:1로 묶이는 것(김치, 초밥, 피자, 바게트, 툭툭, 이층버스, 풍차, 레고).
5순위. 위 넷으로 안 되는 나라만 자연물(사막·빙하·화산·산호초).

【나라당 개수】"대표 1개 고정 + 예비 2개"가 정답. 이유 셋. (a) 만 4세는 쌍연합학습으로 배우므로 나라:상징 = 1:1이 아니면 학습이 안 된다. 국기가 194개 전부 달라서 민규가 외울 수 있었던 것과 같은 이유다. (b) 예비 2개는 중복 충돌 해소용 — 예를 들어 사자가 스리랑카·케냐·에티오피아·싱가포르 넷에 걸리면 1:1이 깨지므로 셋을 예비로 밀어야 한다. (c) quiz.js:52-55의 capital 특례와 같은 방식으로 "보기 4개의 상징물이 서로 달라야 한다"는 불변식을 걸려면 대표값이 유일해야 한다.

【4세 인지 가능 여부 판정법 — 성인 직관 금지】3단 필터.
필터1(형태): 실루엣만 검정으로 칠했을 때 다른 193장과 구별되는가. 돔·기둥·유리빌딩·일반 새는 여기서 전부 탈락한다.
필터2(선행지식): 민규가 이미 아는 사물의 범주에 들어가는가 — 동물, 먹을거리, 탈것, 옷, 꽃, 집. 추상 기념비·기하학 조형물·현대 조각은 탈락.
필터3(실측): 라벨을 가리고 민규에게 보여준 뒤 "이게 뭐야"라고 묻는다. 사물 이름을 못 대면 탈락. 나라 이름까지 댈 필요는 없다 — 사물을 알아보는 것이 전제 조건이고, 나라 연결은 앱이 가르칠 몫이다.
1·2는 책상에서 걸러지지만 3은 아이 없이는 판정 불가다. 아래 등급표도 필터1·2까지만 적용한 추정이며, 필터3 실측은 파일럿 12장으로 먼저 해야 한다.

【고정관념 차단 규칙 — 숫자로 강제】
규칙A. 어느 대륙에서도 한 카테고리가 25%를 넘지 못한다. 아프리카 54개국의 동물 카테고리는 최대 10개국(18.5%)까지만.
규칙B. 아프리카에서 동물을 쓰려면 그 동물이 그 나라 국기·국장·공식 국수에 실제로 있어야 한다. 짐바브웨(국기 속 짐바브웨새), 우간다(국기 속 회색관두루미), 잠비아(국기 속 물수리), 케냐(국기 속 방패 — 사자는 국장), 에스와티니(국기 속 방패), 보츠와나(국장 얼룩말)까지가 안전선이다. "아프리카 하면 코끼리·기린·사자"라는 이유만으로 고른 것은 전부 탈락.
규칙C. 아프리카 54개국의 나머지 44개국은 식물·열매 14(코트디부아르·가나 카카오, 에티오피아 커피, 튀니지·알제리 대추야자, 마다가스카르 바닐라, 세네갈 바오바브, 감비아 땅콩), 먹을거리 8, 만든 것 10(가나 켄테 천, 말리 진흙 건축, 모로코 타일, 이집트 파피루스), 입는 것·춤 7, 땅과 하늘 5로 배분한다.
규칙D. 어느 나라에도 "가난·원조·맨발·초가집" 도상을 넣지 않는다. GPT 계열 이미지 도구는 아프리카·태평양 국가명을 넣으면 이 도상을 기본값으로 뱉을 확률이 높으므로, 프롬프트에 "현대적인 일상 장면, 밝고 깨끗함"을 명시하고 부정 프롬프트로 막아야 한다.
규칙E. 유럽·북미에도 같은 상한을 적용한다. 유럽 45개국을 전부 성·대성당으로 채우는 것도 같은 종류의 게으름이다.

**카테고리 체계**

- 동물 — 국기·국장·공식 국수에 실제로 있는 것만. 목표 45개국(23%). 예: 부탄 용, 스리랑카 사자, 멕시코 독수리, 파푸아뉴기니 극락조, 도미니카연방 시서루앵무, 과테말라 케찰, 짐바브웨 짐바브웨새, 우간다 회색관두루미, 오스트레일리아 캥거루, 중국 판다, 뉴질랜드 키위새, 페루 비쿠냐, 캐나다 비버
- 식물·꽃·열매 — 목표 40개국(21%). 4세가 '먹는 것/꽃'으로 이미 아는 범주라 인지율이 높다. 예: 레바논 백향목, 네덜란드 튤립, 일본 벚꽃, 캐나다 단풍잎, 코트디부아르·가나 카카오, 에티오피아 커피 열매, 튀니지 대추야자, 마다가스카르 바닐라, 브라질 커피, 콜롬비아 커피, 감비아 땅콩, 벨리즈 마호가니, 아이티 야자나무
- 먹을거리 — 목표 35개국(18%). 만 4세에게 가장 강한 카테고리다. 예: 한국 김치, 일본 초밥, 이탈리아 피자, 프랑스 바게트, 멕시코 타코, 인도 커리와 난, 태국 팟타이, 베트남 쌀국수, 스위스 치즈, 벨기에 와플, 터키 케밥, 모로코 타진. 주의: 술(프랑스 와인·조지아 와인·체코 맥주·아일랜드 맥주)과 담배(쿠바 시가)는 4세 콘텐츠에서 전면 제외
- 만든 것·탈것 — 목표 30개국(15%). 예: 네덜란드 풍차, 영국 이층버스, 태국 툭툭, 이탈리아 곤돌라, 덴마크 레고, 스위스 시계, 가나 켄테 천, 페루 판초 직물, 몽골 게르, 파나마 운하 갑문, 노르웨이 바이킹배, 인도네시아 바틱
- 입는 것·춤·놀이 — 목표 22개국(11%). 예: 한국 한복·태권도, 일본 기모노, 인도 사리, 브라질 삼바와 축구공, 아르헨티나 탱고, 스페인 플라멩코, 스코틀랜드가 아닌 아일랜드는 하프, 리투아니아 농구공(fact에 이미 있음), 뉴질랜드 하카. 주의: 사람 얼굴을 클로즈업하지 않고 옷·소품 중심으로 그린다
- 땅과 하늘 — 목표 22개국(11%). 위 다섯으로 안 되는 나라의 마지막 수단. 예: 아이슬란드 오로라, 나미비아 붉은 사막, 몰디브 산호초와 물 위 다리, 칠레 아타카마, 투발루·키리바시 환초, 네팔 설산, 보츠와나 습지, 사우디 사막 별밤

### 수도 랜드마크 — 커버리지 실측

【결론 숫자】194개 수도 중, 만 4세가 그림만 보고 다른 카드와 구별할 수 있는 랜드마크가 실제로 있는 곳은 17개국(8.8%)이다. 기준을 크게 낮춰 "형태는 뚜렷하지만 비슷한 것과 헷갈릴 수 있는 것"까지 넣어도 48개국(24.7%)이다. 나머지 146개국(75.3%)은 없다.

【S등급 7개국 — 실루엣만으로 즉시 구별, 4세가 이미 봤을 가능성도 있음】
파리(프랑스) 에펠탑 / 런던(영국) 빅벤과 빨간 이층버스 / 로마(이탈리아) 콜로세움 / 카이로(이집트) 피라미드와 스핑크스 / 모스크바(러시아) 성바실리 대성당 양파돔 / 베이징(중국) 천안문과 자금성 / 서울(대한민국) 경복궁 — 서울은 객관적 지명도가 아니라 민규가 실제로 가 본 곳이라는 이유로 S다.

【A등급 10개국 — 형태는 뚜렷, 몇 번 보면 4세도 구별】
도쿄(일본) 도쿄타워 — 단 에펠탑과 형태가 거의 같아 혼동 위험 최대 / 쿠알라룸푸르(말레이시아) 페트로나스 쌍둥이탑 / 싱가포르 머라이언과 마리나베이샌즈 / 방콕(태국) 황금 뾰족탑 사원 / 브뤼셀(벨기에) 아토미움 / 코펜하겐(덴마크) 인어공주와 니하운 색색집 / 아테네(그리스) 파르테논 / 암스테르담(네덜란드) 운하집과 자전거 / 멕시코시티(멕시코) 소칼로 대성당 / 워싱턴 D.C.(미국) 백악관 — 자유의 여신상이 아니다.

【B등급 31개국 — 건물은 있으나 4세에겐 "비슷한 것 중 하나"】
아시아 11: 바쿠(불꽃타워), 팀부(황금 대불), 반다르스리브가완(황금돔 모스크), 뉴델리(인도문), 예루살렘(바위돔·초민감), 아스타나(바이테렉), 쿠웨이트시티(쿠웨이트타워), 비엔티안(파탓루앙), 카트만두(눈 그려진 스투파), 이슬라마바드(파이살 모스크), 아부다비(셰이크자이드 모스크)
유럽 10: 빈, 프라하, 헬싱키, 베를린, 바티칸시티, 부다페스트, 파두츠, 리스본(노란 트램), 산마리노(탑 세 개), 키이우
아프리카 5: 야무수크로(세계 최대 성당), 나이로비(도시 옆 국립공원), 라바트(하산탑), 다카르(아프리카 르네상스 기념상), 튀니스(시디부사이드 파랑하양 마을)
아메리카 5: 오타와, 아바나(올드카와 색색 건물), 파나마시티(운하 갑문), 부에노스아이레스(오벨리스코·카미니토), 키토(적도 기념비)

【C등급 146개국 — 4세 기준 랜드마크 없음】
대륙별로 아시아 29, 유럽 27, 아프리카 48, 북아메리카 18, 남아메리카 10, 오세아니아 14.
아빠가 예로 든 빈트후크(나미비아)·모로니(코모로)·야무수크로는 실제로 여기 또는 경계선에 있다. 더 중요한 사실 둘.
첫째, 오세아니아 14개국은 예외 없이 전부 C다. 캔버라(오스트레일리아), 웰링턴(뉴질랜드), 수바, 아피아, 누쿠알로파, 푸나푸티, 포트빌라, 호니아라, 포트모르즈비, 타라와, 마주로, 야렌, 팔리키르, 응게룰무드. 이 대륙에서 랜드마크 모드로 낼 수 있는 나라가 0개다.
둘째, 아프리카 54개국 중 48개국이 C다. 그리고 이 둘은 우연이 아니라 "아이가 아는 유명 이미지"가 곧 "관광 마케팅이 강한 곳"이기 때문에 생기는 편향이다.

【이 수치를 믿을 수 있는가 — 한계 명시】
등급은 성인인 내가 실루엣 유일성과 4세의 선행 범주 두 가지로 판정한 것이고, 민규 실측이 아니다. 실측하면 아래로 내려갈 확률이 높다. 특히 A·B 등급은 "어른이 보면 다르지만 아이가 보면 다 비슷한 건물"이 섞여 있어 실제로는 S 7개국 + 서울을 제외한 A 몇 개만 남을 가능성이 있다. 그래서 파일럿 12장을 먼저 그려 민규에게 라벨 없이 보여주는 절차가 등급표보다 우선한다.

| 등급 | 나라 수 | 예시 |
|---|---|---|
| S | 7 | 파리(프랑스) 에펠탑, 런던(영국) 빅벤·빨간 이층버스, 로마(이탈리아) 콜로세움, 카이로(이집트) 피라미드·스핑크스 |
| A | 10 | 도쿄(일본) 도쿄타워 — 에펠탑과 혼동 위험 최대, 쿠알라룸푸르(말레이시아) 페트로나스 쌍둥이탑, 싱가포르 머라이언·마리나베이샌즈, 방콕(태국) 황금 첨탑 사원 |
| B | 31 | 바쿠(아제르바이잔) 불꽃타워, 아스타나(카자흐스탄) 바이테렉, 쿠웨이트시티 쿠웨이트타워, 카트만두(네팔) 눈 그려진 스투파 |
| C | 146 | 오세아니아 14개국 전부 — 캔버라·웰링턴·수바·아피아·누쿠알로파·푸나푸티·포트빌라·호니아라·포트모르즈비·타라와·마주로·야렌·팔리키르·응게룰무드, 아프리카 48개국 — 빈트후크·모로니·와가두구·은자메나·기테가·방기·말라보·누악쇼트·주바 등, 계획도시라 볼 것이 없는 곳 — 네피도(미얀마), 아부자(나이지리아), 브라질리아(브라질), 도도마(탄자니아), 유명 도시가 따로 있어 수도가 비는 곳 — 앙카라(이스탄불), 마드리드(바르셀로나), 베른(체르마트), 리마(쿠스코) |
| X | 45 | 미국 자유의여신상→뉴욕 (아빠 예시 그 자체), 오스트레일리아 오페라하우스→시드니, 브라질 예수상→리우, 인도 타지마할→아그라 |

**등급별 처리**

- **S** (7개국 · 4세가 그림만 보고 즉시 구별. 형태가 세계에 하나뿐) — 파일럿 12장의 핵심. 이 7장을 먼저 그려 스타일을 확정하고, 라벨을 가린 채 민규에게 보여 '이게 뭐야'를 물어 등급표 전체의 타당성을 검증한다. 여기서 못 맞히면 아래 등급은 전부 무의미하므로 랜드마크 축을 접는다.
- **A** (10개국 · 형태는 뚜렷, 몇 번 보면 4세도 구별. 학습 대상) — 1차 출시 대상. 도쿄↔파리, 아테네↔로마는 같은 판에 함께 내지 않도록 quiz.js distractors()에 배제 규칙을 추가한다. 페트로나스·머라이언·쿠웨이트타워는 이미 fact에 문장이 있어 음원 추가 없이 해설이 붙는다.
- **B** (31개국 · 건물은 있으나 4세에겐 비슷한 것 중 하나(돔·기둥·마천루)) — 2차 대상이되 조건부. 이 31개 중 돔·마천루·기념비류는 실측에서 대량 탈락할 것으로 본다. 그림을 랜드마크 그대로가 아니라 '그 도시의 한 장면'으로 그려 색·소품(노란 트램, 올리드카, 파랑하양 벽)을 전면에 두면 인지율이 올라간다. 예루살렘은 등급과 무관하게 빼고 사해나 올리브로 대체.
- **C** (146개국 · 4세 기준 랜드마크 없음) — 랜드마크 모드에서 전면 제외한다. 이 146개국은 상징물 모드로 194칸 스티커판을 채운다. 억지로 그림을 만들면 '없는 것을 있는 것처럼' 가르치게 되고, 특히 오세아니아 14/14와 아프리카 48/54가 전부 빠지면 민규는 '아프리카와 태평양은 볼 게 없는 곳'이라고 배운다 — 이것이 이 기획의 가장 큰 교육적 위험이다. 랜드마크 모드를 내려면 대륙 균형이 맞는 축(상징물)과 반드시 짝으로 내야 한다.
- **X** (45개국 · 교차 표시: 아이가 아는 그 나라 대표 이미지가 수도에 없는 나라(위 등급과 별개로 중복 카운트)) — 이 45개국 때문에 '수도 = 랜드마크' 전제가 성립하지 않는다. 더구나 countries.js의 fact 최소 16개가 이미 이 함정을 가르치고 있고 음원까지 녹음돼 있다(인도→타지마할 data/countries.js:27, 스위스→알프스 :105 등). 축을 '그 나라 대표 명소'로 바꾸면 45개국 함정이 전부 해소되고 기존 fact 16개가 정답 해설로 재사용되어 음성 추가가 0개가 된다.
**랜드마크 선정 규칙**

【아빠 예시가 정확히 무엇을 드러내는가】"뉴욕 자유의 여신상"은 실수가 아니라 이 기획의 구조적 결함을 그대로 보여준 예다. 어른이 "미국" 하면 떠올리는 이미지와 "미국의 수도"는 애초에 같은 도시가 아니다. 그리고 이건 미국만의 문제가 아니라 최소 45개국에서 똑같이 일어난다.

【실측 45개국 — 아이가 알 만한 그 나라 대표 이미지가 수도에 없다】
미국 자유의여신상→뉴욕(수도 워싱턴 D.C.) / 오스트레일리아 오페라하우스→시드니(캔버라) / 브라질 예수상→리우데자네이루(브라질리아) / 튀르키예 아야소피아→이스탄불(앙카라) / 인도 타지마할→아그라(뉴델리) / 스페인 사그라다파밀리아→바르셀로나(마드리드) / 스위스 마터호른→체르마트(베른) / 아랍에미리트 부르즈할리파→두바이(아부다비) / 캄보디아 앙코르와트→시엠레아프(프놈펜) / 미얀마 쉐다곤파고다→양곤(네피도) / 탄자니아 킬리만자로·세렝게티→아루샤(도도마) / 남아프리카공화국 테이블마운틴→케이프타운(프리토리아) / 페루 마추픽추→쿠스코(리마) / 칠레 모아이→이스터섬(산티아고, 3,500km 밖) / 뉴질랜드 밀포드사운드→남섬(웰링턴) / 독일 노이슈반슈타인→퓌센(베를린) / 모로코 마라케시 시장→마라케시(라바트) / 요르단 페트라→와디무사(암만) / 네팔 에베레스트→솔루쿰부(카트만두) / 볼리비아 우유니→우유니(수크레) / 베네수엘라 앙헬폭포→카나이마(카라카스) / 잠비아·짐바브웨 빅토리아폭포→리빙스턴·빅토리아폴스(루사카·하라레) / 스리랑카 콜롬보→수도는 스리자야와르데네푸라코테 / 베냉 코토누→포르토노보 / 코트디부아르 아비장→야무수크로 / 나이지리아 라고스→아부자 / 베트남 하롱베이→꽝닌(하노이) / 인도네시아 발리→덴파사르(자카르타) / 파키스탄 K2→길기트(이슬라마바드) / 에콰도르 갈라파고스→제도(키토) / 에티오피아 랄리벨라→랄리벨라(아디스아바바) / 우즈베키스탄 사마르칸트→사마르칸트(타슈켄트) / 과테말라 티칼→페텐(과테말라시티) / 멕시코 치첸이트사→유카탄(멕시코시티) / 네덜란드 풍차·튤립밭→잔세스칸스·리세(암스테르담) / 핀란드 산타마을→로바니에미(헬싱키) / 노르웨이 피오르→베르겐(오슬로) / 루마니아 브란성→브라쇼브(부쿠레슈티) / 폴란드 소금광산→비엘리치카(바르샤바) / 슬로베니아 블레드섬→블레드(류블랴나) / 크로아티아 두브로브니크→두브로브니크(자그레브) / 보츠와나 오카방고→마운(가보로네) / 나미비아 나미브사막→소수스블레이(빈트후크) / 마다가스카르 바오바브길→무룬다바(안타나나리보) / 말리 젠네모스크→젠네(바마코)

【더 심각한 사실 — 앱이 이미 함정을 가르치고 있다】countries.js의 fact 문장 최소 16개가 이미 "수도가 아닌 곳의 명소"를 그 나라의 대표로 가르치고 있고, 그 음원이 이미 녹음되어 민규가 듣고 있다. 인도→타지마할(data/countries.js:27), 캄보디아→앙코르와트(:24), 미얀마→쉐다곤(:42), 아랍에미리트→부르즈할리파(:59), 요르단→페트라(:33), 네팔→에베레스트(:43), 파키스탄→K2(:46), 베트남→하롱베이(:61), 스페인→사그라다파밀리아(:103), 스위스→알프스(:105), 루마니아→트란실바니아(:97), 폴란드→소금광산(:95), 슬로베니아→블레드(:102), 핀란드→산타마을(:75), 노르웨이→피오르(:94), 스리랑카→실론차(:52). 즉 민규는 이미 "인도=타지마할"을 배웠는데 수도 모드에서는 "인도=뉴델리"를 배운다. 랜드마크 모드를 '수도의 랜드마크'로 만들면, 앱이 스스로 가르친 두 가지를 아이가 하나로 합칠 방법이 없어진다.

【그래서 무엇을 규칙으로 삼는가 — 3단 제안】
규칙1. 축을 '수도의 랜드마크'가 아니라 '그 나라의 대표 명소'로 바꾼다. 이러면 위 45개국의 함정이 전부 사라지고, 이미 녹음된 fact 16개가 오히려 정답 해설로 재사용된다(voice-corpus 추가 0개, 배포 게이트 통과).
규칙2. 그래도 '수도'를 가르치고 싶다면 두 층으로 분리한다. 겉면은 "이 나라 하면 이 그림"(대표 명소), 뒷면 한 줄만 "이 나라의 수도는 ○○예요" — 이 문장은 이미 194개 전부 녹음되어 있다(voice-corpus.mjs의 `ko + '의 수도예요'`). 즉 수도를 포기하지 않으면서 랜드마크와 억지로 묶지 않는다.
규칙3. 그럼에도 '수도의 랜드마크'를 고수한다면, 대상을 아래 등급표의 S+A+B 48개국으로 한정하고 146개국은 이 모드에서 빼야 한다. 194칸 스티커판의 완결성은 상징물 모드로 따로 채운다.

【선정 규칙 — 어느 축을 택하든 공통】
가. 도시 안 또는 도시에서 자동차로 1시간 이내만 '그 도시의 것'으로 인정한다(카이로-기자 18km는 인정, 산티아고-이스터섬 3,500km는 불인정).
나. 4세가 알아볼 수 있으려면 실루엣이 유일해야 한다. 돔·기둥신전·유리마천루·국회의사당은 서로 구별되지 않으므로 등급을 내린다.
다. 혼동 쌍은 같은 판에 함께 내지 않는다. 실측된 위험 쌍 3개 — 도쿄타워↔에펠탑(둘 다 철골 삼각탑, 4세 구별 사실상 불가), 부다페스트 국회↔런던 국회(둘 다 강가 고딕 첨탑 건물), 아테네 파르테논↔로마 콜로세움(둘 다 흰 돌 폐허). quiz.js:48-92 distractors()에 capital 특례와 같은 방식으로 배제 목록을 추가해야 한다.
라. 분쟁·종교 초민감 수도(예루살렘·메카·평양·다마스쿠스·사나·카불)는 등급과 무관하게 랜드마크 대신 자연·식물로 대체한다.

### 문화적 위험과 회피 규칙

- 아프리카 54개국 야생동물 일괄 — 가장 큰 위험. 차단 규칙: 대륙 내 동물 카테고리 상한 10개국(18.5%), 그리고 그 동물이 그 나라 국기·국장·공식 국수에 실제로 있는 경우만 허용(짐바브웨 짐바브웨새, 우간다 회색관두루미, 잠비아 물수리, 케냐, 에스와티니, 보츠와나까지가 안전선). 나머지 44개국은 식물·열매 14, 먹을거리 8, 만든 것 10, 입는 것·춤 7, 땅과 하늘 5로 배분한다. 유럽 45개국을 전부 성·대성당으로 채우는 것도 같은 종류의 게으름이므로 같은 상한을 적용한다.
- GPT 계열 이미지 도구의 기본 도상 편향 — 아프리카·태평양·중앙아시아 국가명을 넣으면 맨발·초가집·먼지·흑백 다큐멘터리풍·반나체 전통복 장면을 기본값으로 뱉을 확률이 높다. 프롬프트마다 '밝고 깨끗한 현대 일상 장면, 그림책 삽화풍'을 양성 프롬프트에 고정하고, 'poverty, dust, ragged clothing, documentary photo, tribal stereotype'을 부정 프롬프트에 고정한다. 도구가 부정 프롬프트를 지원하지 않으면 양성 문장 안에 명시적으로 넣는다.
- 국기에 무기가 그려진 6개국 — 국기 속 사물을 상징물로 쓰는 1순위 규칙과 4세 콘텐츠 원칙이 충돌한다. 오만(칸자르 단검), 사우디아라비아(칼), 앙골라(칼), 케냐(창), 바베이도스(삼지창), 그리고 모잠비크는 국기에 AK-47 소총이 그려져 있다. 이 6개국만 다른 상징으로 대체한다(오만→유향나무·아라비아오릭스, 사우디→대추야자, 앙골라→자이언트세이블영양, 케냐→회색관두루미, 바베이도스→플라잉피시, 모잠비크→캐슈넛). 국기 퀴즈에서 국기 자체는 그대로 두되, 상징물 카드로는 뽑지 않는다.
- 종교 형상화 금기 — 무함마드·알라의 형상화는 절대 금지. 이슬람권 국가의 모스크는 외관 건축물로만 그리고 예배 장면·사람·쿠란 구절 텍스트를 넣지 않는다. 메카 카바(사우디)는 종교 성물이자 수도도 아니므로 이중으로 제외. 예루살렘 바위돔(이스라엘)은 세 종교와 영토 분쟁이 동시에 걸려 있어 등급과 무관하게 제외하고 사해나 올리브로 대체. 바티칸은 국가 자체가 교황청이라 상대적으로 안전하지만 성인상·십자가 처형 도상은 4세 부적합이므로 성베드로 광장의 열주와 분수만 그린다.
- 분쟁·비극이 진행 중이거나 최근인 나라 — 우크라이나(키이우), 시리아(다마스쿠스), 예멘(사나), 아프가니스탄(카불), 소말리아(모가디슈), 남수단(주바), 미얀마(네피도). 폐허·군인·무기·난민 도상이 생성되지 않도록 프롬프트에 명시하고, 우크라이나는 fact에 이미 있는 해바라기밭(data/countries.js:106)으로 대체한다. '전쟁 중인 나라'라는 설명을 4세에게 하지 않는 것이 원칙.
- 정치 지도자 형상 전면 배제 — 북한(평양)의 주체사상탑·동상·개선문, 투르크메니스탄(아시가바트)의 대통령 황금상, 실존 정치인 초상 모두 금지. 북한은 국화인 함박꽃나무(목란)로 대체. 역사 인물도 얼굴 대신 물건으로 우회한다: 오스트리아 모차르트→피아노와 음표, 폴란드 쇼팽→피아노, 덴마크 안데르센→인어공주 동상, 남아공 만델라→프로테아 꽃.
- 노예무역·식민지 유적 전면 배제 — 세네갈 고레섬, 가나 케이프코스트 성, 베냉 우이다의 '돌아오지 않는 문'. 셋 다 그 나라의 진짜 대표 명소지만 만 4세에게 설명할 수 없고 설명 없이 보여주면 안 되는 장소다. 세네갈은 바오바브, 가나는 카카오와 켄테 천, 베냉은 간비에 수상마을로 대체.
- 술·담배 — 4세 콘텐츠 원칙상 전면 제외. 프랑스 와인, 조지아 와인(fact가 이미 '8천 년 포도주'를 언급 data/countries.js:26), 몰도바 포도주(:89), 체코·독일·아일랜드 맥주, 쿠바 시가. 대체: 조지아·몰도바는 포도송이와 포도밭까지만, 체코는 천문시계, 아일랜드는 하프와 초록 들판, 쿠바는 올드카.
- 종교 식문화 금기 — 이슬람권 국가의 상징물로 돼지고기 요리를 쓰지 않는다(독일 소시지는 독일 상징이므로 유지하되 '소시지'로만 표기). 인도의 상징으로 소고기 요리를 쓰지 않는다 — 소를 쓴다면 신성히 여기는 대상으로만 그린다. 이스라엘은 돼지·조개류를 피한다.
- 사람 얼굴·인종 묘사 — AI 생성 이미지에서 특정 민족의 얼굴 특징이 과장되거나 한 나라를 한 인종으로 환원하는 사고가 가장 자주 난다. 원칙적으로 사람 얼굴 클로즈업을 금지하고 사물·동물·건물·옷·음식 중심으로 그린다. 옷이나 춤을 그려야 할 때는 뒷모습이나 원경, 또는 옷만 놓인 정물로 구성한다.
- 지도 모드의 국경선 — countries.js:3이 대만·팔레스타인·코소보·서사하라를 의도적으로 제외했는데, 세계지도 SVG를 어디서 가져오든 카슈미르(인도·파키스탄·중국), 크림반도(우크라이나·러시아), 서사하라(모로코), 남중국해 구단선, 골란고원 경계가 그려진다. 지도를 대륙 덩어리 실루엣 + 핀으로 단순화하면 이 문제를 통째로 회피할 수 있고, 만 4세의 인지 수준에도 그쪽이 맞다.
- '후진국·못사는 나라' 서열 학습 — 랜드마크 등급표를 그대로 노출하면(S등급 화려한 그림 7개국, C등급 그림 없음 146개국) 민규는 나라에 등급이 있다고 배운다. 등급은 제작 순서를 정하는 내부 문서로만 쓰고, 아이에게 보이는 화면에서는 모든 나라가 같은 크기·같은 틀의 카드 한 장을 갖게 한다. 194칸 스티커판이 이미 그 원칙으로 설계되어 있으므로(js/progress.js:78-97) 그 원칙을 깨지 않는다.

### 제작량 — 현재 목표 342장(상징물 194 + 명소 148); 아래 단계별 장수·비용은 초기 설계 추정 기록

```json
{
  "0단계_파일럿": {
    "장수": 12,
    "내용": "랜드마크 S등급 7장(파리·런던·로마·카이로·모스크바·베이징·서울) + A등급 5장(도쿄·방콕·브뤼셀·코펜하겐·워싱턴D.C.) — 도쿄를 반드시 넣어 에펠탑과의 혼동을 실측한다",
    "목적": "스타일 확정 + 등급표 자체의 타당성 검증. 라벨을 가린 채 민규에게 '이게 뭐야'를 묻고, 7장 중 4장 이상을 사물로 알아보지 못하면 랜드마크 축 전체를 접는다",
    "생성시도": "약 30~40회(스타일 탐색 포함)",
    "아빠검수": "30분"
  },
  "1단계_출시가능최소": {
    "장수": 97,
    "내용": "랜드마크 48장(S 7 + A 10 + B 31) + 상징물 49장(level 1 쉬움 49개국)",
    "근거": "랜드마크는 4세 기준 그릴 수 있는 곳이 48개국뿐이라는 실측치가 그대로 상한이다. 상징물은 level 1 49개국이 민규가 가장 자주 만나는 나라들이다",
    "생성시도": "약 135~160회(재생성률 40% 가정)",
    "아빠검수": "97장 × 20초 + 재생성분 = 약 1시간",
    "용량": "WebP 768px q80 기준 장당 약 70KB → 6.8MB"
  },
  "2단계_상징물완성": {
    "장수": 145,
    "내용": "level 2·3의 145개국 상징물 — 카테고리 배분 강제 적용(동물 45·식물 40·먹을거리 35·만든것 30·입는것 22·땅과하늘 22 중 1단계에서 쓴 만큼을 뺀 나머지)",
    "근거": "194칸 스티커판의 완결성을 유지하려면 상징물은 반드시 194개국 전부여야 한다. 랜드마크는 부분이어도 되지만 상징물은 부분이면 안 된다",
    "생성시도": "약 200~240회",
    "아빠검수": "약 1시간 30분",
    "용량": "약 10MB"
  },
  "3단계_선택": {
    "장수": 72,
    "내용": "축을 '수도의 랜드마크'에서 '그 나라 대표 명소'로 바꾸면, C등급 146개국 중 그릴 거리가 생기는 약 72개국(마추픽추·앙코르와트·타지마할·테이블마운틴·오카방고·우유니 등)",
    "근거": "이 72장은 랜드마크 커버리지를 48개국에서 120개국(62%)으로 끌어올린다. 다만 나머지 74개국(오세아니아 소국·카리브 소국·서아프리카 내륙)은 축을 바꿔도 여전히 그릴 것이 없다",
    "생성시도": "약 100~120회",
    "아빠검수": "약 45분"
  },
  "누적_상한": {
    "확정_이미지": 342, "설계_당시_추정": 314,
    "실제_생성시도": "약 465~560회",
    "아빠_검수시간": "약 3시간 45분(재생성 판단 포함)",
    "저장소_증가": "약 22MB(WebP 768px q80). 현재 audio/sua 114MB에 비하면 작지만, sw.js의 SHELL 배열(sw.js:6-31)에 넣으면 첫 설치가 무거워지므로 국기 SVG처럼 지연 프리캐시 루틴을 따로 짜야 한다",
    "음성_추가": "0개 — 랜드마크 축을 '그 나라 대표 명소'로 바꾸고 기존 fact 문장과 'ko + 의 수도예요'만 재사용하면 voice-corpus 확장이 필요 없고 build-site.mjs:13의 배포 게이트를 그대로 통과한다. 반대로 랜드마크 이름을 새로 읽어주려면 194클립 추가 = 약 23MB + Typecast 과금"
  },
  "가장_깎기_좋은_지점": "랜드마크 48장. 이 48장은 194개국 중 24.7%만 덮으면서 제작·검수 비용의 3분의 1을 쓰고, 오세아니아 0개국·아프리카 5개국이라는 대륙 편중을 그대로 노출한다. 1단계를 '상징물 194장'만으로 잡고 랜드마크를 나중으로 미루면, 194칸 완결성과 대륙 균형을 동시에 지키면서 제작량이 97장에서 194장으로 늘어도 종류가 하나라 스타일 관리가 훨씬 쉽다."
}
```

---

## 2. 화풍 후보 A — 납작한 색면 (외곽선 없음)

**납작한 색면 그림 (Flat Color-Block) — 아웃라인 없는 2톤 색면 + 옅은 파란 원 배경**

<details><summary>선정 근거</summary>

【결론 요약】 사진이 아니라 일러스트, 그중에서도 '아웃라인 없는 2톤 평면 색면'. 배경은 투명도 장면도 아닌 '순백 캔버스 + 중앙 옅은 파란 원'. 종횡비는 4:3 가로 고정. 사람 0명, 글자 0자, 국기 0개.

【1. 사진 vs 일러스트 → 일러스트】 근거 네 가지.
(a) 만 4세 인지: 이 나이의 재인 단서는 세부가 아니라 전역 윤곽이다. 사진은 배경 잡음·원근·조명이 변별 단서를 덮는다. 큰 덩어리·단순 실루엣·높은 채도가 섬네일 크기에서 식별률이 높다.
(b) 오프라인 용량: 이 앱은 PWA이며 T2에서 셸·국기·그림·음원 버킷을 분리했다. 음원은 AUDIO_CACHE='flagquiz-v4'를 보존하고 그림은 ART_CACHE를 사용한다. 국기 194장이 이미 1.9MB를 쓴다. 초기 388장 비교에서는 768×576 q80 사진풍 31MB 대 평면 12MB를 추정했다. 현재 제작 목표는 342장이며 실제 용량은 화풍 확정 후 계수한다.
(c) AI 생성 정확도: 사진풍은 '거의 맞는데 틀린' 오류(창문 수, 간판 글자, 기둥 개수)가 오히려 눈에 띈다. 양식화하면 오류 허용 범위가 넓어지고, 실존 건축물의 파노라마의 자유 문제도 함께 낮아진다.
(d) 기존 시각 언어와의 충돌: flags/*.svg는 전부 viewBox "0 0 640 480"의 완전 평면 단색 벡터다(fr.svg = path 3개 + fill뿐, 그라데이션·그림자·아웃라인 0회). 그 옆에 사진을 놓으면 즉시 따로 논다.

【2. 왜 '아웃라인 없는 2톤'인가 — 이 앱의 두 번째 시각 축은 이모지다】 SPEC.md:43-45가 "이모지를 쓴다"를 명문화했고 실제로 🚩🎤⌨️🏙️🔥⭐🎉를 쓴다. 이모지의 조형 논리가 정확히 '검정 윤곽선 없이 색면으로 형태를 나누고, 면마다 한 단계 어두운 그림자면을 하나만 둔다'이다. 그래서 새 그림을 이 논리로 그리면 국기 SVG(완전 평면)와 이모지(2톤 색면) 사이에 정확히 착지한다. 반대로 검정 라인아트로 가면 이 앱에 선 기반 도형은 UI 아이콘(stroke 24격자·굵기 2, SPEC.md:43-45)뿐이라 '내용 그림'과 'UI 아이콘'의 구분이 무너진다.

【3. 배경 → 순백 #FFFFFF + 중앙 #EEF4FF 원】
· 투명 PNG 기각: GPT 계열 도구의 알파 출력이 불안정하고, 투명 WebP는 팔레트 압축이 불리해 용량이 오히려 는다. 무엇보다 4세에게는 카드 위에 '떠 있는' 그림보다 액자 안에 든 대상이 더 잘 잡힌다.
· 장면(하늘·땅·구름) 기각: 잡음이 변별 단서를 덮고, 수백 장 일관성이 가장 먼저 무너지는 지점이 배경이다.
· 순백을 고른 이유: 카드 토큰이 --card #ffffff(style.css:8)라 이미지의 흰 여백이 카드와 그대로 이어져 액자 없이 붙는다. GPT 계열이 가장 안정적으로 만드는 배경이기도 하다.
· 원을 넣은 이유 셋: (1) 사람 눈은 배경을 먼저 보고 '같은 세트'를 판정한다 — 색·지름을 숫자로 못박은 원 하나가 수백 장을 묶는 가장 강한 단일 장치다. (2) 세로로 긴 탑과 옆으로 넓은 코끼리의 실루엣 차이를 흡수해 격자에서 정렬감을 만든다. (3) 색을 #EEF4FF로 잡으면 이것이 --bg 토큰(style.css:7)과 같은 값이라 '앱 바탕색 한 조각이 카드 안에 들어온' 관계가 된다. 새 색을 만들지 않았다.
· 다크모드: 흰 배경 이미지가 다크 카드 위에서 눈부신 판이 되는 문제는 이미 국기가 겪고 있고 이미 해결돼 있다 — .flag-img가 `background: var(--card-2); border: 1px solid var(--line); border-radius: 12px`(style.css:307-317)로 '종이 위 그림'처럼 보이게 처리한다. 새 이미지도 같은 규칙을 복제하면 다크용 이미지를 따로 만들 필요가 없다. (참고: --accent #ffb703은 다크에서 재정의되지 않으므로 금색을 그림 바탕색으로 쓰면 안 된다.)

【4. 종횡비 → 4:3 가로】 이 시스템에는 비율이 4:3 하나뿐이다. flags/*.svg 194장 전부 viewBox "0 0 640 480"이고 CSS도 여섯 곳이 aspect-ratio: 4/3으로 고정돼 있다 — .flag-img(style.css:311), .flag-choice img(:391), .feedback .name-row img(:434), .wrong-item img(:478), .sticker-cell img(:988), .new-stickers img(:1027). 두 번째 비율 토큰을 만들면 이 6곳 + 아이패드 브레이크포인트 4단(:1063/:1086/:342/:1097) + 다크 처리를 전부 재검토해야 한다.
정사각 기각의 실무 근거: 매칭 타일과 보기 격자는 .answer-grid가 1fr 1fr 2열(style.css:362), ≤480px에서 1열(:363)이다. 같은 칸 폭에서 정사각은 4:3보다 타일 높이가 33% 커지고, 아이패드 세로는 이미 .flag-img max-height 34vh(:1087)로 세로 예산이 빡빡해 보기 4개가 화면 밖으로 밀린다. 또 수도-랜드마크 매칭은 국기 칩과 그림이 한 줄에 나란히 서는 화면이라 비율이 섞이면 정렬이 깨진다.
세로로 긴 피사체(에펠탑 등)가 4:3에서 작아지는 문제는 '피사체 높이를 캔버스의 78%로 고정'과 '남는 좌우를 원이 채움'으로 흡수한다. 다만 어느 선까지 통할지는 실물 확인이 필요해 질문으로 남긴다.

【5. 인물 → 전면 금지】 (a) AI 얼굴은 품질 편차가 가장 크고 민족 표현에서 고정관념이 튀어나온다. (b) 194개국 × 사람 그리기는 디자인이 아니라 편집 방침 문제이고, 이 저장소는 대만·팔레스타인·코소보를 "어른들 사이에서도 답이 갈리니 아이 자료에서는 뺀다"는 이유로 이미 제외한 전례가 있다(README.md:173-176). 같은 원칙의 연장이다. (c) 4세 변별력 관점에서 사람 그림은 나라를 가르는 단서가 약하다 — 사람은 다 비슷해 보인다. (d) 실존 인물 동상은 저작권·정치 위험이 동시에 걸린다. 전통의상 축은 아예 후보에서 빼고 동물·음식·건축으로 대체한다.

【6. 텍스트 → 전면 금지】 AI는 한글 자모를 제대로 못 쓴다(획이 깨지거나 유사 글자가 나온다). 영문도 간판·현판에 엉터리로 들어간다. 그리고 앱은 나라 이름을 자체 폰트로 렌더하고 Sua 음성 977클립으로 읽어 준다 — 이미지가 글자를 그릴 이유가 0이다. 국기도 같은 이유로 금지: flags/에 정확한 원본 194장이 있고 AI가 그린 국기는 별 개수·비율이 반드시 틀린다.

【7. 4세 기준선 경고】 SPEC.md:8은 대상 연령을 7~10세로 적어 두었고 아트보드 본문 글자가 9~12.5px다. 이 스타일은 4세 기준으로 잡았으므로(섬네일에서 방 건너편에서도 알아볼 것), 그림을 담는 화면의 타이포·터치 타깃도 함께 4세 기준으로 올려야 짝이 맞는다.

</details>

### A-스타일 블록 (모든 프롬프트 끝에 원문 그대로 붙인다)

```text
STYLE LOCK — append this block verbatim to the end of every prompt. Never edit, shorten, or reorder it.

Children's flat vector illustration with emoji-like simplification: bold, simplified shapes built from clean solid color blocks, with no outlines of any kind. Each surface uses exactly two tones — one base color plus one slightly darker shade for the shadow side — and the shadow side is always on the lower-right, on every object, in every image. No gradients, no highlights, no gloss, no rim light, no texture, no grain, no hatching, no brush strokes, no line art, no contour lines.

Palette: bright, friendly, high-saturation colors of a modern children's app — warm coral red, sunny amber yellow, fresh grass green, clear sky blue, soft cream, warm grey-brown. Use at most five colors in the subject. Never muted, pastel-washed, neon, sepia, or dark.

Composition: exactly one subject, centered, seen straight on from the front or at a gentle three-quarter angle, complete and never cropped by the canvas edge. The subject occupies about 78 percent of the canvas height, leaving even empty margin on all four sides. No props, no secondary objects, no ground line, no cast shadow, no horizon, no sky, no scenery, no decorative border or frame.

Background: a flat pure white (#FFFFFF) canvas with one flat pale blue circle (#EEF4FF) centered behind the subject, its diameter about 88 percent of the canvas height. That circle is a single flat color with a hard, clean edge — no gradient, no glow, no ring, no outline, no pattern, no shadow. Nothing else is in the background.

Rendering: crisp vector-clean edges, perfectly even flat fills, generously rounded corners on every shape. Not photographic, not 3D, not clay, not plasticine, not felt, not plush, not paper-cut, not watercolor.

Mood: cheerful, gentle, calm, safe for a four-year-old child. It must be instantly recognizable at thumbnail size from across the room.

Canvas: 4:3 landscape, 1024 x 768.
```

### A-금지 블록 (스타일 블록 바로 뒤에 원문 그대로)

```text
NEGATIVE — append this block verbatim to every prompt, directly after the style lock.

Do not include any of the following.
Text: no text, no letters, no numbers, no words, no captions, no labels, no signage, no inscriptions, no engraved names, no watermarks, no signatures, no logos, in any language — and absolutely no Korean Hangul characters.
Flags: no national flags, no flag patterns, no flag-colored stripes or fields, no coats of arms, no heraldry, no emblems.
People: no people, no human figures, no faces, no hands, no body parts, no human silhouettes, no crowds, no statues or monuments depicting a specific real person, no portraits, no traditional costume worn by a figure.
Sensitive content: no worship scenes, no ceremonies, no rituals, no praying figures, no religious iconography beyond plain building exteriors, no military, no soldiers, no weapons, no blood, no fire, no ruins on fire, nothing frightening, nothing sad.
Geography chrome: no maps, no globes, no borders, no map pins, no compass roses, no latitude lines.
Medium: no photograph, no photorealism, no realistic rendering, no 3D render, no CGI, no octane, no clay, no plasticine, no plush, no felt, no crochet, no knitted, no paper cutout, no collage, no watercolor, no oil paint, no gouache texture, no pencil sketch, no charcoal, no ink line art, no comic panels, no manga, no halftone dots, no pixel art, no low poly.
Surface artifacts: no noise, no grain, no film grain, no bokeh, no depth of field, no lens flare, no vignette, no drop shadow, no ambient occlusion, no glow, no bloom, no gradient, no metallic sheen, no reflection, no transparency, no glass.
Background: no scenery, no landscape, no clouds, no sun, no moon, no stars, no confetti, no sparkles, no bubbles, no patterned wallpaper, no checkerboard, no transparency checkerboard, no frame, no border, no torn paper edge, no sticker outline, no white keyline around the subject.
Layout: no multiple subjects, no collage of several objects, no grid of items, no repeated pattern, no tiling, no subject cropped by the edge, no tilted or dutch angle, no extreme close-up, no dramatic low or high camera angle, no forced perspective, no fisheye.
Palette: no dark palette, no nighttime scene, no muted colors, no desaturated colors, no sepia, no monochrome, no neon, no fluorescent.
```

### A-기술 사양

- **종횡비** — 4:3 가로 고정(1.333). 앱 전체가 4:3 단일 비율 — flags/*.svg 194장이 전부 viewBox "0 0 640 480"이고 CSS 6곳이 aspect-ratio:4/3이다(style.css:311 .flag-img, :391 .flag-choice img, :434 .feedback .name-row img, :478 .wrong-item img, :988 .sticker-cell img, :1027 .new-stickers img). 두 번째 비율 토큰을 만들지 않는다.
- **생성 해상도** — 1024×768. 도구가 4:3을 못 내고 정사각만 된다면 1024×1024로 받되, 크롭이 아니라 좌우에 흰 여백을 덧대어 1024×768로 만든다(피사체를 절대 자르지 말 것). 원 배경 덕분에 좌우 흰 여백이 자연스럽게 이어진다.
- **배포 해상도** — 768×576. 아이패드 2배 밀도에서도 충분 — 실사용 최대 표시 폭이 .flag-img max-width 380px(≥700px에서 460px, style.css:307-319)이다. 스티커 칸(88px)·오답 칸(112px)·피드백 칩(96px)은 훨씬 작다.
- **포맷** — 배포는 WebP q80. 생성 원본 PNG는 무손실로 docs/ 아래 보관(build-site.mjs:16의 파일 화이트리스트와 :56의 폴더 배열 밖이라 자동으로 배포에서 빠진다).
- **장당 목표 용량** — 20~40KB. 평면 색면이라 사진풍(60~90KB)의 절반 이하가 나와야 정상이며, 60KB를 넘으면 그라데이션·노이즈가 섞인 것이므로 스타일 이탈 신호로 본다. 388장 기준 총 8~16MB(국기 194장 = 1.9MB 대비).
- **배경** — 순백 #FFFFFF 캔버스 + 중앙에 단색 원 #EEF4FF(지름 = 캔버스 높이의 88%). 알파(투명) 채널 사용 안 함. 원 색은 style.css:7의 --bg 토큰과 동일한 값이며 새 색을 만들지 않았다.
- **피사체 크기** — 캔버스 높이의 78%, 사방 균등 여백. 이 값이 코끼리와 탑을 같은 크기로 보이게 하는 스케일 일관성 장치다.
- **색 수** — 피사체 내 5색 이하. 면당 2톤(베이스 + 한 단계 어두운 그림자면), 그림자면 방향은 전 이미지에서 우하단 고정.
- **여백/안전영역** — 피사체가 캔버스 가장자리에 닿지 않는다. 라운드 코너(12px)로 잘려도 형태가 손상되지 않아야 한다.
- **다크모드 처리** — 이미지는 밝은 배경 한 벌만 만든다. 다크 대응은 CSS에서 국기와 동일하게 — background: var(--card-2); border: 1px solid var(--line); border-radius: 12px (style.css:307-317 패턴 복제). 이미지 자체를 다크용으로 따로 만들지 않는다. 주의: --accent #ffb703은 다크에서 재정의되지 않으므로(style.css:27-46) 금색을 그림 바탕색으로 쓰지 않는다.
- **CSS 배선 시 필수 작업** — 새 이미지 클래스를 style.css:73의 touch-action:manipulation 선택자 목록과 :76-79의 user-select:none 목록에 반드시 추가한다. 빠뜨리면 아이패드에서 더블탭 확대·글자 끌림이 새 화면에서만 발생해 README.md:54의 약속이 깨진다.
- **파일명** — 내용 해시 방식(예: images/kr-a1b2c3d4.webp). 음성 파이프라인 관례(scripts/generate-voice.mjs:23-36의 sha256 앞 24자)를 복제한다. 단 sw.js:46-70 warmFlags()식 정규식 스크레이프가 불가능해지므로 매니페스트 기반 프리캐시가 필요하다.
- **저장 위치 주의** — 새 이미지를 flags/ 에 넣으면 tests/run.mjs:114-124가 '목록에 없는 파일이 있으면 실패'로 막는다. images/ 로 분리하고 build-site.mjs:56의 폴더 배열('assets','css','flags','js')에 추가해야 배포된다.
- **로컬 서버 MIME** — scripts/serve.mjs:16-29 TYPES에 '.webp': 'image/webp' 한 줄을 추가해야 한다. 없으면 배포본은 멀쩡한데 npm start 로컬에서만 그림이 깨진다.
- **서비스워커** — T2의 기존 ART_CACHE와 /images/ 분기를 재사용한다. 이미지는 SHELL에 넣지 않고 activate의 별도 예열 루틴으로 처리한다. 그림 교체에는 ART_CACHE만 갱신하며 AUDIO_CACHE='flagquiz-v4'는 최초 공개 때도 바꾸지 않는다.

### A-일관성 전술

- 【프롬프트 어순을 절대 고정한다】 모든 요청은 정확히 세 덩어리, 이 순서로만 쓴다: [피사체 1문장] + [styleBlock 전문] + [negativeBlock 전문]. 어순을 바꾸거나 styleBlock 문장을 한 줄이라도 다듬는 순간 그 장만 다른 세계가 된다. 재생성할 때도 프롬프트를 고치지 말고 그대로 다시 굴린다.
- 【피사체 문장 템플릿도 고정한다】 'A single <대상>, <구별되는 특징 한 가지>.' 딱 이 형태만 쓰고 형용사 개수까지 통일한다. 예: 'A single Eiffel Tower, a tall lattice tower with four curved legs and a pointed top.' / 'A single lion, a male lion with a full mane, standing in profile.' / 'A single pizza, a round pizza with red sauce and basil leaves.' 대상이 바뀌어도 문장의 뼈대는 같아야 한다.
- 【피사체 문장에 스타일 형용사를 절대 넣지 않는다】 majestic, beautiful, detailed, intricate, iconic, stunning, cinematic 같은 단어가 하나만 들어가도 styleBlock과 충돌해 그 장만 톤이 튄다. 피사체 문장은 '무엇이 어떻게 생겼는가'만 적는다.
- 【수치 고정이 레퍼런스를 대신한다】 시드도 참조 이미지도 못 쓴다는 최악의 경우에도, 배경 원 색(#EEF4FF)·원 지름(높이의 88%)·피사체 높이(78%)·그림자 방향(우하단)·색 수(5색 이하)·톤 수(면당 2톤) 여섯 개 숫자가 프롬프트에 매번 박혀 있으면 사람 눈에는 같은 세트로 보인다. 사람은 스타일을 배경과 스케일로 먼저 판정하기 때문이다.
- 【앵커 3장으로 styleBlock을 한 번 되먹인다】 스타일 락은 1회로 끝나지 않는다. 성격이 다른 3장(건축 1 · 동물 1 · 음식 1)을 먼저 만족할 때까지 돌린 뒤, 그 결과물에서 관찰된 특징(예: 지붕 기와를 몇 덩어리로 나누는가, 동물 눈을 점으로 찍는가 타원으로 그리는가)을 문장으로 환원해 styleBlock에 1~2줄 추가한다. 그 다음부터 양산에 들어간다.
- 【같은 축을 묶어 연속 생성한다】 대화형 도구는 같은 대화 맥락 안에서 스타일이 유지되는 경향이 있다. 동물 49장을 연달아, 건물 49장을 연달아 뽑는다. 축을 오가며 뽑으면 직전 이미지의 잔상이 섞여 동물에 건축 질감이, 건물에 동물 색조가 묻는다.
- 【컨택트시트로 검수한다 — 개별로 보면 절대 안 보인다】 40장씩 한 화면에 깐 정적 HTML(docs/ 아래)을 만들어 '튀는 장'만 골라낸다. 한 장씩 보면 전부 괜찮아 보이고, 모아 놓아야 채도가 반 단계 높은 장, 그림자 방향이 뒤집힌 장, 원이 작은 장이 즉시 드러난다. 이 방법이면 388장 검수가 30~40분에 끝난다.
- 【불합격 판정 기준을 숫자로 정해 둔다】 (1) 파일 용량이 60KB를 넘으면 그라데이션·노이즈가 섞인 것 → 재생성. (2) 글자·국기·사람이 한 조각이라도 보이면 무조건 재생성(검수 체크리스트 1번 항목). (3) 배경 원이 없거나 타원이거나 테두리가 생겼으면 재생성. 눈대중 대신 이 세 항목으로 기계적으로 거른다.
- 【원장에 프롬프트 전문을 남긴다】 음성의 ledger.json 관례를 복제해 {id, code, slot, axis, ko, en, prompt 전문, revision, 판정, note}를 기록한다. 3개월 뒤 한 장을 고쳐야 할 때 '그때 뭐라고 썼는지'가 없으면 그 한 장이 영영 튄다. 프롬프트 전문을 요약하지 말고 그대로 저장한다.
- 【도구가 레퍼런스 입력을 지원하면 styleBlock을 줄이지 말고 병행한다】 앵커 3장을 첨부할 수 있게 되더라도 styleBlock은 그대로 붙인다. 참조 이미지는 '분위기'를, 텍스트는 '수치'를 잡는데, 참조만 믿으면 원 지름과 피사체 비율이 서서히 흘러간다(drift). 둘을 겹치는 것이 가장 안전하다.
- 【배치가 안 되면 '한 번에 한 장, 같은 대화'가 차선이다】 배치 API를 못 쓰면 한 대화 안에서 연속으로 요청하되, 20장마다 styleBlock을 다시 전체 붙여 넣어 맥락을 재고정한다. 대화가 길어지면 앞의 지시가 흐려진다.

---

## 3. 화풍 후보 B — 그림책 과슈 (갈색 외곽선)

아래 템플릿에 화풍이 내장돼 있다. 후보 B를 고르면 이 템플릿을 그대로 쓴다.

### B-상징물 템플릿

```text
【FQ-IMG-v1 / symbol】 국가 상징물용. 슬롯은 {{ }} 안만 바꾸고 COMPOSITION·STYLE·DO NOT INCLUDE·OUTPUT 네 문단은 한 글자도 바꾸지 않는다. 텍스트만으로 일관성을 잡는 설계라, 이 네 문단이 유일한 스타일 락이다. 대화 문맥("아까 그 스타일로")에 의존하지 말고 매번 전문을 붙여넣는다.

────────────────────────────
SUBJECT: {{SUBJECT_EN — 한 문장, 18~35 단어. 무엇인지 + 눈에 띄는 형태·색·부속물 2~3개. 나라 이름은 넣어도 되지만 국기·글자는 넣지 않는다. 동물·식물은 실제 비율을 지키고 의인화하지 않는다.}}
{{OVERRIDE (있을 때만 한 줄) — 예: "OVERRIDE for this image only: small natural gas flames are required here and are safe; keep them low, warm and calm."}}

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.
────────────────────────────

설계 의도: (1) 배경을 단색 #F1F5FB로 못박은 것이 텍스트 락의 핵심이다. 풍경을 허용하면 194장이 각기 다른 세계가 되고, 3:2→4:3 중앙 크롭도 위험해진다. (2) 외곽선 색(#4A3B2F)과 굵기, 광원 방향(좌상), 팔레트 5색을 숫자로 고정하면 시드 없이도 눈에 띄는 드리프트가 크게 준다. (3) 팔레트는 css/style.css:6-25의 --primary #4f7cff, --accent #ffb703, --success #16a34a, --danger #ef4444를 그대로 가져와 앱 화면과 그림이 같은 색 가족에 있게 했다. (4) 국기 금지는 저작권이 아니라 학습 이유다 — 앱이 이미 flags/&lt;code&gt;.svg를 보여 주므로 그림 속 부정확한 국기는 오학습원이다. (5) 글자 금지는 만 4세가 한글을 못 읽는 것과 별개로, GPT 계열 이미지 도구의 최빈 실패(엉뚱한 라틴문자 삽입)를 막기 위한 것이다.
```

### B-랜드마크 템플릿

```text
【FQ-IMG-v1 / landmark】 도시 대표 명소용. symbol 템플릿과 COMPOSITION·STYLE·DO NOT INCLUDE·OUTPUT 네 문단이 완전히 동일해야 두 축의 그림이 한 세계관에 묶인다. 다른 점은 SUBJECT 위에 붙는 ACCURACY 한 줄뿐이다.

────────────────────────────
SUBJECT: {{SUBJECT_EN — 한 문장. 실제 건축물/자연물의 실루엣을 결정짓는 요소를 반드시 세 가지 이상 적는다(층수·아치 개수·지붕 모양·재료 색·부속 봉우리 등). 모호하게 적으면 모델이 일반적인 '유럽풍 탑'을 그린다.}}
ACCURACY: keep the real silhouette, the real number of major parts and the real material colour of this place correct, then simplify it into the STYLE below. Clear soft daytime light. No people, no vehicles, no modern signage, no night-time illumination or light show.
{{OVERRIDE (있을 때만 한 줄) — 예: "OVERRIDE for this image only: this is religious architecture shown from outside; the colonnade and obelisk are allowed, but show no sacred figures in close-up, no ceremony and no worshippers."}}

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.
────────────────────────────

랜드마크에만 걸리는 두 가지 사전 판정 (원장의 subject 문장을 쓰는 단계에서 끝내야 한다):

A. 수도 불일치. 아빠가 든 예시 '뉴욕 자유의 여신상'은 미국 수도(워싱턴 D.C.)가 아니다. 같은 문제가 이집트(기자 ≠ 카이로 중심), 브라질(리우 ≠ 브라질리아), 페루(마추픽추 ≠ 리마), 멕시코(치첸이트사 ≠ 멕시코시티)에서 반복된다. 원장의 각 항목에 `inCapital: true|false` 필드를 두고, false면 화면 문구를 '수도의 명소'가 아니라 '이 나라의 명소'로 바꿔야 한다. 이건 프롬프트가 아니라 데이터 결정이다.

B. 20세기 이후 건축물·조각의 저작권. 실물이 저작권 보호를 받는 대상(호주 시드니 오페라하우스, 브라질 구세주 그리스도상, 프랑스 에펠탑의 야간 조명 연출 등)은 양식화 일러스트라도 파생물 시비가 가능하다. 대응은 둘 중 하나로 고정한다 — (1) 소재 교체(오페라하우스 → 캥거루, 예수상 → 팡지아수카르 봉우리), (2) 저작권이 소멸했거나 애초에 없는 대상만 사용(에펠탑 주간 모습, 자유의 여신상, 마추픽추, 피라미드). 위 템플릿의 "no night-time illumination or light show"는 (2)를 위한 장치다.
```

---

## 4. 지도 이미지는 AI로 만들지 않는다

【결론: 사실용 지도 이미지는 AI로 만들지 않는다. 장식용 한 종류만 만든다.】

■ 왜 불필요한가 (네 가지 근거)

1. 정확도. GPT 계열 이미지 모델은 해안선·국경·나라 위치를 신뢰할 수 없게 그린다. 민규는 국기-나라 이름을 이미 90% 이상 외운 상태라, 틀린 지도는 '새 지식'이 아니라 '오학습'이 된다. 국기 SVG가 flag-icons 같은 검증된 출처에서 온 것과 같은 기준을 지도에도 적용해야 한다.

2. 구현. 아빠가 원하는 것은 그림 한 장이 아니라 '지도 위 위치 탐색 애니메이션'이다. 래스터 이미지 1장에는 핀을 꽂을 좌표계가 없다. 필요한 것은 (a) data/countries.js에 lat/lng 2개 필드 추가(전체 +4.2KB, 약 5% 증가로 실측됨) + (b) 나라별 path id를 가진 정적 세계지도 SVG다. 이 둘이 있으면 확대·핀·경로 애니메이션을 CSS/JS로 만들 수 있고, prefers-reduced-motion 축약 경로(effects.js:8-10 관례)도 붙는다.

3. 오프라인·용량. 이 앱은 sw.js가 셸을 수동 목록으로 프리캐시하는 오프라인 우선 PWA이고, 외부 타일 서비스는 원칙상 배제된다. 국기 194개 SVG 합계가 1.24MiB(중앙값 713B)인 전례가 있듯 벡터가 래스터보다 용량·선명도 모두 유리하다. 고해상도 세계지도 래스터는 아이패드 확대 시 뭉개지고 용량도 크다.

4. 편집 방침 충돌. data/countries.js:3 주석이 "국가로 볼지 견해가 갈리는 지역(대만·팔레스타인·코소보·서사하라 등)은 넣지 않는다"고 명시한다. AI가 임의로 그린 국경선은 이 방침을 조용히 위반한다. 국경은 사람이 고른 SVG로만 다뤄야 한다.

■ 그래도 필요한 단 하나: 지도 화면의 장식 소품

지도 화면·여행책 화면의 빈 자리를 채울 장식(나침반, 무늬 없는 접힌 종이 지도, 여행 가방, 도장)만 같은 세계관으로 생성한다. 실제 지리를 담지 않는다는 점을 프롬프트에 명시한다.

────────────────────────────
SUBJECT: a decorative travel-book ornament — {{ORNAMENT_EN — 예: "an old brass pocket compass with a cream dial and a red-and-white needle, its hinged lid open" / "a folded sheet of cream travel paper with soft creases and rounded corners, its surface completely blank" / "a small round wooden suitcase with two leather straps and a brass clasp"}}.
GEOGRAPHY RULE: this ornament must contain no real geography whatsoever — no coastlines, no continents, no islands, no country shapes, no borders, no latitude or longitude lines, no globe. Any map-like surface in it is blank.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses drawn as real navigation charts; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.
────────────────────────────

장식 소품은 많아야 4~6장이면 충분하다. 파일명은 `assets/ornaments/compass.webp` 형태로 두고, 나라 코드 이름공간(images/symbols/, images/places/)과 섞지 않는다 — tests/run.mjs:114-124가 flags/에 대해 하는 '목록에 없는 고아 파일 금지' 검사를 새 폴더에 복제할 때, 나라 코드가 아닌 파일이 섞여 있으면 검사를 쓸 수 없다.

---

## 5. 바로 쓸 수 있는 샘플 프롬프트

18장. 6개 대륙, 쉬운 나라와 어려운 나라를 섞었다.

### `images/places/kr.webp` — 대한민국 (kr) · landmark

주제: 광화문과 경복궁 정문 (서울 — 수도 일치)

```text
SUBJECT: Gwanghwamun, the main gate of Gyeongbokgung Palace in Seoul, South Korea: a wide pale grey stone base pierced by three arched openings, two stacked tiled roofs with deep upward-curving eaves, dark red wooden pillars, and green-and-blue dancheong patterning painted along the beams under the eaves.
ACCURACY: keep the real silhouette, the real number of major parts and the real material colour of this place correct, then simplify it into the STYLE below. Clear soft daytime light. No people, no vehicles, no modern signage, no night-time illumination or light show.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.

[노림수] 앵커(기준) 이미지. 민규가 가장 확실히 아는 나라이고, 현판 글씨를 빼야 하므로 '글자 금지'가 제대로 먹는지 첫 판에서 검증된다. 이 1장을 승인한 뒤 모든 후속 이미지를 여기에 맞춘다.
```

### `images/symbols/jp.webp` — 일본 (jp) · symbol

주제: 후지산과 벚나무 가지 (level 1 · 아시아)

```text
SUBJECT: Mount Fuji, the wide symmetrical volcano of Japan, a smooth cone of soft blue-grey with a white snow cap on its upper third and a slightly flattened summit, with two or three pale pink cherry blossom branches crossing the lower foreground.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.

[노림수] countries.js의 일본 fact('가장 높은 산은 후지산이에요')와 직접 이어지는 상징물. 국기(흰 바탕 빨간 동그라미)와 해가 헷갈릴 위험이 있어 '붉은 해' 요소를 일부러 넣지 않았다 — 국기 금지 규칙과 같은 이유다.
```

### `images/symbols/mn.webp` — 몽골 (mn) · symbol

주제: 초원의 게르와 말 한 마리 (level 1 · 아시아)

```text
SUBJECT: a Mongolian ger, the round white felt tent of the steppe, with a gently domed roof, a bright orange-painted wooden door facing the viewer, a small wooden roof ring at the top, standing on a low patch of short green grass, with one calm brown horse grazing beside it.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.

[노림수] '사람이 사는 집' 계열 상징물의 표준형. 사람 얼굴 금지 규칙이 있는 상태에서 생활 문화를 어떻게 보여 줄지의 본보기다. 게르는 실루엣이 단순해 4세가 다른 나라와 헷갈리지 않는다.
```

### `images/symbols/mv.webp` — 몰디브 (mv) · symbol

주제: 물 위 방갈로와 산호섬 (level 2 · 아시아)

```text
SUBJECT: a Maldivian over-water bungalow: a small cabin with a shaggy thatched roof and cream wooden walls standing on four slim stilts above clear turquoise shallow water, a short wooden walkway leading to it, and one leaning palm tree on a tiny white sand bank at its side.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.

[노림수] '물'이 주제인데 배경은 단색이어야 하는 충돌 사례. 물을 배경이 아니라 주제 안의 작은 덩어리로 가두는 서술법을 보여 준다. 여기서 모델이 바다를 배경 전체로 칠하면 SUBJECT 문장을 'a small round patch of turquoise water'로 더 좁혀야 한다.
```

### `images/symbols/az.webp` — 아제르바이잔 (az) · symbol

주제: 야나르다그 — 꺼지지 않는 불의 언덕 (level 3 · 아시아)

```text
SUBJECT: Yanar Dag, the burning hillside of Azerbaijan: a low rounded rocky slope of warm sandy brown with a steady row of small orange-and-yellow natural gas flames burning along its base, and a few dry tufts of grass on the upper slope.
OVERRIDE for this image only: small natural gas flames are required here and are entirely safe and natural; keep them low, warm, round and calm, like candle flames. This is not a fire disaster.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.

[노림수] OVERRIDE 줄의 사용법 본보기. 공통 금지 목록('fire damage', '무서운 것')과 주제가 충돌할 때, 금지 문단을 고치지 않고 이미지 하나에만 예외를 허용한다. 금지 문단을 나라마다 고치기 시작하면 텍스트 스타일 락이 무너진다. 난이도 3 나라가 실제로 그릴 만한 소재를 갖고 있는지 확인하는 사례이기도 하다(countries.js의 아제르바이잔 fact에서 그대로 가져왔다).
```

### `images/places/fr.webp` — 프랑스 (fr) · landmark

주제: 에펠탑 (파리 — 수도 일치, level 1 · 유럽)

```text
SUBJECT: the Eiffel Tower in Paris, France, shown in full from the ground to the tip: four curved iron legs meeting in a wide arch at the bottom, two square observation platforms at different heights, and a slender tapering lattice mast above, all in its real warm bronze-brown colour.
ACCURACY: keep the real silhouette, the real number of major parts and the real material colour of this place correct, then simplify it into the STYLE below. Clear soft daytime light. No people, no vehicles, no modern signage, no night-time illumination or light show.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.

[노림수] 세로로 긴 대상을 4:3 가로 화면에 넣는 첫 시험대. 여기서 위아래가 잘리거나 좌우 여백이 과하게 비면, 이 세로 계열(에펠탑·자유의 여신상·피사탑 등)만 COMPOSITION의 '70 percent of the frame height'를 '85 percent'로 올린 별도 변형을 원장에 따로 등록해야 한다. 야간 조명 금지는 에펠탑 조명 연출 저작권 회피 장치다.
```

### `images/symbols/nl.webp` — 네덜란드 (nl) · symbol

주제: 풍차와 튤립 (level 1 · 유럽)

```text
SUBJECT: a Dutch windmill with a round dark brick tower, a shaggy thatched cap on top, and four white wooden sail-frames spread like a cross, standing beside a short stretch of narrow canal water, with a neat row of red, yellow and pink tulips blooming in front of it.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.

[노림수] 만 4세가 실루엣만으로 즉시 알아보는 최상급 상징. 상징물 축을 '동물 하나로 통일'하지 않고 나라별 최강 상징을 고를 때 무엇이 얻어지는지 보여 주는 사례다(네덜란드의 대표 동물은 4세에게 아무 의미가 없다).
```

### `images/symbols/is.webp` — 아이슬란드 (is) · symbol

주제: 퍼핀과 폭포 (level 2 · 유럽)

```text
SUBJECT: an Atlantic puffin standing on a mossy dark basalt rock, its round white face, black back and thick orange-and-grey striped beak clearly visible, its orange feet gripping the stone, with one narrow white waterfall dropping down a short dark cliff just behind it.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.

[노림수] 동물 축의 표준형. 의인화 금지(만화 눈·옷·웃는 입 없음)를 지키면서도 4세에게 친근하게 보이는지 확인하는 판이다. 레이캬비크의 대표 건축물은 교회라 종교 소재 회피 규칙에 걸리므로 상징물 축으로 돌린 사례이기도 하다.
```

### `images/places/va.webp` — 바티칸 (va) · landmark

주제: 성 베드로 광장의 열주와 오벨리스크 (바티칸시티 — 수도 일치, level 2 · 유럽)

```text
SUBJECT: St. Peter's Square in Vatican City seen from ground level: two sweeping curved colonnades of pale cream stone columns closing in from the left and right, and one tall narrow Egyptian obelisk of warm grey granite standing alone in the centre on a small stepped base, the paved ground completely empty.
ACCURACY: keep the real silhouette, the real number of major parts and the real material colour of this place correct, then simplify it into the STYLE below. Clear soft daytime light. No people, no vehicles, no modern signage, no night-time illumination or light show.
OVERRIDE for this image only: this is religious architecture shown purely from the outside as a piece of city design. The colonnade and the obelisk are allowed. Show no sacred figures in close-up, no statues as the main subject, no ceremony, no worshippers and no interior.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.

[노림수] 종교 소재를 어디까지 허용할지의 경계 사례. 바티칸은 국가 자체가 종교적이라 회피가 불가능하므로 '외관 건축만·인물 없음·의식 없음'으로 선을 긋는다. 이 판이 통과하면 같은 규칙으로 태국·미얀마·캄보디아 사원, 중동 모스크 외관까지 일관되게 처리할 수 있다. 통과하지 못하면 해당 나라들은 전부 상징물 축으로 돌려야 한다.
```

### `images/places/eg.webp` — 이집트 (eg) · landmark

주제: 기자의 피라미드와 스핑크스 (카이로 광역 — 수도 근접, level 1 · 아프리카)

```text
SUBJECT: the pyramids of Giza in Egypt: three limestone pyramids of clearly different heights standing side by side on warm sand, the tallest on the left, and the Great Sphinx in front of them at a much smaller scale, its lion body lying flat and its headdress striped in pale sandstone tones.
ACCURACY: keep the real silhouette, the real number of major parts and the real material colour of this place correct, then simplify it into the STYLE below. Clear soft daytime light. No people, no vehicles, no modern signage, no night-time illumination or light show.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.

[노림수] 개수가 사실인 대상('세 개')을 프롬프트에 숫자로 못박는 방법. 검수 때 피라미드가 2개나 5개로 나오면 무조건 재생성이다. 또한 기자는 행정상 카이로가 아니므로 원장 항목에 inCapital:false를 기록하고 화면 문구를 '이 나라의 명소'로 써야 하는 사례다. 스핑크스 얼굴은 '사람 얼굴'이 아니라 고대 조각이므로 금지 규칙과 충돌하지 않지만, 모델이 사람 얼굴로 해석해 거부하면 스핑크스를 빼고 피라미드만 남긴다.
```

### `images/symbols/mg.webp` — 마다가스카르 (mg) · symbol

주제: 여우원숭이와 바오바브나무 (level 2 · 아프리카)

```text
SUBJECT: a ring-tailed lemur with round amber eyes, a soft grey body and a long tail striped black and white curling upward, sitting calmly on a thick branch of a baobab tree that has a very fat smooth trunk and short bare branches at the top.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.

[노림수] 한 장에 동물 + 식물 두 요소를 넣는 표준 조합. '이 나라에만 있는 것' 두 개가 겹치면 4세도 나라 구분에 성공할 확률이 크게 오른다. 다만 요소가 셋 이상이면 그림이 복잡해져 실루엣 인지가 무너지므로 최대 2개를 원칙으로 삼는다.
```

### `images/symbols/na.webp` — 나미비아 (na) · symbol

주제: 붉은 모래언덕과 오릭스 (level 3 · 아프리카)

```text
SUBJECT: a tall deep-red sand dune of the Namib desert with one clean curving ridge line running from its top down to the right, its sunlit face warm orange and its shaded face deep rust, and a single oryx antelope with two long straight horns and a black-and-white face walking slowly across the pale sand at its foot.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.

[노림수] 난이도 3 나라(아프리카 54개국 중 다수)의 현실 점검. 민규가 한 번도 본 적 없는 대상이라 '학습'이 아니라 '새 암기'가 된다. 이 장을 실제로 아이에게 보여 주고 흥미를 보이는지가 194개국 전량 제작 여부를 가르는 판단 재료다 — 반응이 없으면 난이도 1의 49개국으로 범위를 줄이는 근거가 된다.
```

### `images/places/us.webp` — 미국 (us) · landmark

주제: 자유의 여신상 (뉴욕 — 수도 워싱턴 D.C.와 불일치, level 1 · 북아메리카)

```text
SUBJECT: the Statue of Liberty in New York, United States, standing full length: a pale green copper figure in a long draped robe, a seven-pointed spiked crown, the right arm raised high holding a golden torch, a flat tablet held against the left side, standing on a simple grey stone pedestal.
ACCURACY: keep the real silhouette, the real number of major parts and the real material colour of this place correct, then simplify it into the STYLE below. Clear soft daytime light. No people, no vehicles, no modern signage, no night-time illumination or light show. The tablet surface is completely blank with no inscription.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.

[노림수] 아빠가 직접 든 예시를 그대로 구현한 장이자, 이 기획의 가장 큰 데이터 함정을 눈에 보이게 만드는 장이다. 자유의 여신상은 뉴욕에 있고 미국 수도는 워싱턴 D.C.다. '수도 ↔ 랜드마크 매칭'을 그대로 만들면 이 카드가 오답 데이터가 된다. 두 선택지 중 하나를 골라야 한다 — (a) 축을 '나라 ↔ 대표 명소'로 바꾼다, (b) 수도 축을 유지하고 미국은 링컨 기념관이나 국회의사당으로 교체한다. 태블릿의 새김글을 명시적으로 지운 것은 글자 금지 규칙의 가장 흔한 위반 지점이기 때문이다.
```

### `images/symbols/tt.webp` — 트리니다드토바고 (tt) · symbol

주제: 스틸팬 드럼과 붉은따오기 (level 3 · 북아메리카 카리브해)

```text
SUBJECT: a Trinidadian steelpan drum: a shallow round metal pan with a gently dented playing surface divided into curved note sections, resting on a simple slim metal stand, with two rubber-tipped wooden sticks lying across its rim, and one scarlet ibis — a slender bright red bird with a long curved beak and thin legs — standing quietly beside the stand.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.

[노림수] 카리브해 소국(북아메리카 23개국 중 다수가 level 3)의 시험대. 금지 목록의 'chrome material'과 금속 악기가 충돌하므로, 스틸팬을 '반짝이는 크롬'이 아니라 '무광 금속의 얕은 팬'으로 서술해 충돌을 피했다. 이 요령은 모든 금속·유리 소재 상징물에 그대로 적용된다.
```

### `images/places/br.webp` — 브라질 (br) · landmark

주제: 팡지아수카르 봉우리와 케이블카 (리우데자네이루 — 수도 브라질리아와 불일치, level 1 · 남아메리카)

```text
SUBJECT: Sugarloaf Mountain in Rio de Janeiro, Brazil: a single rounded bare granite peak rising steeply straight out of calm blue bay water, its rock warm grey with green vegetation clinging to the lower slopes, one small boxy cable car cabin hanging from a thin wire across the left side, and a toucan with a large orange beak perched on a leafy branch in the lower foreground.
ACCURACY: keep the real silhouette, the real number of major parts and the real material colour of this place correct, then simplify it into the STYLE below. Clear soft daytime light. No people, no vehicles, no modern signage, no night-time illumination or light show.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.

[노림수] 소재 교체의 본보기. 브라질의 1순위 명소인 구세주 그리스도상은 (1) 조각가 사후 70년이 지나지 않아 저작권이 살아 있고 (2) 종교 소재 금지에도 걸린다. 두 사유가 겹치므로 자연 지형으로 갈아탔다. 원장 항목에 substitutedFrom과 사유를 기록해 두면, 나중에 왜 이 그림이 골라졌는지 다시 묻지 않아도 된다(mlx-audio의 note 필드와 같은 역할).
```

### `images/places/pe.webp` — 페루 (pe) · landmark

주제: 마추픽추와 라마 (쿠스코 지방 — 수도 리마와 불일치, level 1 · 남아메리카)

```text
SUBJECT: Machu Picchu in Peru: rows of grey stone terraces stepping up a green ridge, small rectangular roofless stone houses standing among them, and the steep pointed peak of Huayna Picchu rising directly behind, with one cream-coloured llama standing calmly on a terrace in the foreground.
ACCURACY: keep the real silhouette, the real number of major parts and the real material colour of this place correct, then simplify it into the STYLE below. Clear soft daytime light. No people, no vehicles, no modern signage, no night-time illumination or light show.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.

[노림수] 배경 없는 단색 규칙과 '풍경 자체가 주제'인 대상의 충돌 사례. 마추픽추는 산과 함께여야 알아볼 수 있으므로 뒤 봉우리를 주제의 일부로 명시했다. 이런 예외를 원장에 keepsBackdrop:true로 표시해 두면, 검수 때 '배경 오염'으로 잘못 반려하는 일이 없다.
```

### `images/symbols/au.webp` — 오스트레일리아 (au) · symbol

주제: 캥거루와 유칼립투스 (level 1 · 오세아니아)

```text
SUBJECT: a red kangaroo standing upright and balanced on its two strong hind legs and thick tapering tail, small forearms held in front, tall rounded ears alert, with a joey's head peeking out of its pouch, beside a slim eucalyptus tree with smooth pale bark and drooping grey-green leaves.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.

[노림수] 오스트레일리아의 1순위 명소인 시드니 오페라하우스는 건축가 저작권이 살아 있어 배제했다(브라질 예수상과 같은 사유). 명소 축을 포기하고 상징물 축으로 가는 것이 더 안전하고 4세에게도 더 잘 통하는 사례다. 이런 나라는 원장에 landmark 항목을 비워 두고 symbol만 채운다 — 단 이 경우 quiz.js:29-45 pool()에 '자료 있는 나라만' 필터를 반드시 걸어야 데이터 없는 나라가 보기로 섞이지 않는다.
```

### `images/symbols/pw.webp` — 팔라우 (pw) · symbol

주제: 록아일랜드와 황금해파리 (level 3 · 오세아니아)

```text
SUBJECT: the Rock Islands of Palau: two small rounded limestone islands densely covered in green jungle, each clearly undercut and narrowed at the waterline like a mushroom, sitting in a small patch of calm turquoise lagoon water, with three or four small round golden jellyfish drifting gently in the clear water in front of them.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.

[노림수] 오세아니아 14개국 중 9개가 level 3이고, 대부분 섬나라라 상징물이 서로 비슷해진다(야자수·석호·산호). 여기서 팔라우는 '버섯 모양으로 잘록한 섬'과 '쏘지 않는 황금해파리'라는 이 나라만의 형태를 명시해 다른 태평양 섬나라와 구분되게 했다. 태평양 섬나라 전체를 만들 때 이 '형태 차이 한 가지를 반드시 문장에 넣는다'는 규칙을 그대로 적용한다.
```

---

## 6. 생성 운영 절차

아래 회차 설명과 단순 원장 예시는 초기 설계 기록이다. 실행 정본은 HANDOFF.md의 4단계 도구 → 5단계 영어 피사체·A/B 파일럿 16장·앵커 → 6단계 본 생성 → 7단계 전량 공개 순서다. 화풍은 2026-09-15 사용자 선택으로 **B 확정**이다(D7) — 이 문단의 옛 '미정' 서술을 대체한다. presets.json.styleChoice의 미선택 기본값 null과 null인 본 생성 거부 계약은 그대로 두되, 이 프로젝트의 원장에는 b를 반영한다. 앵커·소재 승인 등 나머지 사람 구간은 여전히 먼저 시작하지 않는다.

━━━ 0단계. 원장을 먼저 만들고, 그림은 나중에 ━━━
음악 팩이 presets.json을 먼저 확정하고 생성에 들어간 것과 같은 순서다. 이미지는 그 순서가 더 중요하다 — 사실 오류와 소재 부적절은 그림이 아니라 '주제 한 문장'에서 결정되기 때문이다.

새로 만들 파일 (docs/mlx-audio와 1:1 대응):
  docs/image-prompts/README.md        무엇을·어떤 도구로·공통 설정표·순서·검수 (docs/mlx-audio/README.md와 같은 톤)
  docs/image-prompts/presets.json     공통 블록 + 나라별 슬롯 값
  docs/image-prompts/prompts/<code>-<kind>.txt   실제로 보낸 프롬프트 전문 (mlx-audio의 prompts/ 16개와 같은 역할)
  docs/image-prompts/settings.csv     입력값·상태 표
  docs/image-prompts/index.html       프롬프트 보드 — 종류를 고르고 전문을 복사 (mlx-audio의 index.html과 같은 역할)
  docs/image-prompts/anchor/kr.png    승인된 기준 이미지 1장

presets.json은 현재 목표 342항목(symbol 194 + landmark 148)을 담고 공통 4문단은 화풍별로 한 번만 보관한다. 아래 단순 예시는 구조 설명용이며, styleChoice:null과 common.styles.a/b를 포함한 정확한 필드는 HANDOFF.md의 T2-ledger-seed를 따른다.

  {
    "created": "2026-09-15",
    "templateVersion": "FQ-IMG-v1", "styleChoice": null,
    "common": {
      "tool": "GPT 계열 이미지 도구",
      "aspect": "4:3 (도구가 못 내면 3:2로 뽑아 중앙 크롭)",
      "blocks": {
        "composition": "COMPOSITION (identical for every image…) …",
        "style":       "STYLE (copy this paragraph unchanged…) …",
        "exclusions":  "DO NOT INCLUDE: …",
        "output":      "OUTPUT: exactly one illustration …"
      }
    },
    "items": [
      { "code":"kr", "kind":"landmark", "ko":"광화문", "subjectEn":"Gwanghwamun, the main gate of …",
        "inCapital":true, "override":null, "substitutedFrom":null, "keepsBackdrop":false,
        "outputStem":"images/places/kr", "status":"approved", "tries":3, "bytes":68420 }
    ]
  }

settings.csv 열: code, kind, ko주제, subjectEn, inCapital, override유무, substitutedFrom, status(draft|approved-text|generated|approved-image|rejected), tries, 생성일.

아빠 승인은 이 CSV의 '한국어 주제 한 줄'만 보고 한다. 194줄을 읽는 데 20분이면 되고, 여기서 걸러진 오류는 이미지 한 장 값을 통째로 아낀다. status가 approved-text가 아닌 항목은 생성하지 않는다.

━━━ 1단계. 앵커 확정 (딱 한 번, 30분) ━━━
텍스트만으로 일관성을 잡는 설계에서 가장 중요한 단계다. 시드도 레퍼런스도 못 쓴다고 가정하므로, '기준이 되는 한 장'을 사람이 정해 두고 이후 모든 판정을 그 한 장과의 비교로 한다.
1. kr 랜드마크 프롬프트를 5~8번 새로 뽑는다. (같은 대화에서 "다시"가 아니라, 매번 프롬프트 전문을 새로 붙여넣는다)
2. 선 굵기·채도·광원 방향·배경색이 가장 기준에 맞는 1장을 고른다.
3. docs/image-prompts/anchor/kr.png 로 저장하고 커밋한다. 이 파일은 앱에 들어가지 않는다. 검수용이다.

━━━ 2단계. 파일럿 8장 (1~2시간) ━━━
위 샘플 중 kr·jp·fr·eg·us·br·au·pw 8장을 뽑는다. 6대륙 전부와 난이도 1·3이 섞이고, 세로로 긴 대상(에펠탑·자유의 여신상)과 개수가 사실인 대상(피라미드 3개)과 저작권 교체 사례(브라질)가 모두 들어 있다.
검수는 두 겹이다.
 (a) 아빠 눈 — 아래 체크리스트 전체.
 (b) 민규 — 아이패드 실기기에서 카드에 얹어 보여 주고, 정답을 알려주기 전에 "이게 뭐야?"만 묻는다. 8장 중 몇 장을 알아보는지 센다.
스타일을 고칠 거라면 지금이 마지막 기회다. 고친 뒤에는 반드시 1단계 앵커부터 다시 만든다. 100장을 뽑은 뒤에 스타일을 바꾸면 100장을 다시 뽑아야 한다.

━━━ 3단계. 본 생성 ━━━
한 회차 = 한 대화(conversation) = 8~12장. 10장이면 생성 1~2분 + 즉시 검수 1분으로 약 30분이다. 난이도 1의 49개국 랜드마크 1축이면 5회차, 49개국 2축이면 10회차, 194개국 2축이면 40회차다.

회차 규칙 네 가지:
 1. 매 프롬프트는 SUBJECT부터 OUTPUT까지 전문을 붙여넣는다. "아까 그 스타일로 다음 나라"라고 쓰지 않는다. 이것이 드리프트 1순위 원인이다.
 2. 회차의 첫 장은 언제나 앵커 재생성(kr 프롬프트)이다. 나온 그림을 anchor/kr.png와 나란히 놓고 본다. 선 굵기·배경색·채도가 눈에 띄게 다르면 그 대화를 버리고 새 대화에서 다시 시작한다. 이것이 시드 없이 쓸 수 있는 유일한 드리프트 계측기다.
 3. 대화가 길어질수록 모델이 앞 그림을 참고해 스타일이 흐르거나 뭉개진다. 12장을 넘기지 않는다.
 4. 회차 중간에 프롬프트 문구를 고치지 않는다. 고칠 일이 생기면 메모해 두고 회차를 끝낸 뒤 원장(common.blocks)에서 고치고 templateVersion을 FQ-IMG-v2로 올린다. v1과 v2 이미지를 섞지 않는다.

━━━ 4단계. 즉시 1차 검수 ━━━
그 자리에서 아래 체크리스트의 A군(글자·국기·사람 얼굴·배경 오염·여백) 다섯 개만 본다. 하나라도 걸리면 바로 재생성한다.

재생성 기준:
 · A군 위반 → 무조건 재생성 (같은 프롬프트로 1회, 그래도 실패하면 SUBJECT 문장에 금지를 한 줄 추가)
 · 앵커 대비 스타일 이탈 → 재생성. 3회 연속이면 그 대화를 버린다.
 · 사실 오류(피라미드 개수, 에펠탑 다리 개수, 국기 무늬 혼입) → 재생성 1회 → 또 틀리면 SUBJECT를 더 단순한 구도로 다시 쓴다.
 · 4세가 못 알아봄 → 재생성이 아니라 주제 교체다. 원장의 subjectEn을 고치고 status를 draft로 되돌린다.
 · 같은 나라에서 5회 실패 → 그 나라를 보류 목록에 넣고 다음으로 넘어간다. 모델과 싸우지 않는다. 한 나라에 붙잡혀 회차 전체가 무너지는 것이 더 큰 손해다.

━━━ 5단계. 원본 보관 ━━━
음악 팩이 원본 WAV를 docs/artifacts/mlx-music/raw/에 두고 앱용 MP3를 audio/music/에 따로 둔 것과 같다.
 · 원본 PNG → docs/artifacts/images/raw/<code>-<kind>-<시도번호>.png
   이 경로는 .gitignore의 docs/artifacts/ 아래라 저장소가 불지 않는다. 채택하지 못한 시도도 함께 남긴다.
 · 원본을 앱용으로 덮어쓰지 않는다. (음악 팩의 "WAV 원본을 MP3로 덮어쓰지 않는다"와 같은 규칙)

━━━ 6단계. 편집·변환 ━━━
 1. 4:3 중앙 크롭 (3:2로 뽑았다면 좌우를 잘라낸다. 프롬프트가 좌우 12% 여백을 요구한 이유다)
 2. presets.json.styleChoice에 따라 A는 768×576, B는 1024×768로 축소한다. 기본값 null을 임의 화풍으로 치환하지 않는다.
 3. WebP q80으로 인코딩한다. A는 경고 40KB·실패 60KB, B는 경고 110KB·실패 150KB이며 기계 검수도 같은 프리셋을 읽는다.
 4. images/symbols/<code>.webp 또는 images/places/<code>.webp 에 저장

주의: 2026-09-15 맥 실측으로 /usr/bin/sips(sips-316, WebP 읽기 전용), /opt/homebrew/bin/cwebp(1.6.0, 쓰기 가능)가 있다. ffmpeg·magick·convert는 PATH에 없다. `sips --formats | grep -i webp` 출력은 `org.webmproject.webp         webp  `이며 Writable 표시가 없다. package.json의 의존성은 0개이고 build-site.mjs는 변환하지 않는다. 원본 PNG는 보존하고 그림이 확보된 6단계에서 변환한다.

━━━ 7단계. 원장 갱신 ━━━
 · prompts/<code>-<kind>.txt 에 실제로 보낸 프롬프트 전문을 저장한다 (조립 결과 그대로)
 · presets.json 항목에 status:"approved-image", tries, bytes 기록
 · settings.csv 한 줄 갱신
 · README.md의 진행 표 갱신 (음악 팩이 "16종 모두 생성·연결했다"를 첫머리에 적은 것과 같은 자리)

━━━ 8단계. 앱 연결 (이미지가 30장쯤 모였을 때 한 번에) ━━━
코드 쪽에서 반드시 같이 해야 하는 것들:
 · scripts/build-site.mjs의 폴더 배열에 T4에서 추가한 'images'를 확인한다. images/symbols/·images/places/의 .gitkeep을 유지하여 그림 0장에서도 빌드되게 한다.
 · sw.js의 기존 ART_CACHE와 /images/ 분기를 유지하고, warmImages()는 install이 아니라 activate에서 20개씩 개별 catch로 예열한다. SHELL에 그림을 넣지 않는다. AUDIO_CACHE='flagquiz-v4'를 바꾸거나 새 IMG_CACHE를 만들지 않는다.
 · 그림 파일명은 같고 내용만 바뀌면 cache-first가 옛 응답을 유지하므로 ART_CACHE만 갱신한다. 음원·국기·셸 캐시를 그림 교체 때문에 올리지 않는다.
 · scripts/serve.mjs:16-29 TYPES 테이블에 '.webp': 'image/webp' 추가 — 없으면 npm start 로컬에서만 그림이 안 뜬다
 · tests/run.mjs:114-124 의 '194개 다 있고 고아 파일 없음' 검사를 새 폴더용으로 복제 (부분 집합이면 'presets.json에 approved-image인 나라만 파일이 있을 것'으로 바꾼다)
 · js/ui.js:13 flagSrc() 옆에 symbolSrc()/landmarkSrc() 추가 — 코드→경로 매핑 진입점을 한 곳으로 유지한다

━━━ 진행 속도 요약 ━━━
원장 작성 194항목 ≈ 4~6시간(자료 조사 포함) → 아빠 승인 20분 → 앵커 30분 → 파일럿 1~2시간 → 본 생성 10장/30분. 난이도 1의 49개국 1축이면 본 생성은 2~3시간이다. 194개국 2축(388장)이면 본 생성만 20시간이다. 이 격차가 범위 결정의 실제 근거다.

---

## 7. 검수 체크리스트

눈대중 대신 기계적으로 거른다. 하나라도 걸리면 재생성하거나 소재를 교체한다.

- [ ] [A-1 글자] 그림 안에 글자·숫자·서명·워터마크가 한 글자도 없는가. GPT 계열 이미지 도구의 최빈 실패다. 특히 간판·현판·비석·태블릿·책·깃발 무늬가 있는 대상에서 튀어나온다 (광화문 현판, 자유의 여신상 태블릿).
- [ ] [A-2 국기] 그림 안에 국기나 국기처럼 보이는 줄무늬·별·초승달 문양이 없는가. 앱이 이미 flags/<code>.svg를 보여 주므로, 그림 속 부정확한 국기는 아이에게 잘못된 국기를 가르친다.
- [ ] [A-3 사람] 알아볼 수 있는 사람 얼굴·군중·실존 인물이 없는가. 스핑크스처럼 고대 조각의 얼굴은 허용한다.
- [ ] [A-4 배경] 배경이 단색 #F1F5FB 한 장인가. 그라데이션·하늘·구름·지평선·풍경·소품이 섞이지 않았는가. (예외: 원장에 keepsBackdrop:true로 표시한 항목 — 마추픽추의 뒷산처럼 배경이 주제의 일부인 경우)
- [ ] [A-5 여백] 좌우 끝에 각각 화면 폭의 12% 이상 빈 배경이 있는가. 3:2로 뽑아 4:3으로 중앙 크롭했을 때 주제가 잘리지 않는가. 세로로 긴 대상(에펠탑·자유의 여신상)에서 위아래가 잘리지 않았는가.
- [ ] [B-1 앵커 비교] anchor/kr.png와 나란히 놓고 볼 때 외곽선 굵기, 외곽선 색(검정으로 흘렀는지), 채도, 종이 질감, 광원 방향(좌상단)이 같은가. 회차마다 첫 장에서 반드시 확인한다.
- [ ] [B-2 그림자] 주제 바로 밑의 흐린 타원 하나뿐인가. 배경에 드리운 긴 그림자나 액자 그림자가 없는가.
- [ ] [B-3 단일성] 같은 주제가 두 개 이상 복제되지 않았는가. 격자·여러 칸·스티커 시트·목업으로 나오지 않았는가.
- [ ] [C-1 사실 개수] 개수가 사실인 요소가 맞는가. 피라미드 3개, 에펠탑 다리 4개, 풍차 날개 4장, 여신상 왕관 뿔 7개, 광화문 아치 3개. 원장의 subjectEn에 숫자로 적어 둔 것과 대조한다.
- [ ] [C-2 사실 형태] 실루엣과 재료 색이 실제와 맞는가. 여신상이 청록 구리색인가(회색·금색 아님), 에펠탑이 갈색 계열인가(검정·회색 아님), 게르가 둥근가(원뿔 텐트 아님).
- [ ] [C-3 소재 부적절] 종교 의식·성상 근접·군인·무기·불타는 재난·무서운 표정·날카로운 이빨이 없는가. 종교 건축은 외관만 허용한다는 원칙(바티칸 사례)이 지켜졌는가.
- [ ] [C-4 저작권] 대상이 1928년 이후에 만들어진 조각·건축이면서 작가 사후 70년이 지나지 않았는가. 대표 위험군: 시드니 오페라하우스, 구세주 그리스도상, 에펠탑 야간 조명 연출, 현대 초고층 빌딩. 걸리면 재생성이 아니라 소재 교체이며, 원장에 substitutedFrom과 사유를 남긴다.
- [ ] [D-1 아이 인지] 아이패드 실기기에서 카드 크기로 띄우고, 정답을 알려주기 전에 민규에게 "이게 뭐야?"만 묻는다. 못 알아보면 재생성이 아니라 주제 교체다. 아빠가 알아보는 것과 만 4세가 알아보는 것은 다르다.
- [ ] [D-2 다크모드] css/style.css:27-46의 다크 토큰(--card #1e2439) 위에 올렸을 때 #F1F5FB 배경이 흰 네모로 도드라지지 않는가. 도드라진다면 앱 쪽에서 이미지 카드에 밝은 바탕을 항상 깔거나, 투명 배경 생성으로 전환해야 한다.
- [ ] [D-3 국기와 나란히] 같은 화면에 flags/<code>.svg와 함께 놓았을 때 크기·비율·여백이 어울리는가. 국기 194개는 전부 viewBox 640×480(4:3)이고 CSS도 aspect-ratio:4/3로 통일돼 있다. 그림이 4:3이 아니면 화면이 흔들린다.
- [ ] [E-1 파일] 4:3 WebP q80이며 presets.json.styleChoice의 규격과 일치하는가. A는 768×576·경고 40KB·실패 60KB, B는 1024×768·경고 110KB·실패 150KB다. null인 본 생성은 거부하는가. 실제 배포 총량은 빌드 산출물로 잰다.
- [ ] [E-2 이름] 파일명이 images/symbols/<code>.webp 또는 images/places/<code>.webp이고 code가 countries.js의 code와 정확히 일치하는가. 목록에 없는 고아 파일이 폴더에 남아 있지 않은가 (tests/run.mjs:114-124가 flags/에 대해 하는 검사와 같은 규칙).
- [ ] [E-3 원장] prompts/<code>-<kind>.txt에 실제로 보낸 프롬프트 전문이 저장됐는가. presets.json의 status·tries·bytes가 갱신됐는가. 그림만 있고 원장에 없는 파일, 원장에만 있고 그림이 없는 항목이 없는가.
- [ ] [E-4 배포] build-site.mjs가 images를 복사하고 serve.mjs TYPES에 .webp가 있는가. sw.js는 기존 ART_CACHE·/images/ 분기를 재사용하고 AUDIO_CACHE='flagquiz-v4'를 그대로 보존하는가. 그림 교체 때는 ART_CACHE만 갱신하는가.

---

## 8. 아직 정해지지 않은 것

- 【도구 능력 확인 — 이게 먼저입니다】 쓰실 GPT 계열 도구에서 (a) 레퍼런스 이미지를 첨부해 '이 그림체로'가 되나요, (b) 시드 고정이 되나요, (c) 4:3 가로 출력이 되나요 아니면 정사각만 되나요, (d) 한 번에 여러 장 배치 생성이 되나요? 네 가지 중 (c)만은 결과물 구조를 바꿉니다 — 정사각만 된다면 맥에서 sips로 좌우에 흰 여백을 덧대는 후처리 한 단계가 파이프라인에 추가되어야 합니다. 나머지 셋은 안 되더라도 위 전술로 커버되니, 우선 아무 한 장을 뽑아 보시고 되는 것만 알려 주세요.
- 【세로로 긴 랜드마크를 어떻게 할까요】 에펠탑·부르즈할리파·피사의 사탑은 4:3 가로 캔버스에서 좌우 여백이 커지고 그만큼 작아집니다. (1) 전체 실루엣을 유지하고 작아지는 것을 받아들인다 — '뾰족한 격자탑'이라는 전역 윤곽이 4세의 재인 단서이므로 제 권장은 이쪽입니다. (2) 상단부만 크게 잘라 그린다 — 크고 시원하지만 '탑 전체'라는 단서를 잃습니다. 이건 스타일이 아니라 콘텐츠 판단이라, 에펠탑 한 장을 두 방식으로 뽑아 민규에게 나란히 보여 주고 어느 쪽에서 반응이 나오는지 보는 게 가장 확실합니다.
- 【배경 원을 대륙 6색으로 나눌까요, 단색 하나로 갈까요】 저는 단색 #EEF4FF 하나를 권했습니다(세계관이 갈라지지 않게). 다만 아빠가 지도·대륙을 가르치고 싶어 하시니, 원 색만 대륙 6색으로 나누면 아이가 글자를 못 읽어도 '초록 원은 아프리카'라는 단서가 공짜로 생깁니다. 대륙은 이 앱에서 이미 1급 개념이고요(continent 필드, 대륙 배지 6종, 오늘의 도전). 대신 그림 수백 장이 6개 묶음으로 갈라져 보이는 대가를 치릅니다. 이건 학습 효과 vs 시각 통일의 맞교환이라 아빠가 정하셔야 합니다.
- 【밤에도 쓰나요 — 다크모드를 진지하게 볼지】 지금 국기는 흰 배경 이미지라 다크 화면에서 흰 판으로 떠 있습니다. 그림이 194~388장 더해지면 다크 화면의 흰 면적이 서너 배가 됩니다. 민규가 저녁·밤에도 이 앱을 쓴다면 그림 배경을 흰색이 아니라 '밝기가 낮은 크림색'으로 잡는 편이 나을 수 있는데, 그러면 밝은 화면의 흰 카드 위에서 살짝 뜹니다. 실제 사용 시간대를 알려 주시면 한쪽으로 확정하겠습니다.
- 【첫 앵커 3장을 어느 나라로 할까요】 저는 성격이 다른 3축(건축·동물·음식)을 권합니다. 다만 최종 검수 기준이 '민규가 알아보는가'라서, 민규가 가장 확실히 좋아하거나 자주 말하는 나라 3개로 잡는 게 좋습니다. 그 3장이 통과하면 나머지 수백 장의 기준이 되고, 통과 못 하면 스타일을 지금 바꾸면 되니 손실이 3장뿐입니다. 어느 나라가 좋을까요?
- 【이 스타일을 SPEC.md에도 반영할까요】 design/SPEC.md:8이 대상 연령을 7~10세로 적어 두었고 아트보드 본문 글자가 9~12.5px입니다. 이번 그림은 4세 기준(섬네일에서 방 건너편에서도 식별)으로 잡았는데, 그림만 4세용이고 그 그림을 담는 화면은 7~10세용이면 짝이 안 맞습니다. 새 화면 3개만 4세 기준으로 갈지, SPEC의 연령 전제를 통째로 4세로 내릴지 정해 주시면 이 스타일 문서를 SPEC에 정식 편입하겠습니다.
- 랜드마크 모드를 내면 오세아니아는 14개국 중 0개국, 아프리카는 54개국 중 5개국만 나옵니다. 민규가 '아프리카와 태평양은 볼 게 없는 곳'이라고 배우게 되는데, 이 편중을 감수하고 48개국짜리 미니 모드로 낼까요, 아니면 대륙 균형이 맞는 상징물 축을 먼저 완성하고 랜드마크는 뒤로 미룰까요?
- countries.js의 fact 최소 16개가 이미 '수도가 아닌 곳의 명소'를 가르치고 있고 그 음원이 이미 녹음돼 민규가 듣고 있습니다(인도→타지마할, 스위스→알프스, 아랍에미리트→부르즈할리파 등). 이 문장들을 랜드마크 모드의 정답 해설로 그대로 재사용할까요(음성 추가 0개, 배포 게이트 통과), 아니면 fact를 수도 기준으로 고치고 음원을 다시 만들까요(16개 이상 재녹음 + Typecast 과금)?
- 수도 자체가 아이 기준으로 성립하지 않는 7개국을 어떻게 할까요 — 볼리비아(헌법상 수크레, 실질 라파스), 남아프리카공화국(행정 프리토리아·입법 케이프타운·사법 블룸폰테인 3수도), 스리랑카(스리자야와르데네푸라코테 15자, 실생활은 콜롬보), 코트디부아르(야무수크로 vs 아비장), 베냉(포르토노보 vs 코토누), 미얀마(네피도 vs 양곤), 탄자니아(도도마 vs 다르에스살람). 데이터를 그대로 두고 모드에서만 뺄까요, 병기할까요?
- 상징물을 '그 나라 국기에 실제로 그려진 것'에서 우선 뽑을까요? 36개국이 해당하고 민규가 국기를 이미 90% 외웠으니 전이가 즉시 일어납니다. 다만 그중 6개국(오만 단검·사우디 칼·앙골라 칼·케냐 창·바베이도스 삼지창·모잠비크 AK-47 소총)은 무기라 4세 콘텐츠에서 빼야 하는데, 이 6개국만 다른 상징으로 갈아끼우는 것으로 괜찮을까요?
- 아프리카 54개국의 동물 카테고리 상한을 10개국(18.5%)으로 두고, 그것도 국기·국장에 실제로 있는 동물만 쓰자는 제안인데 동의하시나요? 나머지 44개국은 카카오·커피·바오바브·켄테 천·타진 같은 식물과 만든 것으로 채웁니다.
- 도쿄타워와 에펠탑은 4세에게 사실상 같은 그림입니다(둘 다 S·A 등급). 부다페스트 국회↔런던 국회, 아테네 파르테논↔로마 콜로세움도 같은 문제입니다. 이 혼동 쌍을 같은 판에 내지 않도록 배제 규칙을 엔진에 넣을까요, 아니면 아예 한쪽을 다른 소재로 바꿀까요(예: 일본은 도쿄타워 대신 벚꽃·초밥)?
- 제가 매긴 등급은 성인 기준 추정이고 민규 실측이 아닙니다. S등급 7장을 먼저 그려 라벨을 가린 채 보여주고, 7장 중 4장 이상을 사물로 알아보지 못하면 랜드마크 축을 접는다 — 이 중단 기준에 동의하시나요? 아니면 아빠가 다른 판정선을 두시겠습니까?
- 술과 담배를 상징물에서 전면 제외하면 프랑스·조지아·몰도바·체코·아일랜드·쿠바 6개국의 가장 유명한 상징이 빠집니다(와인·맥주·시가). 대체안(포도밭·천문시계·하프·올드카)을 제가 만들어 승인만 받을까요, 아빠가 직접 고르시겠습니까?
- 실존 인물을 상징물로 쓸까요, 물건으로 우회할까요 — 오스트리아 모차르트를 얼굴로 그릴지 피아노로 그릴지, 남아공 만델라를 얼굴로 그릴지 프로테아 꽃으로 그릴지입니다. 물건 우회를 기본값으로 하고 예외를 두지 않는 쪽을 권합니다.
- C등급 146개국은 랜드마크 카드가 없는데, 194칸 스티커판의 완결성을 지키려면 이 146개국을 상징물 카드로만 채우게 됩니다. 결과적으로 48개국은 카드가 2장(랜드마크+상징물), 146개국은 1장이 되어 아이 눈에 나라 사이 서열이 생깁니다. 모든 나라를 같은 장수로 맞출까요, 아니면 랜드마크를 아예 별도 화면으로 빼서 스티커판과 분리할까요?
- 배경을 단색 #F1F5FB로 고정할까요, 투명 배경으로 뽑을까요? 이 앱은 다크모드를 지원해서(css/style.css:27-46, --card #1e2439) 밝은 단색 배경 그림이 어두운 카드 위에서 흰 네모로 도드라질 수 있습니다. 투명 배경은 그 문제가 없지만, GPT 계열 도구가 텍스트 프롬프트만으로 투명 PNG를 내주는지가 확인되지 않았습니다. 권장은 파일럿 8장을 단색으로 뽑아 실기기 다크모드에서 직접 보고 정하는 것입니다 — 어색하면 앱 쪽에서 이미지 카드에 항상 밝은 바탕을 까는 편이 재생성보다 쌉니다.
- 도구가 4:3을 못 내면 어떻게 할까요? 국기 194개가 전부 viewBox 640×480(4:3)이고 CSS도 aspect-ratio:4/3로 통일돼 있어서, 그림만 1:1이나 3:2면 화면이 흔들립니다. 선택지는 (a) 3:2로 뽑아 좌우를 잘라 4:3으로 만든다(현 템플릿의 '좌우 12% 여백' 규칙이 이걸 위한 장치입니다), (b) 1:1로 뽑고 CSS에서 위아래 여백을 준다, (c) 그림만 다른 비율로 두고 전용 카드를 만든다. 파일럿 첫 장에서 실제 출력 비율을 확인한 뒤 정하면 됩니다.
- 한 대화에서 몇 장까지 이어 뽑아도 될까요, 그리고 대화 문맥을 스타일 락으로 인정할까요? 지금 설계는 '텍스트만 신뢰'라서 매번 전문을 붙여넣게 했습니다. 그런데 GPT 계열 도구는 같은 대화 안에서 앞 이미지를 참고해 오히려 일관성이 올라가는 경우도 있습니다. 파일럿에서 (A) 새 대화 8장과 (B) 한 대화 8장을 각각 뽑아 앵커와 비교해 보고, 더 나은 쪽을 회차 규칙으로 확정하는 것을 권합니다.
- 앵커 재생성 검사를 몇 장마다 넣고, 드리프트를 발견하면 이전 것들을 어떻게 할까요? 지금 안은 '회차마다 첫 장'입니다. 문제는 회차 10장을 다 뽑은 뒤 마지막에 드리프트를 발견했을 때 그 10장을 다시 뽑을지 그냥 둘지입니다. 완벽한 일관성을 고집하면 재작업이 계속 늘고, 느슨하게 가면 스티커판에 성격이 다른 그림이 섞입니다. 어느 쪽 비용을 감수하실지 미리 정해 두는 편이 낫습니다.
- 한 나라에서 상징물과 랜드마크가 같은 그림이 되는 경우는 어떻게 가를까요? 이집트는 피라미드가 상징이자 명소이고, 일본은 후지산, 페루는 마추픽추가 그렇습니다. 두 축을 억지로 다르게 채우면 두 번째 축이 억지 소재가 됩니다. 선택지는 (a) 그런 나라는 한 장만 만들고 두 모드가 같은 그림을 공유한다, (b) 한 나라 한 장 원칙으로 아예 축을 하나로 합친다, (c) 억지로라도 두 장을 채운다. (b)가 제작량을 절반으로 줄입니다.
- 동물·생물을 그릴 때 만화적으로 의인화할까요, 실제 비율을 지킬까요? 지금 템플릿은 '의인화 금지, 실제 비율'입니다. 4세 친화성은 만화 쪽이 높지만, 큰 눈과 웃는 입을 붙이면 '학습 자료'가 아니라 '캐릭터'가 되어 실물을 볼 때 연결이 끊길 수 있습니다. 파일럿의 퍼핀·여우원숭이·캥거루 3장에서 민규 반응을 보고 정하시면 됩니다. 바꾸신다면 앵커부터 다시 만들어야 합니다.
- 원장의 주제 문장을 한국어와 영어 둘 다 둘까요, 영어만 둘까요? 아빠 검수는 한국어 한 줄이 압도적으로 빠릅니다(194줄 20분). 하지만 두 언어를 두면 나중에 영어만 고치고 한국어를 안 고치는 어긋남이 생깁니다. 권장은 한국어를 승인용 요약으로만 쓰고(2~10자), 실제 프롬프트에 들어가는 문장은 영어 하나만 원본으로 삼는 것입니다.
- **캐시 교체 정책 — 확정**: T2의 ART_CACHE와 /images/ 분기를 재사용한다. 같은 경로의 그림을 교체할 때 ART_CACHE만 갱신하며, AUDIO_CACHE='flagquiz-v4'는 최초 공개를 포함해 절대 바꾸지 않는다. 새 이미지 버킷을 또 만들지 않는다.
