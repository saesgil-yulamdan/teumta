# teumta mobile

Expo Router 기반 틈타 사용자 앱입니다. 장소 검색, 혼잡도·집중률 확인, 시간 맞춤 코스 생성, 지도 기반 코스 진행을 제공합니다.

## 실행

```sh
npm install
cp .env.example .env
npm run start
```

`EXPO_PUBLIC_API_BASE_URL`에는 `/api`를 제외한 서버 주소를 설정합니다. Expo Go 또는 iOS/Android 시뮬레이터에서 실행할 수 있습니다.

## 구조

```text
src/
├── app/          # Expo Router 화면과 화면 조합
├── api/          # Axios API 함수, 응답 타입, timeout 정책
├── components/   # 재사용 UI
├── hooks/        # 코스 진행·조회·알림·위치 등 도메인 상태
├── stores/       # AsyncStorage 기반 단말 상태
├── types/
└── utils/
```

기본 API timeout은 10초이고, 여러 외부 API와 보행 경로 계산이 필요한 코스 생성·대체 코스 요청만 30초입니다. 전체 요청의 timeout을 늘리지 않습니다.

사용자 GPS는 foreground에서 단말 내부 도착 판정에만 사용하며 서버로 보내지 않습니다. 자세한 원칙은 [위치정보 처리 구조](../docs/location-privacy.md)를 참고합니다.

## 화면

탭은 **둘러보기**와 **내 여행** 두 개입니다. 검색은 둘러보기에서 열고, 설정·도움·회차 상세는 스택 화면입니다. `/search`·`/my`는 예전 딥링크 호환용 redirect만 유지합니다.

저장 장소·최근 검색/열람·현재 여행·회차 결과는 `stores/travel-repository.ts`가 AsyncStorage에 보관합니다.

## 화면 디자인

둘러보기·내 여행·설정·장소/행사 상세·코스 선택/상세/진행에 사진 중심의 공통 디자인을 적용합니다.

- 색상: `src/constants/theme.ts`의 `TeumtaPalette`가 기준입니다. 배경 `#F6F7F9`, 흰색 표면, 차콜 본문, 블루 `#3457D5` 행동 색을 사용합니다. 혼잡도·운영 주의는 별도 상태 색을 유지합니다.
- 글자·간격: 화면 제목 28–30px/800, 섹션 제목 20px/800, 본문 14–16px, 섹션 간격 28–32px를 기본으로 합니다.
- 구성: `ScreenSection`으로 제목과 내용을 묶고, `EmptyState`로 다음 행동을 안내합니다. 장소 목록은 열린 행과 작은 각진 사진을 사용하며, 행사 포스터는 `contain`으로 전체를 보여줍니다.
- 장소 상세는 뒤로가기를 상단에 유지합니다. 코스 상세·진행과 장소 상세는 주요 행동 버튼을 하단에 고정합니다.
- 웹은 최대 520px 읽기 폭을 사용합니다. 지도는 보유 좌표로 그린 동선 미리보기이며 실제 배경 지도는 네이티브 앱에서 제공합니다.

이 디자인 적용은 서버 API·주기적 조회를 추가하지 않습니다. 행사 일정은 목록에서 받은 값을 상세로 전달하고, 내 여행의 이어보기는 단말에 저장된 코스를 읽습니다. 사진은 기존 이미지 URL을 사용하므로 화면에 따라 이미지 파일 요청은 발생합니다.

## 검증

```sh
npm test
npm run typecheck
npm run lint
```
