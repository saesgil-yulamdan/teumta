# teumta

틈타(teumta)는 붐비는 관광지의 수요를 걸어서 갈 수 있는 주변 장소로 분산하는 Expo 모바일 서비스입니다. 목적지의 실시간 혼잡도와 날짜별 집중률을 보여주고, 사용자가 고른 30/60/90분 안에 복귀하는 보행 코스를 요청 시 생성합니다.

## 현재 운영 구조

- Mobile: React Native, Expo 57, TypeScript, Expo Router, Axios
- Server: Node.js 22+, Express, TypeScript
- Data: TourAPI, TMAP, SK Puzzle, KTO 집중률 API를 요청 시 조회하며 짧은 메모리 캐시를 사용
- Database: 현재 모바일 공개 API와 서버 기동에는 불필요. Prisma/MySQL 코드는 과거 적재·관리 기능 보존용
- `admin/`: 운영·배포·CI·신규 개발 대상이 아닌 보존 폴더

```text
teumta/
├── mobile/       # 사용자 앱
├── server/       # 현재 공개 API + 보존된 과거 DB 코드
├── admin/        # 보존 전용
├── web/          # 지원/개인정보처리방침 정적 페이지
└── docs/
```

## 실행

서버:

```sh
cd server
npm install
cp .env.example .env
npm run dev
```

공개 기능을 실행할 때 `DATABASE_URL`, MySQL, migration은 필요하지 않습니다. 외부 API 키는 실제로 해당 API를 호출할 때 필요합니다.

```sh
curl http://localhost:3000/health
```

```json
{
  "success": true,
  "data": { "status": "ok", "service": "teumta-server" },
  "error": null
}
```

모바일:

```sh
cd mobile
npm install
cp .env.example .env
npm run start
```

`EXPO_PUBLIC_API_BASE_URL`은 `/api` 앞의 서버 주소입니다. 네이티브 앱은 Origin 헤더가 없고, 웹 빌드는 서버의 `CORS_ALLOWED_ORIGINS`에 Origin을 등록해야 합니다.

## 검증

```sh
cd server && npm run test:run && npm run build
cd mobile && npm test && npm run typecheck && npm run lint
```

실배포·외부 API 스모크 테스트는 쿼터를 소비합니다.

```sh
cd server
SMOKE_BASE_URL=https://<server> SMOKE_DESTINATION_LIMIT=5 npm run smoke:live
```

## DB 보존 기능

`server/prisma`, `compose.yaml`, 적재 스크립트와 일부 과거 서비스/테스트는 이력과 데이터 보존을 위해 남아 있습니다. 이를 별도로 실행할 때만 MySQL을 띄우고 `DATABASE_URL`을 설정한 뒤 `npm run db:migrate`를 사용합니다. 현재 서버의 `start:deploy`는 migration이나 DB 연결을 수행하지 않습니다.

운영 DB를 실제로 종료하기 전에는 백업과 복원 가능 여부를 확인하고, 더 이상 과거 적재 데이터가 필요 없다는 운영 결정을 별도로 내려야 합니다.

상세 구조는 [서비스 구조](docs/service-overview.md), 현재 API는 [API 명세](docs/api-spec.md), 배포 전 확인사항은 [릴리스 체크리스트](docs/release-readiness.md)를 참고합니다.
