# 협업 규칙

## 현재 경계

- `mobile/`: Expo 사용자 앱. 화면은 조합에 집중하고 네트워크·알림·위치·진행 상태는 `src/hooks` 또는 `src/api`에 둡니다.
- `server/`: 현재 공개 API는 `src/routes/public.routes.ts`가 정본입니다. 외부 연동은 `external`, 조합·정책은 `services`, HTTP 검증은 `controllers`에 둡니다.
- `server/prisma`, DB 적재·Route·Trip 관련 코드: 보존 영역. 현재 공개 기능 변경 때문에 확장하지 않습니다.
- `admin/`: 보존 전용. 배포·CI·신규 개발 대상이 아닙니다.
- `docs/api-spec.md`: 현재 공개 계약의 정본입니다.

## 변경 순서

1. API 계약이나 정책이 바뀌면 관련 문서를 함께 수정합니다.
2. 서버 오류는 `{ success, data, error }` envelope과 `error.code`를 유지합니다.
3. 모바일은 HTTP 상태만 보지 말고 `getApiErrorCode`로 제품 분기를 처리합니다.
4. 외부 API 호출을 추가하면 timeout, 동시성, TTL·상한, 부분 실패 정책을 함께 정합니다.
5. 위치 관련 기능은 사용자 GPS를 서버로 보내지 않는 원칙을 먼저 확인합니다.

## Git과 검증

- `main` 직접 push 대신 PR을 사용합니다.
- 비밀 값은 `.env`에만 두고 예제에는 변수명만 기록합니다.
- 서버: `npm run test:run && npm run build`
- 모바일: `npm test && npm run typecheck && npm run lint`
- 실데이터 스모크는 외부 API 쿼터를 확인한 뒤 실행합니다.

DB 보존 코드를 다시 운영 경로에 연결하려면 스키마, migration, 백업 복원, 개인정보, API 노출 범위를 별도 설계·리뷰해야 합니다.
