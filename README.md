# teumta

틈타(teumta)는 오버투어리즘 완화를 목표로 하는 관광객 분산 모바일 서비스입니다. 실시간 혼잡도와 날짜별 집중률 예측을 근거로, 붐비는 대형 관광지의 수요를 주변 로컬 장소(음식점·쇼핑·문화시설)로 우회시키는 코스와 진행 지도를 제공합니다. 관광객에게는 덜 붐비는 경험을, 지역에는 관광 수요의 분산을 제공합니다.

## 기술 스택

- Mobile: React Native, Expo, TypeScript, Expo Router, Axios, expo-location, expo-notifications, react-native-maps
- Server: Node.js, Express, TypeScript, Prisma ORM, MySQL, Zod, dotenv, cors
- Database: MySQL 8.4, Docker Compose, Prisma migration

## 폴더 구조

```text
teumta/
├── mobile/
├── server/
├── admin/              # 보존 전용(운영 폐기, 신규 개발·배포·CI 제외)
├── docs/
├── compose.yaml
├── .gitignore
├── .env.example
└── README.md
```

현재 모바일 앱은 기존 Expo 설정을 유지해 `mobile/src/app` 아래에 Expo Router 화면을 둡니다.

## 사전 설치 항목

- Node.js 22 이상 권장
- npm
- Docker Compose v2
- macOS: OrbStack 또는 Docker Desktop
- Windows: Docker Desktop
- 모바일 실행용 Expo Go 또는 시뮬레이터

## 환경변수 설정

루트:

```sh
cp .env.example .env
```

서버:

```sh
cp server/.env.example server/.env
```

모바일:

```sh
cp mobile/.env.example mobile/.env
```

실제 비밀번호와 API 키는 `.env` 파일에만 작성합니다. `.env` 파일은 Git에 올리지 않습니다.

## MySQL 실행

macOS OrbStack:

1. OrbStack을 실행합니다.
2. 프로젝트 루트에서 실행합니다.

```sh
docker compose up -d
docker compose ps
```

Windows Docker Desktop:

1. Docker Desktop을 실행합니다.
2. WSL 또는 PowerShell에서 프로젝트 루트로 이동합니다.
3. 실행합니다.

```sh
docker compose up -d
docker compose ps
```

종료:

```sh
docker compose stop
```

데이터까지 삭제되는 `docker compose down -v`는 필요한 경우에만 실행합니다.

## 백엔드 실행

```sh
cd server
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

헬스체크:

```sh
curl http://localhost:3000/health
```

정상 응답:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "teumta-server",
    "database": "connected"
  },
  "error": null
}
```

공개 API는 외부 API 쿼터 보호를 위해 IP별 비용 가중 rate limit을 적용합니다. 브라우저에서
호출해야 하면 `server/.env`의 `CORS_ALLOWED_ORIGINS`에 Origin을 명시합니다. 모바일 native
요청은 Origin 헤더가 없어 별도 등록이 필요 없습니다.

## 모바일 앱 실행

```sh
cd mobile
npm install
npm run start
```

Expo Go에서 QR 코드를 스캔하거나 iOS/Android 시뮬레이터로 실행합니다.

## 검증

```sh
cd server && npm run test:run && npm run build
cd mobile && npm test && npm run typecheck && npm run lint
```

PR과 `main` push에서는 `.github/workflows/ci.yml`이 서버·모바일 검사를 실행합니다.
폐기된 `admin/`은 CI 대상이 아닙니다.

실제 배포 서버와 외부 API를 점검할 때는 호출 쿼터를 확인한 뒤 순차 스모크 테스트를 실행합니다.

```sh
cd server
SMOKE_BASE_URL=https://<server> SMOKE_DESTINATION_LIMIT=5 npm run smoke:live
```

5곳 실행은 공개 API rate limit을 존중해 목적지 사이를 기본 61초 대기합니다.
보호 미적용 격리 환경에서만 `SMOKE_INTERVAL_MS=0`으로 덮어쓸 수 있습니다.

스토어 심사·기능설명서·백업 확인 현황은
[`docs/release-readiness.md`](docs/release-readiness.md)에 기록합니다.

## Prisma migration 적용

```sh
cd server
npm run db:migrate
```

새 모델을 추가한 뒤에는 migration 파일을 생성해 Git으로 공유합니다.

```sh
npx prisma migrate dev --name <migration_name>
```

## 자주 발생하는 오류

### Docker daemon이 실행되지 않음

`Cannot connect to the Docker daemon`이 나오면 OrbStack 또는 Docker Desktop이 켜져 있는지 확인합니다.

### 3306 포트 충돌

로컬 MySQL이 이미 3306을 쓰고 있으면 `Bind for 0.0.0.0:3306 failed`가 발생합니다. 루트 `.env`에서 `MYSQL_PORT=3307`처럼 바꾼 뒤 `server/.env`의 `DATABASE_URL` 포트도 같이 바꿉니다.

### MySQL healthcheck 대기

처음 실행 시 MySQL 초기화 때문에 `starting` 상태가 30초 이상 유지될 수 있습니다.

```sh
docker compose ps
docker logs teumta-mysql
```

### 기존 volume 때문에 계정 정보가 반영되지 않음

MySQL 공식 이미지는 데이터 디렉터리가 이미 있으면 초기 DB와 사용자를 다시 만들지 않습니다. 비밀번호를 바꿨는데 적용되지 않으면 기존 named volume 때문일 수 있습니다. 이 경우 데이터 삭제 위험이 있으므로 팀과 확인한 뒤 처리합니다.

### Docker 저장공간 부족

`no space left on device`가 나오면 자동 정리하지 말고 먼저 사용량을 확인합니다.

```sh
df -h /
docker system df
```

이미지, 빌드 캐시, 중지된 컨테이너는 삭제 후보가 될 수 있지만 volume 삭제는 DB 데이터 손실 위험이 있습니다.
