# Cloudtype 배포 가이드

현재 서버는 DB 없이 배포하는 구성이 기준입니다. 과거 관리자 웹과 MariaDB 배포 기록은 운영 구성으로 보지 않습니다.

## 서버

| 항목 | 값 |
|---|---|
| Root Directory | `server` |
| Build | `npm ci && npm run build` |
| Start | `npm run start:deploy` |
| Port | `3000` 또는 플랫폼 `PORT` |
| Health check | `/health` |

`start:deploy`는 `node dist/server.js`이며 Prisma migration이나 DB 연결을 실행하지 않습니다.

필수 외부 연동 변수:

- `TOUR_API_KEY`, `TOUR_API_BASE_URL`
- `TMAP_API_KEY`, `TMAP_API_BASE_URL`
- `CONGESTION_API_KEY`, `CONGESTION_API_BASE_URL`
- `PREDICTION_API_KEY`, `PREDICTION_API_BASE_URL`
- 선택: `EXTERNAL_API_TIMEOUT_MS`(기본 5000), `CORS_ALLOWED_ORIGINS`

키가 없어도 서버와 `/health`는 시작되지만 해당 기능 호출은 실패합니다. `DATABASE_URL`, `ADMIN_PASSWORD`, 예측 적재 스케줄러 변수는 현재 공개 서버에 필요하지 않습니다.

## 배포 후 확인

1. `/health`가 200이며 응답에 DB 상태가 없는지 확인
2. 현재 공개 엔드포인트 8개만 응답하는지 확인
3. 모바일에서 검색 → 상세 → 코스 → 진행 흐름 확인
4. 코스 요청의 p95, 외부 timeout/rate-limit, `public_api_usage` 로그 확인
5. 모바일이 `PUBLIC_API_RATE_LIMITED`와 `Retry-After`를 표시하는지 확인

실데이터 스모크는 외부 쿼터를 소비합니다.

```sh
cd server
SMOKE_BASE_URL=https://<server> SMOKE_DESTINATION_LIMIT=5 npm run smoke:live
```

## 기존 DB 종료 전

코드상 현재 공개 기능은 DB 비의존이지만, 운영 DB 삭제는 별도 결정입니다. 다음을 먼저 확인합니다.

- 현재 서버 revision이 DB 비의존 버전으로 배포됨
- 저장된 Place/Route/Trip/예측 데이터를 앞으로 사용하지 않음
- 최신 백업을 내려받았고 임시 DB 복원 테스트에 성공
- DB 백업 workflow 중단 시점을 팀이 승인

확인 전에는 DB나 백업을 삭제하지 않습니다. Redis도 현재 배포에는 추가하지 않습니다. 수평 확장이나 외부 API 쿼터 문제가 관측되면 별도로 검토합니다.
