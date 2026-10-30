# 옥쌤보드

선생님을 위한 강의용 판서·화이트보드 웹앱입니다.
무한 캔버스 위에 펜으로 판서하고, PDF 수업 자료를 슬라이드로 넣어 그 위에 쓰고, 학생·동료와 실시간으로 함께 그릴 수 있습니다.

## 주요 기능

- **판서 도구**: 펜 6종(기본·연필·만년필·볼펜·점선·형광펜), 지우개, 채우기, 스포이트, 레이저 포인터
- **도형**: 직선, 화살표, 사각형, 원, 타원, 삼각형, 오각형, 글자
- **편집**: 선택, 올가미 선택, 복사·잘라내기·붙여넣기, 그룹, 레이어(잠금·숨기기·순서)
- **슬라이드**: 추가·삭제·이동, 프레젠터 리모컨(PageUp/PageDown) 지원
- **자료 넣기**: 사진, PDF(페이지마다 슬라이드 또는 한 화면에), 동영상, 소리, 웹 링크
- **저장**: 브라우저 자동 저장(30초마다, 변경 시), 다시 열 때 이어서 하기, 수업 파일(.json) 내보내기·열기
- **내보내기**: 전체 슬라이드 또는 현재 슬라이드를 PDF로
- **함께하기**: 방 코드로 실시간 협업(PeerJS), Google 로그인 공유 링크(Firebase)
- **AI 판서 정리**: 주제를 입력하면 판서용 요약을 만들어 줍니다(Gemini, 관리자 설정 필요)

단축키는 앱의 **설정** 창에서 볼 수 있습니다.

## 실행 방법

**필요한 것:** Node.js 20 이상

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # dist/ 폴더에 배포용 파일 생성
npm run lint         # 타입 검사
```

## 배포

`main` 브랜치에 올리면 GitHub Actions가 자동으로 GitHub Pages에 배포합니다(`.github/workflows/deploy.yml`).
주소는 `https://<GitHub 아이디>.github.io/educanvas-pro/`입니다. 저장소 이름을 바꾸면 `vite.config.ts`의 `base`도 같이 바꿔야 합니다.

### Firebase 보안 규칙 적용

공유 링크 기능의 보안 규칙(`firestore.rules`)은 코드에 포함되어 있지만, **Firebase에 직접 배포해야 적용됩니다.**

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules --project gen-lang-client-0451170730
```

### AI 기능 (선택)

`.env.local` 파일에 `GEMINI_API_KEY=키값`을 넣으면 개발 중에 AI 판서 정리를 쓸 수 있습니다.
**주의:** 이 키는 빌드 결과(공개 웹페이지)에 그대로 들어갑니다. 공개 배포에는 키를 넣지 말고, 서버(예: Firebase Cloud Functions)를 거쳐 호출하도록 바꾼 뒤 사용하세요.
모델은 `VITE_GEMINI_MODEL`로 바꿀 수 있습니다.

## 알려진 제한

- 동영상은 화면이 열려 있는 동안만 유지됩니다(새로고침 후 다시 넣어야 함). 3MB가 넘는 소리 파일도 마찬가지입니다.
- 협업은 슬라이드 단위로 내용을 통째로 주고받습니다. 두 사람이 **같은 슬라이드에서 동시에** 그리면 나중에 저장된 쪽이 남을 수 있습니다.
- 공유 링크(Firebase)는 슬라이드 하나가 약 900KB를 넘으면 전달되지 않습니다(사진·PDF가 많은 경우). 실시간 협업(방 코드)은 제한이 없습니다.
- 실시간 협업은 공용 PeerJS 서버와 STUN만 사용하므로, 방화벽이 엄격한 학교망에서는 연결이 안 될 수 있습니다.

변경 내역은 [CHANGELOG.md](CHANGELOG.md), 사용한 오픈소스는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)를 보세요.
