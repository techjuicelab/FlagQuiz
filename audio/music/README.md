# FlagQuiz 음악

MLX Core 26.8.11의 로컬 엔진과 설치된 ACE-Step 1.5 XL Turbo (8-bit)로 만든 음악 16곡이다.
생성 프롬프트·Seed는 `docs/mlx-audio/presets.json`, 앱 재생 정보와 파일 해시는 `js/music-manifest.js`에 있다.
상자 6곡은 같은 보상에서 번갈아 사용하며, 기본 학습 흐름은 정오답 공통 발견음을 사용한다.

원본 WAV와 편집 기록은 로컬 `docs/artifacts/mlx-music/`에 보존한다. 원본을 정적 사이트에 배포하지 않는다.
제작 스크립트는 `scripts/generate-music.mjs`와 `scripts/prepare-music.mjs`이다.

모델: https://huggingface.co/ddalcu/ACE-Step-1.5-XL-Turbo-MLX-Serve-8bit
