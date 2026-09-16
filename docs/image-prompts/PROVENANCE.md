# 그림 제작과 출처

## 제작자와 파일

이 저장소의 상징물·명소 삽화는 **TechJuiceLab이 OpenAI의 내장 image_gen으로 생성한 AI 그림**이다. 사람이 직접 그린 그림이라고 표시하지 않는다. 구체적 이미지 모델 버전은 도구가 공개하지 않아 기록하지 않았다. Codex 에이전트가 소재 문장을 개별 작성하고, 이미지 생성·편집 후 서로 교차 검수했다. 자동 번역을 사용하지 않았다.

- [production.json](production.json): 검수 파일의 원본·최종 SHA-256, 실제 요청 전문, 변환 설정, 검수자.
- [generation-prompts/](generation-prompts/): 실제 생성·편집 요청. 수정 뒤 재조립한 [prompts/](prompts/)와 구분한다.
- [presets.json](presets.json): 현재 소재·화풍·파일 상태·시도 수. `humanApproval: false`는 에이전트 검수를 보호자 승인으로 기록하지 않았다는 뜻이다.
- [PILOT-REVIEW.md](PILOT-REVIEW.md): B 파일럿 8종의 사실·형태·개수·화풍과 원본 배경색 편차, 실기기 확인의 한계.
- [contact/1.html](contact/1.html): 최종 그림 전체를 밝은·어두운 배경과 국기 옆에서 비교하는 검수판.

native PNG와 각 재시도 원본은 로컬 `docs/artifacts/art-production-2026-09-15/` 및 도구의 generated_images 폴더에 보존한다. 변환 과정은 원본을 덮어쓰지 않는다. Git에는 최종 WebP, 비교 앵커 PNG 한 장과 재현 정보를 넣는다. B 변환은 sips + cwebp 1.6.0, 1024×768, quality 80, 좌우 12% 이상 여백이다.

이번 제작은 항목별 전문 프롬프트를 사용한 내장 도구 병렬 호출이었다. 과거 호출들을 사후에 새 대화·앵커 재생성 회차로 꾸며 기록하지 않았다. `image-ledger.mjs next/record`의 정규 회차 관리는 후속 제작부터 사용할 수 있다. 기존 제작은 `unbatchedApproved`와 production 이력으로 확인한다.

## 약관 확인 기록

2026-09-15 확인한 [OpenAI 이용약관의 Content](https://openai.com/policies/row-terms-of-use/)에는 법이 허용하는 범위에서 사용자와 OpenAI 사이의 출력물 권리를 사용자에게 귀속하는 조항이 있다. 같은 문서는 출력물의 유일성이나 제3자 권리를 보장하지 않는다. 저장소의 라이선스 표기와 별개로 원자료·상표·건축물의 권리가 모두 소멸한다고 해석하지 않는다.

[공유·출판 정책](https://openai.com/policies/sharing-publication-policy/)의 제작 주체와 AI 생성 표시 취지에 맞춰 README와 앱 출처란에 TechJuiceLab / OpenAI AI 생성을 표시한다. [출처 신호 안내](https://help.openai.com/en/articles/8912793-c2pa-in-dall-e-3)는 메타데이터가 변환 중 사라질 수 있고 출처 신호 자체가 정확성이나 권리를 보장하지 않는다고 설명한다. 원본 메타데이터를 보존하고 WebP 변환의 출처는 이 기록과 파일 해시로 남긴다.

아이패드 실기기·아이 인지·보호자 선호는 에이전트가 확인한 것으로 표시하지 않는다.
