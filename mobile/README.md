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

## 검증

```sh
npm test
npm run typecheck
npm run lint
```
