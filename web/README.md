# 틈타 지원 페이지

App Store Connect가 **필수로 요구하는 두 URL**을 이 정적 페이지 하나로 채운다.

| App Store Connect 입력칸 | 주소 |
|---|---|
| 지원 URL (Support URL) | `.../index.html` (루트) |
| 개인정보처리방침 URL (Privacy Policy URL) | `.../privacy.html` |

빌드 과정이 없는 순수 HTML/CSS다. 파일을 고치고 `main`에 머지하면 그대로 반영된다.

---

## 배포 — GitHub Pages

워크플로(`.github/workflows/pages.yml`)가 `web/` 아래 변경을 감지해 자동 배포한다.
저장소에서 **한 번만** 설정하면 된다.

1. 저장소 **Settings → Pages**
2. **Source**를 `GitHub Actions`로 변경

| 용도 | 주소 |
|---|---|
| 지원 URL | `https://saesgil-yulamdan.github.io/teumta/` |
| 개인정보처리방침 URL | `https://saesgil-yulamdan.github.io/teumta/privacy.html` |

수동 실행: Actions 탭 → "Deploy support site" → Run workflow.

App Store Connect의 URL은 **심사 재제출 없이 바꿀 수 있는 항목**이라 나중에 다른 호스팅으로 옮겨도 된다.

## 명칭·저작권 표기

- 서비스명: `틈타(teumta)`
- 팀명/운영 주체: `샛길유람단`
- App Store 저작권 표기: `© 2026 샛길유람단`

웹 공개본에서도 앱스토어 등록 정보와 맞게 서비스명과 운영 주체를 분리해서 표기한다.

## 문의 이메일

`index.html`과 `privacy.html`에 각각 한 번씩 들어 있다. App Store Connect의 지원 이메일과 같은
주소를 유지한다. `docs/privacy-policy.md`에도 같은 주소가 있으니 함께 고친다.

```sh
grep -rn "mailto:" web/
```

---

## 로컬에서 확인

```sh
cd web && python3 -m http.server 4000
# http://localhost:4000
```

## 구성

```
web/
├── index.html    지원 페이지(문의처·FAQ)
├── privacy.html  개인정보처리방침
├── style.css     앱 디자인 토큰과 같은 색을 쓴다
└── logo.png      루트 teumta-logo.png 사본
```

내용을 고칠 때 **앱의 실제 동작과 어긋나지 않게** 한다 — 특히 개인정보처리방침은
`docs/privacy-policy.md`와 같은 내용을 유지한다(둘 중 하나만 고치면 서로 어긋난다).
