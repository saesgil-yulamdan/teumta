# 틈타 공개 API 명세

이 문서는 현재 `server/src/routes/public.routes.ts`에 마운트된 모바일 API만 다룹니다.

## 공통 규약

- Base: `/api`
- JSON 필드명: camelCase
- 장소 좌표: `number`
- 사용자 현재 좌표는 어떤 요청에도 받지 않음
- `contentId`와 `poiId`를 받는 API는 정확히 하나만 전달

성공:

```json
{ "success": true, "data": {}, "error": null }
```

실패:

```json
{
  "success": false,
  "data": null,
  "error": { "code": "INVALID_IDENTIFIER", "message": "..." }
}
```

오류 응답은 `sendError`, 성공 응답은 `sendSuccess`를 사용합니다. 알 수 없는 서버 오류도 같은 형태의 `500 INTERNAL_ERROR`입니다.

## rate limit

IP별 60초 고정 창, 최대 비용 60입니다. 일반 API와 코스 API는 별도 버킷을 씁니다.

| 요청 | 비용 |
|---|---:|
| `/courses`, `/course-alternatives` | 15 |
| `/local-places`, `/festivals/nearby` | 5 |
| 검색, 상세, 집중률 | 2 |
| 혼잡도 및 기타 | 1 |

초과하면 `429 PUBLIC_API_RATE_LIMITED`와 `Retry-After`를 반환합니다.

## 엔드포인트

### `GET /health`

DB를 조회하지 않는 프로세스 헬스 체크입니다.

```json
{ "success": true, "data": { "status": "ok", "service": "teumta-server" }, "error": null }
```

### `GET /api/search/places`

Query: `keyword` 필수, `pageNo` 기본 1. TourAPI 결과가 없으면 TMAP 검색으로 폴백합니다. 검색 결과는 DB에 저장하거나 내부 Place에 연결하지 않습니다.

주요 오류: `400 INVALID_KEYWORD`, `400 INVALID_PAGE`.

### `GET /api/congestion`

Query: `contentId` 또는 `poiId`. Tour 목적지는 서버가 TMAP POI로 보수적으로 매칭합니다. 실시간 값은 서버 메모리에 5분 캐시합니다.

주요 오류: `400 INVALID_IDENTIFIER`, `404 CONGESTION_DATA_NOT_FOUND`.

### `GET /api/concentration-forecast`

Query: `contentId`. TourAPI 법정동 코드와 KTO 집중률 API를 이용해 향후 날짜별 값을 반환합니다. 실시간 혼잡도와 서로 대체하지 않습니다.

주요 오류: `400 INVALID_IDENTIFIER`, `404 FORECAST_NOT_FOUND`.

### `GET /api/local-places`

Query: `contentId` 또는 `poiId`, `radius` 기본 2,000m·최대 20,000m. 문화시설·쇼핑·음식점 후보 중 최대 10곳을 TMAP 보행 거리로 검증해 거리순 반환합니다.

주요 오류: `400 INVALID_IDENTIFIER`, `400 INVALID_RADIUS`, `404 DESTINATION_NOT_FOUND`.

### `GET /api/local-places/detail`

Query: `contentId`. TourAPI `detailCommon2`와 `detailIntro2`를 조합해 소개, 연락처, 홈페이지, 운영시간, 휴무일을 반환합니다.

주요 오류: `400 INVALID_CONTENT_ID`, `404 LOCAL_PLACE_NOT_FOUND`.

### `GET /api/festivals/nearby`

Query: `contentId` 또는 `poiId`, `radius` 기본 5,000m·최대 20,000m. 현재 진행 중이거나 예정된 행사를 보행 거리순 반환합니다.

주요 오류: `400 INVALID_IDENTIFIER`, `400 INVALID_RADIUS`, `404 DESTINATION_NOT_FOUND`.

### `GET /api/courses`

Query:

- `contentId` 또는 `poiId` 필수
- `availableMinutes`: 10~240 정수. 앱 선택지는 30/60/90
- `variant`: 0~1000, 기본 0. “다른 코스 보기” 다양화 seed

응답은 `destination`, `availableMinutes`, 최대 3개의 `courses`입니다. 각 코스는 `stops`, `totalMinutes`, 복귀 시간·거리·경로, `verified`, `recommendationTags`를 포함합니다.

명확히 휴무/운영 종료/브레이크타임인 정류지는 예상 도착 시각 기준으로 생성 단계에서 제외합니다. 운영정보 미제공·해석 불가는 포함할 수 있으며 앱 진행 화면에서 다시 안내합니다.

주요 오류: `400 INVALID_IDENTIFIER`, `400 INVALID_AVAILABLE_MINUTES`, `400 INVALID_VARIANT`, `404 DESTINATION_NOT_FOUND`.

### `GET /api/course-alternatives`

도착한 정류지가 이용 불가능할 때 공개된 정류지 좌표를 기준으로 대체 장소 한 곳을 거쳐 원 목적지로 복귀하는 코스를 계산합니다.

Query: `originContentId`, 목적지 `contentId` 또는 `poiId`, `availableMinutes`, 선택적 `excludeContentIds`(쉼표 구분·최대 20개).

주요 오류: `400 INVALID_ORIGIN`, `400 INVALID_IDENTIFIER`, `400 INVALID_AVAILABLE_MINUTES`, `404 ORIGIN_NOT_FOUND`, `404 DESTINATION_NOT_FOUND`.

## timeout 및 외부 API 오류

- 서버의 외부 API 요청 timeout: `EXTERNAL_API_TIMEOUT_MS`, 기본 15초
- 모바일 일반 요청: 10초
- 모바일 코스/대체 코스 요청: 30초
- 외부 인증/응답/네트워크 오류: 502
- 외부 rate limit: 503
- 외부 timeout: 504

외부 오류의 고유 `error.code`는 유지하되 응답 envelope은 동일합니다.
등록되지 않은 `/api/*` 경로는 JSON 형식의 `404 API_NOT_FOUND`를 반환합니다.

## 현재 마운트하지 않는 코드

DB 기반 Place/Route/Trip, 태그, `/api/admin/*`, 저장형 집중률 API는 소스와 테스트에만 보존되어 있고 `app.ts`에 마운트되지 않습니다. `ENABLE_LEGACY_TRIP_API`를 켜도 현재 앱에서는 라우터가 열리지 않습니다. 다시 제공하려면 보안·개인정보·데이터 유지 결정을 거쳐 별도 작업해야 합니다.
