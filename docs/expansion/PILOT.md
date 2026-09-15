# 화풍 A/B 파일럿 — 오늘 바로 돌릴 수 있는 16장

같은 소재 8종을 화풍 A와 B로 각각 뽑아 비교한다. **피사체 문장은 A와 B가 글자 단위로 같고 스타일 블록만 다르다.**

> 194개국 전량을 완성한 뒤 한 번에 공개하기로 했으므로(D4), 화풍이 틀리면 재작업 범위가 194장 전부다.
> 이 16장이 그 위험을 막는 유일한 장치다. 본 생성 전에 반드시 끝낸다.

---

## 소재 8종과 각각이 검증하는 것

| 코드 | 나라 | 축 | 주제 | 무엇을 검증하나 |
|---|---|---|---|---|
| `ve` | 베네수엘라 | landmark | 앙헬 폭포 — 테푸이 절벽 꼭대기에서 한 줄기로 떨어지는 세상에서 가장 높은 물줄기 | 세로로 긴 대상 |
| `nl` | 네덜란드 | landmark | 킨더다이크 풍차 한 채 — 날개 정확히 네 장 | 개수가 사실인 대상 |
| `kr` | 대한민국 | landmark | 경복궁 광화문 — 아치 세 개 위에 겹처마 기와지붕 두 층 | 글자가 들어가기 쉬운 대상 |
| `cn` | 중국 | symbol | 대나무를 두 앞발로 쥔 판다 | 동물 |
| `cn` | 중국 | landmark | 만리장성 — 능선을 따라 굽이치는 성벽과 망루 한 채 | 상징물과 명소가 둘 다 있는 나라(위의 판다와 한 세트) |
| `be` | 벨기에 | symbol | 네모 칸이 깊게 파인 와플 | 먹을거리 |
| `jp` | 일본 | landmark | 후지산 — 눈 덮인 대칭 원뿔 화산 | 민규가 확실히 아는 나라(기준점) |
| `bf` | 부르키나파소 | symbol | 티에벨레의 검정·하양·빨강 무늬를 손으로 그린 흙집 | 4세에게 어려울 것 같은 나라(인지 한계 측정) |

<details><summary>각 소재를 고른 이유 (전문)</summary>

**베네수엘라 · 앙헬 폭포 — 테푸이 절벽 꼭대기에서 한 줄기로 떨어지는 세상에서 가장 높은 물줄기** — 세로로 긴 대상. 979m 한 줄기 물기둥을 4:3 가로 프레임에 넣으면 어떻게 되는지를 본다. (a) 물줄기가 위아래로 잘리는가 (b) 실물보다 짧고 뭉툭해지는가 (c) 피사체를 통째로 작게 줄여 좌우 여백만 커지는가. 셋 중 어느 실패가 나는지가 194장 전체의 세로 소재(에베레스트·부르즈할리파·백향목) 처리 방침을 결정한다.

**네덜란드 · 킨더다이크 풍차 한 채 — 날개 정확히 네 장** — 개수가 사실인 대상. 날개를 4장으로 그리는지 5·6·3장으로 틀리는지, 십자 배치를 지키는지를 눈으로 센다. 프롬프트에 exactly four라고 못박았는데도 틀린다면 '개수는 프롬프트로 못 잡는다'가 확정되고, 피라미드 3개·산마리노 탑 3개·북마케도니아 빛줄기 8개 같은 항목은 전부 생성 후 검수 항목으로 넘겨야 한다.

**대한민국 · 경복궁 광화문 — 아치 세 개 위에 겹처마 기와지붕 두 층** — 글자가 들어가기 쉬운 대상. 실물 광화문 정면에는 현판 글씨가 있다. 피사체 문장에서 현판을 일부러 빼 두었으므로, 모델이 스스로 한자·한글·엉뚱한 라틴문자를 채워 넣는지가 금지 문구의 실효성을 그대로 보여 준다. 아치 3개라는 개수도 함께 검증된다.

**중국 · 대나무를 두 앞발로 쥔 판다** — 동물. 만화화 정도를 재는 자. 눈이 사람처럼 커지는지, 머리가 몸보다 커지는지, 웃는 표정이 붙는지, 두 발로 서서 의인화되는지를 A·B에서 나란히 본다. 민규가 이미 아는 동물이라 '귀엽다'와 '이상하다'의 경계가 가장 빨리 드러나는 소재다.

**중국 · 만리장성 — 능선을 따라 굽이치는 성벽과 망루 한 채** — 상징물과 명소가 둘 다 있는 나라(위의 판다와 한 세트). 같은 나라의 두 축이 한 세계관으로 보이는지를 판정하는 유일한 쌍이며, 8장 중 이 두 장만 나란히 놓고 봐야 한다. 덤으로 가로로 아주 긴 피사체라 앙헬 폭포(세로)와 정반대의 프레이밍 테스트가 된다.

**벨기에 · 네모 칸이 깊게 파인 와플** — 먹을거리. 질감 표현이 화풍 차이를 가장 크게 드러내는 소재. A는 면당 2톤 평면이라 깊은 홈을 그림자면 하나로만 표현해야 하고, B는 과슈 질감과 종이 결이 그대로 살아난다. '먹고 싶어 보이는가'가 아빠가 직접 판정할 항목이고, 여기서 갈리면 음식 소재 20여 개의 화풍이 결정된다.

**일본 · 후지산 — 눈 덮인 대칭 원뿔 화산** — 민규가 확실히 아는 나라(기준점). 형태가 가장 단순해서 화풍 말고는 변수가 거의 없다. 두 장을 나란히 놓고 '어느 쪽이 후지산 같아?'를 민규에게 물을 앵커 이미지이며, 승인된 쪽 한 장이 이후 194장의 기준 원본이 된다.

**부르키나파소 · 티에벨레의 검정·하양·빨강 무늬를 손으로 그린 흙집** — 4세에게 어려울 것 같은 나라(인지 한계 측정). 나라도 소재도 낯설고 주인공이 입체가 아니라 '벽에 그린 무늬'라, 썸네일에서 형태가 읽히는지가 관건이다. 게다가 검정·하양·빨강은 A 스타일락의 '밝고 채도 높은 팔레트, 절대 어둡지 않게'와 정면으로 부딪히므로, 스타일락이 사실을 이기는지 사실이 스타일락을 이기는지도 이 한 장에서 함께 드러난다.

</details>

---

## 생성 전 확인할 것

첫 장(일본 후지산) 한 장만 뽑아 아래를 먼저 확인한다. 여기서 막히면 나머지 15장은 뽑아도 정보가 없다.

- 【첫 장은 반드시 jp(후지산)로】 형태가 가장 단순해서 도구 문제와 화풍 문제를 분리할 수 있습니다. 여기서 이상하면 도구 탓, 여기서 멀쩡한데 다른 장이 이상하면 소재 탓입니다.
- 【종횡비】 4:3 가로(1024×768)가 그대로 나오는지. 정사각만 된다면 1024×1024로 받되 크롭하지 말고 좌우에 흰 여백(A) 또는 #F1F5FB 여백(B)을 덧대어 1024×768로 만드는 방식이 되는지 확인. 세로로 나오면 그 도구는 이 작업에 못 씁니다.
- 【레퍼런스 첨부】 승인한 첫 장을 첨부하고 '이 그림체로'가 되는지. 된다면 나머지 193나라의 일관성 문제가 절반 이하로 줄어듭니다. 안 되면 프롬프트 전문을 매번 붙여넣는 수밖에 없으니, 16장 전부에서 스타일 블록을 한 글자도 줄이지 마세요.
- 【시드 고정】 같은 프롬프트를 두 번 굴렸을 때 거의 같은 그림이 나오는지. 안 되면 '한 소재당 2번까지만 재생성'이라는 규칙이 필요하고, 배치 작업 시간이 2배가 됩니다.
- 【블록 첫 줄 처리】 A 프롬프트의 'STYLE LOCK — append this block verbatim...'과 'NEGATIVE — append this block verbatim...' 두 줄은 사람에게 주는 메모입니다. 그대로 붙여넣어도 보통 무시되지만, 만약 도구가 이 문장을 그림 속 글자로 넣거나 혼란스러워하면 그 두 줄만 지우세요 — 단, 8장 전부에서 똑같이 지워야 비교가 유지됩니다.
- 【문맥 오염】 한 대화창에서 여러 장을 뽑을 때 도구가 직전 그림을 따라가는지. jp를 뽑고 바로 cn 판다를 뽑아 보고, 판다 배경에 산이 남으면 오염이 있는 것이므로 매 장마다 새 대화창을 열어야 합니다.
- 【용량 사전 점검】 첫 A 장을 WebP q80으로 변환해 40KB 이하로 떨어지는지. 60KB를 넘으면 평면 색면이 아니라 그라데이션·노이즈가 섞인 것이므로 프롬프트가 아니라 결과가 스타일락을 어긴 것입니다. B는 종이 결 때문에 더 클 텐데, 이 용량 차이도 두 화풍 비교의 실측 항목입니다.
- 【안전 필터】 bf(부르키나파소 흙집)와 ve(앙헬 폭포)가 거부 없이 통과하는지. 8장 중 하나라도 거부되면 194개국 배치에서 같은 유형이 반복 거부될 수 있으니 어떤 단어가 걸렸는지 기록해 두세요.

---

## 비교 절차

【0. 시작 전 — 이게 공정한 비교가 되려면】
A와 B에서 피사체 문장(A single ...)은 16개 프롬프트에서 글자 단위로 동일합니다. 다른 것은 스타일 블록뿐입니다. 단 하나 비대칭이 있습니다 — B의 명소 템플릿에는 ACCURACY 한 줄(실루엣·개수·재료색을 지키라)이 원래부터 들어 있고 A에는 대응 문장이 없습니다. 이건 제가 넣은 게 아니라 B 템플릿의 일부라 그대로 두었습니다. 그래서 명소 5장에서 A가 형태를 더 틀리면, '화풍이 나빠서'가 아니라 'A 블록에는 정확도 지시가 없어서'일 수 있습니다. 판정할 때 이 한 가지만 감안해 주세요.

【1. 생성 순서 — 16장을 한 번에 뽑지 마세요】
(1) 먼저 A의 jp(후지산) 1장, B의 jp 1장만 뽑습니다. 이 2장으로 아래 '도구 능력 확인' 6개를 끝냅니다. 여기서 종횡비나 배경이 안 지켜지면 나머지 14장은 뽑아도 정보가 없습니다.
(2) 통과하면 나머지 14장을 A 8장 → B 8장 순서로, 한 화풍을 몰아서 뽑습니다. 섞어 뽑으면 도구가 직전 이미지를 따라가서(문맥 오염) 두 화풍이 서로 닮아 버립니다. A 8장이 끝나면 대화창을 새로 열고 B를 시작하세요.
(3) 재생성은 프롬프트를 고치지 말고 같은 프롬프트를 그대로 다시 굴립니다. 한 소재당 최대 2번까지만. 2번째도 실패하면 그게 그 화풍의 실력입니다.

【2. 아이패드에서 보는 방법 — 이게 핵심입니다】
16장을 사진 앱 한 앨범에 넣고, 파일명을 A-ve, B-ve … 로 맞춥니다. 그리고 세 번 봅니다.
· 1차(가까이, 전체 화면): 사실이 맞는지만 봅니다. 예쁜지는 아직 보지 마세요.
· 2차(격자 보기, 썸네일): 앨범 격자로 줄여서 봅니다. 앱에서 실제 표시 폭은 380px 안팎이므로 이게 진짜 사용 조건입니다. 여기서 형태가 안 읽히면 그 화풍은 탈락입니다.
· 3차(팔 길이 밖, 방 건너편): 아이패드를 세워 두고 2~3m 떨어져 봅니다. 4세가 소파에서 보는 거리입니다.

【3. 장당 채점표 — 8줄, ○/×로만】
각 장에 대해 다음 8개를 ○/× 로 적습니다. 화풍 하나당 만점 64점(8장 × 8항목).
1) 종횡비가 4:3 가로인가 (정사각·세로로 나오지 않았는가)
2) 배경이 지시대로인가 (A=흰 바탕에 옅은 파란 원 / B=단색 #F1F5FB. 풍경·지평선·소품이 없는가)
3) 피사체가 프레임에 잘리지 않고 통째로 들어왔는가
4) 글자가 한 글자도 없는가 (특히 kr 광화문 현판 자리, be 와플, bf 흙집 벽 무늬가 글자처럼 되지 않았는가)
5) 개수가 맞는가 (nl 날개 4장, kr 아치 3장, cn 만리장성 망루 1채, be 와플 홈 4×3)
6) 실루엣이 실물인가 (jp가 그냥 삼각산이 아닌가, ve가 테푸이 절벽에서 한 줄기로 떨어지는가, cn 판다가 곰이 아닌 판다인가)
7) 8장이 서로 같은 세계로 보이는가 (스케일·배경·선 굵기가 튀는 장이 몇 장인가)
8) 썸네일(2차 보기)에서 무엇인지 즉시 읽히는가

【4. 점수로 못 가리는 두 가지 — 눈으로만 판정】
· 와플(be) 두 장을 나란히 놓고 "어느 쪽이 먹고 싶은가". 질감이 화풍 차이를 가장 크게 드러내는 자리입니다.
· 판다(cn 상징물)와 만리장성(cn 명소) 두 장을 나란히 놓고 "같은 그림책에서 나온 것 같은가". 두 축이 한 세트로 묶이는지는 이 한 쌍으로만 판정됩니다. 여기서 안 묶이면 194나라 × 2축 = 388장이 두 세계로 갈라집니다.

【5. 민규에게 물을 것 — 세 가지만, 순서대로】
아빠 판정이 끝난 뒤에 부릅니다. 아빠 의견을 먼저 말하지 마세요.
(1) 기준점 확인: jp A와 B를 나란히 놓고 "이거 뭐야?" — 나라 이름이 아니라 '산'이라고 답하면 정상입니다. 둘 다 산으로 읽히는지만 봅니다.
(2) 선호: 같은 두 장을 두고 "어느 게 더 마음에 들어?" 손가락으로 가리키게 합니다. 이유는 묻지 마세요(4세는 지어냅니다). cn 판다, be 와플에서도 같은 질문을 반복해 3판 2선승으로 봅니다.
(3) 인지 한계: bf(부르키나파소 흙집) 한 장만 보여 주고 "이건 뭘까?" — '집'이라고 답하면 소재는 통과, '모르겠어'나 엉뚱한 답이면 이 난이도의 나라는 상징물을 더 쉬운 것(예: 예비안)으로 바꿔야 한다는 신호입니다. 이 질문은 화풍 판정이 아니라 194개국 소재 난이도 판정입니다.

【6. 결론 내리는 법】
· 4번 항목(글자)에서 ×가 하나라도 난 화풍은 감점이 아니라 경고입니다. 194장 전수 검수가 필요해집니다.
· 7번 항목(일관성) 점수가 높은 쪽을 택하세요. 4세용 도감은 '한 장이 예쁜 것'보다 '388장이 한 세트로 보이는 것'이 훨씬 중요합니다.
· 총점이 8점 이내로 붙으면 민규의 (2) 선호를 결정타로 씁니다. 8점 넘게 벌어지면 민규가 뭘 고르든 아빠 점수를 따르세요.

---

## 프롬프트 — 화풍 A (납작한 색면)

### A1. `pilot/A/landmarks/ve.png`

```text
A single Angel Falls, one thin white ribbon of water dropping from the flat top of a tall reddish-brown table mountain and breaking into mist near the bottom.

STYLE LOCK — append this block verbatim to the end of every prompt. Never edit, shorten, or reorder it.

Children's flat vector illustration with emoji-like simplification: bold, simplified shapes built from clean solid color blocks, with no outlines of any kind. Each surface uses exactly two tones — one base color plus one slightly darker shade for the shadow side — and the shadow side is always on the lower-right, on every object, in every image. No gradients, no highlights, no gloss, no rim light, no texture, no grain, no hatching, no brush strokes, no line art, no contour lines.

Palette: bright, friendly, high-saturation colors of a modern children's app — warm coral red, sunny amber yellow, fresh grass green, clear sky blue, soft cream, warm grey-brown. Use at most five colors in the subject. Never muted, pastel-washed, neon, sepia, or dark.

Composition: exactly one subject, centered, seen straight on from the front or at a gentle three-quarter angle, complete and never cropped by the canvas edge. The subject occupies about 78 percent of the canvas height, leaving even empty margin on all four sides. No props, no secondary objects, no ground line, no cast shadow, no horizon, no sky, no scenery, no decorative border or frame.

Background: a flat pure white (#FFFFFF) canvas with one flat pale blue circle (#EEF4FF) centered behind the subject, its diameter about 88 percent of the canvas height. That circle is a single flat color with a hard, clean edge — no gradient, no glow, no ring, no outline, no pattern, no shadow. Nothing else is in the background.

Rendering: crisp vector-clean edges, perfectly even flat fills, generously rounded corners on every shape. Not photographic, not 3D, not clay, not plasticine, not felt, not plush, not paper-cut, not watercolor.

Mood: cheerful, gentle, calm, safe for a four-year-old child. It must be instantly recognizable at thumbnail size from across the room.

Canvas: 4:3 landscape, 1024 x 768.

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

### A2. `pilot/A/landmarks/nl.png`

```text
A single Dutch polder windmill, a round brick tower with a thatched conical cap, a small white door, and exactly four straight lattice sails arranged in an even cross.

STYLE LOCK — append this block verbatim to the end of every prompt. Never edit, shorten, or reorder it.

Children's flat vector illustration with emoji-like simplification: bold, simplified shapes built from clean solid color blocks, with no outlines of any kind. Each surface uses exactly two tones — one base color plus one slightly darker shade for the shadow side — and the shadow side is always on the lower-right, on every object, in every image. No gradients, no highlights, no gloss, no rim light, no texture, no grain, no hatching, no brush strokes, no line art, no contour lines.

Palette: bright, friendly, high-saturation colors of a modern children's app — warm coral red, sunny amber yellow, fresh grass green, clear sky blue, soft cream, warm grey-brown. Use at most five colors in the subject. Never muted, pastel-washed, neon, sepia, or dark.

Composition: exactly one subject, centered, seen straight on from the front or at a gentle three-quarter angle, complete and never cropped by the canvas edge. The subject occupies about 78 percent of the canvas height, leaving even empty margin on all four sides. No props, no secondary objects, no ground line, no cast shadow, no horizon, no sky, no scenery, no decorative border or frame.

Background: a flat pure white (#FFFFFF) canvas with one flat pale blue circle (#EEF4FF) centered behind the subject, its diameter about 88 percent of the canvas height. That circle is a single flat color with a hard, clean edge — no gradient, no glow, no ring, no outline, no pattern, no shadow. Nothing else is in the background.

Rendering: crisp vector-clean edges, perfectly even flat fills, generously rounded corners on every shape. Not photographic, not 3D, not clay, not plasticine, not felt, not plush, not paper-cut, not watercolor.

Mood: cheerful, gentle, calm, safe for a four-year-old child. It must be instantly recognizable at thumbnail size from across the room.

Canvas: 4:3 landscape, 1024 x 768.

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

### A3. `pilot/A/landmarks/kr.png`

```text
A single Gwanghwamun gate, a wide pale grey stone base pierced by three arched openings, carrying two stacked tiled roofs with deep upward-curving eaves and dark red wooden pillars.

STYLE LOCK — append this block verbatim to the end of every prompt. Never edit, shorten, or reorder it.

Children's flat vector illustration with emoji-like simplification: bold, simplified shapes built from clean solid color blocks, with no outlines of any kind. Each surface uses exactly two tones — one base color plus one slightly darker shade for the shadow side — and the shadow side is always on the lower-right, on every object, in every image. No gradients, no highlights, no gloss, no rim light, no texture, no grain, no hatching, no brush strokes, no line art, no contour lines.

Palette: bright, friendly, high-saturation colors of a modern children's app — warm coral red, sunny amber yellow, fresh grass green, clear sky blue, soft cream, warm grey-brown. Use at most five colors in the subject. Never muted, pastel-washed, neon, sepia, or dark.

Composition: exactly one subject, centered, seen straight on from the front or at a gentle three-quarter angle, complete and never cropped by the canvas edge. The subject occupies about 78 percent of the canvas height, leaving even empty margin on all four sides. No props, no secondary objects, no ground line, no cast shadow, no horizon, no sky, no scenery, no decorative border or frame.

Background: a flat pure white (#FFFFFF) canvas with one flat pale blue circle (#EEF4FF) centered behind the subject, its diameter about 88 percent of the canvas height. That circle is a single flat color with a hard, clean edge — no gradient, no glow, no ring, no outline, no pattern, no shadow. Nothing else is in the background.

Rendering: crisp vector-clean edges, perfectly even flat fills, generously rounded corners on every shape. Not photographic, not 3D, not clay, not plasticine, not felt, not plush, not paper-cut, not watercolor.

Mood: cheerful, gentle, calm, safe for a four-year-old child. It must be instantly recognizable at thumbnail size from across the room.

Canvas: 4:3 landscape, 1024 x 768.

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

### A4. `pilot/A/symbols/cn.png`

```text
A single giant panda, a black-and-white bear sitting upright and holding one green bamboo stalk with both front paws, with black ears, black eye patches and black shoulders.

STYLE LOCK — append this block verbatim to the end of every prompt. Never edit, shorten, or reorder it.

Children's flat vector illustration with emoji-like simplification: bold, simplified shapes built from clean solid color blocks, with no outlines of any kind. Each surface uses exactly two tones — one base color plus one slightly darker shade for the shadow side — and the shadow side is always on the lower-right, on every object, in every image. No gradients, no highlights, no gloss, no rim light, no texture, no grain, no hatching, no brush strokes, no line art, no contour lines.

Palette: bright, friendly, high-saturation colors of a modern children's app — warm coral red, sunny amber yellow, fresh grass green, clear sky blue, soft cream, warm grey-brown. Use at most five colors in the subject. Never muted, pastel-washed, neon, sepia, or dark.

Composition: exactly one subject, centered, seen straight on from the front or at a gentle three-quarter angle, complete and never cropped by the canvas edge. The subject occupies about 78 percent of the canvas height, leaving even empty margin on all four sides. No props, no secondary objects, no ground line, no cast shadow, no horizon, no sky, no scenery, no decorative border or frame.

Background: a flat pure white (#FFFFFF) canvas with one flat pale blue circle (#EEF4FF) centered behind the subject, its diameter about 88 percent of the canvas height. That circle is a single flat color with a hard, clean edge — no gradient, no glow, no ring, no outline, no pattern, no shadow. Nothing else is in the background.

Rendering: crisp vector-clean edges, perfectly even flat fills, generously rounded corners on every shape. Not photographic, not 3D, not clay, not plasticine, not felt, not plush, not paper-cut, not watercolor.

Mood: cheerful, gentle, calm, safe for a four-year-old child. It must be instantly recognizable at thumbnail size from across the room.

Canvas: 4:3 landscape, 1024 x 768.

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

### A5. `pilot/A/landmarks/cn.png`

```text
A single stretch of the Great Wall of China, a grey stone wall with a crenellated top and one square watchtower, curving up and down along the ridge it follows.

STYLE LOCK — append this block verbatim to the end of every prompt. Never edit, shorten, or reorder it.

Children's flat vector illustration with emoji-like simplification: bold, simplified shapes built from clean solid color blocks, with no outlines of any kind. Each surface uses exactly two tones — one base color plus one slightly darker shade for the shadow side — and the shadow side is always on the lower-right, on every object, in every image. No gradients, no highlights, no gloss, no rim light, no texture, no grain, no hatching, no brush strokes, no line art, no contour lines.

Palette: bright, friendly, high-saturation colors of a modern children's app — warm coral red, sunny amber yellow, fresh grass green, clear sky blue, soft cream, warm grey-brown. Use at most five colors in the subject. Never muted, pastel-washed, neon, sepia, or dark.

Composition: exactly one subject, centered, seen straight on from the front or at a gentle three-quarter angle, complete and never cropped by the canvas edge. The subject occupies about 78 percent of the canvas height, leaving even empty margin on all four sides. No props, no secondary objects, no ground line, no cast shadow, no horizon, no sky, no scenery, no decorative border or frame.

Background: a flat pure white (#FFFFFF) canvas with one flat pale blue circle (#EEF4FF) centered behind the subject, its diameter about 88 percent of the canvas height. That circle is a single flat color with a hard, clean edge — no gradient, no glow, no ring, no outline, no pattern, no shadow. Nothing else is in the background.

Rendering: crisp vector-clean edges, perfectly even flat fills, generously rounded corners on every shape. Not photographic, not 3D, not clay, not plasticine, not felt, not plush, not paper-cut, not watercolor.

Mood: cheerful, gentle, calm, safe for a four-year-old child. It must be instantly recognizable at thumbnail size from across the room.

Canvas: 4:3 landscape, 1024 x 768.

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

### A6. `pilot/A/symbols/be.png`

```text
A single Belgian waffle, a thick rectangular waffle with deep square pockets in a four by three grid, golden brown on top and slightly paler at the edges.

STYLE LOCK — append this block verbatim to the end of every prompt. Never edit, shorten, or reorder it.

Children's flat vector illustration with emoji-like simplification: bold, simplified shapes built from clean solid color blocks, with no outlines of any kind. Each surface uses exactly two tones — one base color plus one slightly darker shade for the shadow side — and the shadow side is always on the lower-right, on every object, in every image. No gradients, no highlights, no gloss, no rim light, no texture, no grain, no hatching, no brush strokes, no line art, no contour lines.

Palette: bright, friendly, high-saturation colors of a modern children's app — warm coral red, sunny amber yellow, fresh grass green, clear sky blue, soft cream, warm grey-brown. Use at most five colors in the subject. Never muted, pastel-washed, neon, sepia, or dark.

Composition: exactly one subject, centered, seen straight on from the front or at a gentle three-quarter angle, complete and never cropped by the canvas edge. The subject occupies about 78 percent of the canvas height, leaving even empty margin on all four sides. No props, no secondary objects, no ground line, no cast shadow, no horizon, no sky, no scenery, no decorative border or frame.

Background: a flat pure white (#FFFFFF) canvas with one flat pale blue circle (#EEF4FF) centered behind the subject, its diameter about 88 percent of the canvas height. That circle is a single flat color with a hard, clean edge — no gradient, no glow, no ring, no outline, no pattern, no shadow. Nothing else is in the background.

Rendering: crisp vector-clean edges, perfectly even flat fills, generously rounded corners on every shape. Not photographic, not 3D, not clay, not plasticine, not felt, not plush, not paper-cut, not watercolor.

Mood: cheerful, gentle, calm, safe for a four-year-old child. It must be instantly recognizable at thumbnail size from across the room.

Canvas: 4:3 landscape, 1024 x 768.

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

### A7. `pilot/A/landmarks/jp.png`

```text
A single Mount Fuji, a wide symmetrical volcano cone of soft blue-grey with a slightly flattened summit and a white snow cap covering its upper third.

STYLE LOCK — append this block verbatim to the end of every prompt. Never edit, shorten, or reorder it.

Children's flat vector illustration with emoji-like simplification: bold, simplified shapes built from clean solid color blocks, with no outlines of any kind. Each surface uses exactly two tones — one base color plus one slightly darker shade for the shadow side — and the shadow side is always on the lower-right, on every object, in every image. No gradients, no highlights, no gloss, no rim light, no texture, no grain, no hatching, no brush strokes, no line art, no contour lines.

Palette: bright, friendly, high-saturation colors of a modern children's app — warm coral red, sunny amber yellow, fresh grass green, clear sky blue, soft cream, warm grey-brown. Use at most five colors in the subject. Never muted, pastel-washed, neon, sepia, or dark.

Composition: exactly one subject, centered, seen straight on from the front or at a gentle three-quarter angle, complete and never cropped by the canvas edge. The subject occupies about 78 percent of the canvas height, leaving even empty margin on all four sides. No props, no secondary objects, no ground line, no cast shadow, no horizon, no sky, no scenery, no decorative border or frame.

Background: a flat pure white (#FFFFFF) canvas with one flat pale blue circle (#EEF4FF) centered behind the subject, its diameter about 88 percent of the canvas height. That circle is a single flat color with a hard, clean edge — no gradient, no glow, no ring, no outline, no pattern, no shadow. Nothing else is in the background.

Rendering: crisp vector-clean edges, perfectly even flat fills, generously rounded corners on every shape. Not photographic, not 3D, not clay, not plasticine, not felt, not plush, not paper-cut, not watercolor.

Mood: cheerful, gentle, calm, safe for a four-year-old child. It must be instantly recognizable at thumbnail size from across the room.

Canvas: 4:3 landscape, 1024 x 768.

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

### A8. `pilot/A/symbols/bf.png`

```text
A single Kassena painted earth house, a low rounded mud-brick hut with a flat roof, one small square doorway, and black, white and red geometric bands painted across its walls.

STYLE LOCK — append this block verbatim to the end of every prompt. Never edit, shorten, or reorder it.

Children's flat vector illustration with emoji-like simplification: bold, simplified shapes built from clean solid color blocks, with no outlines of any kind. Each surface uses exactly two tones — one base color plus one slightly darker shade for the shadow side — and the shadow side is always on the lower-right, on every object, in every image. No gradients, no highlights, no gloss, no rim light, no texture, no grain, no hatching, no brush strokes, no line art, no contour lines.

Palette: bright, friendly, high-saturation colors of a modern children's app — warm coral red, sunny amber yellow, fresh grass green, clear sky blue, soft cream, warm grey-brown. Use at most five colors in the subject. Never muted, pastel-washed, neon, sepia, or dark.

Composition: exactly one subject, centered, seen straight on from the front or at a gentle three-quarter angle, complete and never cropped by the canvas edge. The subject occupies about 78 percent of the canvas height, leaving even empty margin on all four sides. No props, no secondary objects, no ground line, no cast shadow, no horizon, no sky, no scenery, no decorative border or frame.

Background: a flat pure white (#FFFFFF) canvas with one flat pale blue circle (#EEF4FF) centered behind the subject, its diameter about 88 percent of the canvas height. That circle is a single flat color with a hard, clean edge — no gradient, no glow, no ring, no outline, no pattern, no shadow. Nothing else is in the background.

Rendering: crisp vector-clean edges, perfectly even flat fills, generously rounded corners on every shape. Not photographic, not 3D, not clay, not plasticine, not felt, not plush, not paper-cut, not watercolor.

Mood: cheerful, gentle, calm, safe for a four-year-old child. It must be instantly recognizable at thumbnail size from across the room.

Canvas: 4:3 landscape, 1024 x 768.

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

---

## 프롬프트 — 화풍 B (그림책 과슈)

### B1. `pilot/B/landmarks/ve.png`

```text
SUBJECT: A single Angel Falls, one thin white ribbon of water dropping from the flat top of a tall reddish-brown table mountain and breaking into mist near the bottom.
ACCURACY: keep the real silhouette, the real number of major parts and the real material colour of this place correct, then simplify it into the STYLE below. Clear soft daytime light. No people, no vehicles, no modern signage, no night-time illumination or light show.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.
```

### B2. `pilot/B/landmarks/nl.png`

```text
SUBJECT: A single Dutch polder windmill, a round brick tower with a thatched conical cap, a small white door, and exactly four straight lattice sails arranged in an even cross.
ACCURACY: keep the real silhouette, the real number of major parts and the real material colour of this place correct, then simplify it into the STYLE below. Clear soft daytime light. No people, no vehicles, no modern signage, no night-time illumination or light show.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.
```

### B3. `pilot/B/landmarks/kr.png`

```text
SUBJECT: A single Gwanghwamun gate, a wide pale grey stone base pierced by three arched openings, carrying two stacked tiled roofs with deep upward-curving eaves and dark red wooden pillars.
ACCURACY: keep the real silhouette, the real number of major parts and the real material colour of this place correct, then simplify it into the STYLE below. Clear soft daytime light. No people, no vehicles, no modern signage, no night-time illumination or light show.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.
```

### B4. `pilot/B/symbols/cn.png`

```text
SUBJECT: A single giant panda, a black-and-white bear sitting upright and holding one green bamboo stalk with both front paws, with black ears, black eye patches and black shoulders.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.
```

### B5. `pilot/B/landmarks/cn.png`

```text
SUBJECT: A single stretch of the Great Wall of China, a grey stone wall with a crenellated top and one square watchtower, curving up and down along the ridge it follows.
ACCURACY: keep the real silhouette, the real number of major parts and the real material colour of this place correct, then simplify it into the STYLE below. Clear soft daytime light. No people, no vehicles, no modern signage, no night-time illumination or light show.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.
```

### B6. `pilot/B/symbols/be.png`

```text
SUBJECT: A single Belgian waffle, a thick rectangular waffle with deep square pockets in a four by three grid, golden brown on top and slightly paler at the edges.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.
```

### B7. `pilot/B/landmarks/jp.png`

```text
SUBJECT: A single Mount Fuji, a wide symmetrical volcano cone of soft blue-grey with a slightly flattened summit and a white snow cap covering its upper third.
ACCURACY: keep the real silhouette, the real number of major parts and the real material colour of this place correct, then simplify it into the STYLE below. Clear soft daytime light. No people, no vehicles, no modern signage, no night-time illumination or light show.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.
```

### B8. `pilot/B/symbols/bf.png`

```text
SUBJECT: A single Kassena painted earth house, a low rounded mud-brick hut with a flat roof, one small square doorway, and black, white and red geometric bands painted across its walls.

COMPOSITION (identical for every image in this set): one single subject, centered, whole, never touched or cut by the frame edge. Eye-level camera tilted about 10 degrees above the subject; the subject turned slightly toward the viewer's left. The subject fills about 70 percent of the frame height. Keep empty background on all four sides, and at least 12 percent of the frame width empty at the left and right edges so the picture can be cropped to a 4:3 rectangle later without touching the subject. The background is one flat solid colour, pale blue-grey #F1F5FB — no gradient, no texture, no horizon line, no ground plane, no scenery, no props. The only shadow is one small soft blurred oval directly under the subject.

STYLE (copy this paragraph unchanged into every image of this set): a modern children's picture-book illustration painted in gouache on matte paper. Flat hand-painted colour shapes, gentle two-tone shading, a faint paper grain. Every shape carries one even medium-weight outline in deep warm brown #4A3B2F — never black, never sketchy, never varying in thickness. Rounded, friendly, simplified geometry with few small details. A single constant light source from the upper left. Warm cheerful palette built from cobalt blue #4F7CFF, amber #FFB703, leaf green #16A34A, coral red #EF4444 and cream #FFF6E6. The feeling is calm, warm and welcoming to a four-year-old child.

DO NOT INCLUDE: text, letters, numbers, captions, labels, titles, signatures, watermarks or logos of any kind; any national flag or flag-like striped emblem; any recognisable human face, portrait, crowd or named person; worship, sacred figures or religious ceremony; soldiers, uniforms, weapons, blood, destruction or anything frightening; maps, globes, borders, compass roses; photorealism, photography, 3D render, CGI, clay, plastic or chrome material, neon glow, lens flare, bokeh, vignette, dramatic rim light; picture frames, borders, drop shadows around the picture, collage, multiple panels, sticker sheets, grids, mock-ups; more than one copy of the subject.

OUTPUT: exactly one illustration showing exactly one scene, 4:3 landscape if available otherwise 3:2 landscape. Do not produce variations, alternatives or a grid of options. Follow the STYLE paragraph literally; do not restyle, modernise or "improve" these instructions.
```

