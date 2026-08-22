# teumta API 명세 (초안 v1)

> 작성: B / 검토·구현 반영: A
> 기준: `server/prisma/schema.prisma`
> 상태: **초안** — 팀 합의 후 확정

---

## 1. 공통 규약

### 1.1 Base URL / 프리픽스
- 헬스체크는 루트: `GET /health`
- 모든 도메인 API는 `/api` 하위: `app.use('/api', ...)`

### 1.2 응답 봉투 (Response Envelope)
모든 응답은 아래 형태로 통일한다.

```jsonc
{
  "success": true,        // boolean
  "data": {},             // 성공 시 payload, 실패 시 null
  "error": null           // 실패 시 { code, message }, 성공 시 null
}
```

실패 예시:
```jsonc
{
  "success": false,
  "data": null,
  "error": { "code": "PLACE_NOT_FOUND", "message": "장소를 찾을 수 없습니다." }
}
```

> `error.code`는 클라이언트 분기용 문자열 코드(신규 제안). 최소 요구는 `message`.

### 1.3 필드/직렬화 규약
- JSON 필드명은 **camelCase** (Prisma 모델과 동일)
- 날짜/시간은 **ISO 8601 문자열** (`2026-07-30T12:00:00.000Z`)
- **좌표(`latitude`, `longitude`)는 `number`** — ⚠️ Prisma `Decimal`은 기본 직렬화 시 문자열로 나가므로 `Number()` 변환 필수
- `tags`는 **평탄화된 배열** `[{ id, name }]` (내부 `placeTags[].tag` 중첩 구조를 노출하지 않는다)

### 1.4 HTTP 상태 코드
| 코드 | 의미 |
|------|------|
| 200 | 조회 성공 |
| 201 | 생성 성공 (POST) |
| 400 | 잘못된 요청(파라미터/바디 검증 실패) |
| 401 | 관리자 인증 실패/토큰 없음·만료 (`UNAUTHORIZED`, `INVALID_CREDENTIALS`) |
| 404 | 리소스 없음 |
| 409 | 충돌 (`TAG_ALREADY_EXISTS`, `PLACE_IN_USE`) |
| 429 | 로그인 시도 초과 (`TOO_MANY_ATTEMPTS`, `Retry-After` 헤더 포함) |
| 500 | 서버 내부 오류 |
| 502 / 503 | 외부 API 연동 실패/지연 (B 영역) |
| 503 | 관리자 인증 미설정 (`ADMIN_AUTH_NOT_CONFIGURED`) |

---

## 2. 데이터 타입

### enum
```
PlaceType        = TOURIST_SPOT | LOCAL_PLACE
CongestionType   = PREDICTED | REALTIME
CongestionLevel  = RELAXED | NORMAL | CROWDED | VERY_CROWDED
TripStatus       = PLANNED | IN_PROGRESS | COMPLETED | CANCELLED
TripEventType    = TRIP_STARTED | PLACE_ARRIVED | PLACE_LEFT
                 | MAIN_PLACE_RETURNED | TRIP_COMPLETED | TRIP_CANCELLED
```

### Place
```jsonc
{
  "id": 1,
  "name": "경복궁",
  "type": "TOURIST_SPOT",
  "address": "서울 종로구 사직로 161",
  "latitude": 37.5796,
  "longitude": 126.9770,
  "imageUrl": "https://...",
  "description": "조선의 법궁...",
  "openingTime": "09:00",       // "HH:mm" | null
  "closingTime": "18:00",       // "HH:mm" | null
  "recommendedDuration": 90,     // 분 | null
  "tags": [{ "id": 3, "name": "고궁" }],
  "createdAt": "2026-07-27T00:00:00.000Z",
  "updatedAt": "2026-07-27T00:00:00.000Z"
}
```
> `tourApiContentId`는 내부 연동용이라 응답에서 제외(필요 시 노출).

### Congestion
```jsonc
{
  "level": "NORMAL",            // CongestionLevel
  "score": 45,                   // 0~100 | null
  "source": "SK",                // 데이터 출처 | null
  "measuredAt": "...",          // REALTIME 측정 시각 | null
  "predictedFor": "..."          // PREDICTED 대상 시각 | null
}
```

### Route / RouteStop
```jsonc
{
  "id": 10,
  "name": "경복궁 주변 반나절 코스",
  "mainPlaceId": 1,
  "description": "...",
  "estimatedTotalDurationMinutes": 210,
  "estimatedTotalDistanceMeters": 3200,
  "stops": [
    {
      "stopOrder": 1,
      "place": { /* Place 요약 */ },
      "stayMinutes": 60,
      "estimatedTravelMinutesFromPrevious": 0,
      "estimatedDistanceMetersFromPrevious": 0
    }
  ]
}
```

### Trip / TripEvent
> privacy(location-privacy.md): Trip에 `deviceId`를, TripEvent에 사용자 좌표를 **두지 않는다**
> (스키마에서 의도적으로 제거됨 — 도착/복귀 판정은 단말 내부에서 수행하고 이벤트 종류만 기록).
```jsonc
{
  "id": 100,
  "routeId": 10,
  "status": "IN_PROGRESS",
  "startedAt": "...",           // | null
  "endedAt": null,
  "events": [
    {
      "id": 1,
      "eventType": "TRIP_STARTED",
      "placeId": null,
      "occurredAt": "...",
      "metadata": null            // JSON | null (사용자 위치/이동경로 저장 금지)
    }
  ]
}
```

---

## 3. 엔드포인트

담당 표기: **A**=내부 도메인 API, **B**=외부 연동/가공

### 3.1 Health — [A/공통]
```
GET /health
```
200:
```jsonc
{ "success": true, "data": { "status": "ok", "service": "teumta-server", "database": "connected" }, "error": null }
```

---

### 3.2 장소 목록 — [A] (데이터 적재: B/TourAPI)
```
GET /api/places
```
Query (모두 optional):
| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `type` | PlaceType | `TOURIST_SPOT`/`LOCAL_PLACE` 필터 (관광지/로컬 구분) |
| `tag` | string | 태그명 필터 |

200: `data`는 `Place[]`.

> 향후 확장(선택): 위치 기반 검색 `?lat=&lng=&radiusMeters=` — "근처 덜 붐비는 관광지" 시나리오. v1에서는 보류 가능.
> 단, 좌표 입력은 location-privacy 원칙과 충돌하므로 도입 시 별도 검토 필요.

---

### 3.3 장소 상세 — [A]
```
GET /api/places/:placeId
```
- `400 INVALID_PLACE_ID` — placeId가 양의 정수가 아님
- `404 PLACE_NOT_FOUND`
- 200: `data`는 `Place`.

---

### 3.3a 목적지 검색 — [B] (실시간 TourAPI)
```
GET /api/search/places?keyword=경복궁&pageNo=1
```
사용자가 목적지를 직접 검색하는 흐름의 진입점(DB 미저장).
**TourAPI(`searchKeyword2`, 관광지) 우선 → 결과 없으면 TMAP 장소 통합 검색(전국 POI) 폴백** —
등록 관광지가 아닌 일반 상점·건물도 검색된다. 폴백 구조라 검색 1회당 외부 호출 1~2건.
응답 항목의 `source`에 따라 `tourApiContentId`(TOUR) 또는 `tmapPoiId`(TMAP)가 목적지 식별자다.
```jsonc
{
  "success": true,
  "data": [
    {
      "source": "TOUR",            // TOUR | TMAP
      "tourApiContentId": "126508", // TMAP 결과면 null
      "tmapPoiId": null,            // TOUR 결과면 null
      "contentTypeId": "12",        // TOUR만
      "placeId": 7,                 // 내부 Place id — 매칭 안 되면 null (아래 참고)
      "name": "경복궁",
      "address": "서울특별시 종로구 사직로 161 (세종로)",
      "latitude": 37.5760307,     // 없으면 null
      "longitude": 126.9767218,
      "imageUrl": "https://..."
    }
  ],
  "error": null
}
```
- `400` — keyword 누락/공백, pageNo가 양의 정수 아님.
- TourAPI가 결과 없음(`0003 NODATA_ERROR`)을 주면 오류가 아니라 0건으로 보고 TMAP 폴백으로 넘어간다.
- TMAP 폴백 결과는 **`tmapPoiId` 기준으로 중복 제거**한다 — TMAP은 같은 장소의 출입구·주차장을
  별도 POI로 주면서 `id`를 공유하기 때문에(대표 항목만 남긴다).

**`placeId`(내부 Place 연결):** 집중률 예측(3.4b)은 내부 `placeId`로만 조회 가능한데 검색 결과는
DB 미저장이라 두 데이터를 이을 방법이 없었다. TOUR 결과에 한해 `tourApiContentId`로 적재된 Place를
조회(DB 1회)해 채운다.
- 적재 안 된 관광지·TMAP 결과 → `null`. 클라이언트는 `placeId !== null`일 때만 집중률 예측을 호출한다.
- **검색 결과를 Place에 적재하지 않는다** — 조회 전용 매칭이다(공모전 데이터 활용 기준 유지).
- DB 조회 실패 시 검색 자체는 성공시키고 `placeId`만 `null`로 둔다(§4 부분 성공 규약).

### 3.3b 주변 로컬 장소 조회 — [B] (실시간 외부 API)

**목적지 기반(권장, 검색 흐름):** 사용자가 검색으로 고른 목적지 기준. DB 불필요.
```
GET /api/local-places?contentId=126508&radius=2000   # TourAPI 목적지
GET /api/local-places?poiId=10817049&radius=2000     # TMAP POI 목적지
```
- `contentId`/`poiId` 중 **정확히 하나**만 전달(둘 다/둘 다 없음 → 400).
- **좌표는 API 입력으로 받지 않는다**(location-privacy 정책) — 서버가 식별자를 좌표로 해석.
- `400` — 식별자 규칙 위반, radius 범위 밖. `404` — 상세 조회 결과 없음/좌표 없음.
- 응답 형태·동작·실패 정책은 아래와 동일.

**내부 Place 기반(기존):**
```
GET /api/places/:id/local-places?radius=2000
```

**공모전 데이터 활용 기준(핵심):** 관광정보는 요청 시점에 TourAPI를 **실시간 호출**하여 사용하며,
응답받은 장소명/주소/좌표/이미지를 **Place 테이블에 적재(create/upsert)하거나 DB 캐시하지 않는다.**
DB는 기준 관광지 1건 읽기(findUnique)에만 사용한다.

**동작 흐름:**
1. 내부 Place에서 기준 관광지 확인 — 없으면 404, `TOURIST_SPOT` 아니면 400, `tourApiContentId` 없으면 400
2. TourAPI `detailCommon2`로 기준 관광지의 현재 좌표 실시간 조회(실패 시 DB 좌표 fallback)
3. TourAPI `locationBasedList2`를 contentTypeId 14(문화시설)/38(쇼핑)/39(음식점)별 호출 후 병합
4. contentId 중복 제거, 좌표 없는 후보·기준 관광지 자신 제외
5. **호출량 제한:** TourAPI dist(선별용)로 가까운 순 최대 10개만 TMAP 호출(동시 3개 제한)
6. TMAP 보행자 경로(`POST /tmap/routes/pedestrian?version=1`)의 `totalDistance`로 실제 보행거리 계산
7. 보행거리 ≤ radius 만 반환, `distanceMeters` 오름차순 정렬

**radius:** 양의 정수, 기본 2000, 최대 20000(초과 시 400). TourAPI 후보 검색 반경이자
최종 TMAP 보행거리 필터 기준.

**응답:** 항목은 DB Place 엔티티가 아니므로 내부 `id`가 없다(`tourApiContentId`도 기존 정책대로 미노출).
```jsonc
{
  "success": true,
  "data": [
    {
      "name": "통인시장",
      "address": "서울 종로구 ...",
      "latitude": 37.58,
      "longitude": 126.97,
      "imageUrl": "https://...",
      "distanceMeters": 850,        // ⚠️ 직선거리가 아니라 TMAP 실제 보행거리(totalDistance)
      "travelTimeMinutes": 13       // TMAP totalTime 기반 Math.ceil(초/60)
    }
  ],
  "error": null
}
```

**외부 API 실패 정책:**
- TourAPI 목록 호출 전부 실패 → 502/503/504 (`error.code`: AUTH_FAILED/RATE_LIMITED/TIMEOUT 등)
- `detailCommon2` 실패 → DB 좌표 fallback으로 부분 성공
- TMAP 일부 후보 실패 → **해당 후보만 제외**하고 부분 성공(기존 클라이언트가 distanceMeters로
  정렬/표시하므로 null 노출보다 제외가 안전)
- TMAP 전부 실패 → 502 + `error.code = EXTERNAL_API_UNAVAILABLE`
- timeout: `EXTERNAL_API_TIMEOUT_MS`(기본 5000ms) 공통 적용

**환경변수:** `TOUR_API_KEY`(Decoding 키), `TOUR_API_BASE_URL`, `TMAP_API_KEY`(SK appKey),
`TMAP_API_BASE_URL`. serviceKey는 URLSearchParams가 정확히 한 번 인코딩하므로 Decoding 키 사용.

> **기존 적재 코드 처리:** `place-ingestion.service.ts` / `scripts/ingest-tour.ts`(`npm run ingest:tour`)는
> 이 API 런타임에서 **호출되지 않는다**. 집중률 예측 매칭용 내부 참조 데이터(법정동 코드 등) 적재
> 용도로만 남아 있으며, 주변 로컬 장소 조회 목적의 관광정보 DB 적재에는 사용 금지.
> `place.service.ts`의 구 `getNearbyLocalPlaces`(DB 전체 조회 + 하버사인)는 deprecated.

### 3.3c 로컬 장소 소개 — [B] (실시간 외부 API, 구현됨)
```
GET /api/local-places/detail?contentId=2871024
```
주변 로컬 장소(3.3b) 목록에는 소개문이 없어 이름·거리만으로 "가볼지"를 판단해야 한다.
목록에 붙이면 항목 수만큼 외부 호출이 늘어나므로(10곳 × 조회 수) **상세 화면 진입 시 1곳만** 조회한다.

**호출량:** TourAPI 2건 — `detailCommon2`(소개·연락처) + `detailIntro2`(운영시간·휴무일).
`detailIntro2`는 `contentTypeId`가 필수인데 클라이언트에 없으므로 common 응답에서 얻어 이어 부른다.

```jsonc
{
  "success": true,
  "data": {
    "tourApiContentId": "2871024",
    "name": "통인시장",
    "overview": "골목형 재래시장으로 …",   // HTML 정리 후 평문
    "tel": "02-722-0911",
    "homepage": "https://tonginmarket.co.kr",
    "openHours": "10:00 ~ 22:00",          // detailIntro2 — 타입별 필드명(usetime/usetimeculture/opentime/opentimefood)을 흡수한 표시용 문자열
    "restDays": "매주 월요일"               // 휴무일(restdate 계열). 미제공이면 null
  },
  "error": null
}
```
- `openHours`/`restDays`는 **부가 정보** — `detailIntro2` 실패 시 null로 두고 나머지는 그대로 반환(부분 성공).
- 휴무일 표시는 "휴무일 장소를 코스로 제안하면 신뢰가 깨진다"(team-todo 미결정 항목)를
  **스키마 변경 없이** 실시간 조회로 다루는 방식이다 — 판단은 사용자에게, 데이터는 화면에.
- `400 INVALID_CONTENT_ID` — contentId 누락/공백 · `404 LOCAL_PLACE_NOT_FOUND` — TourAPI에 항목 없음.

### 3.3d 주변 행사·축제 조회 — [B] (실시간 TourAPI, 구현됨)
```
GET /api/festivals/nearby?contentId=126508&radius=3000
GET /api/festivals/nearby?poiId=10817049&radius=3000
```
목적지 기준 "요즘 근처 행사" 섹션과 우회 코스 후보 확장을 위한 조회 API. DB 저장 없이
TourAPI `searchFestival2`를 요청 시점에 호출하고, 서버에서 목적지와의 거리 필터를 적용한다.

- `contentId`/`poiId` 중 **정확히 하나**(위반 시 `400 INVALID_IDENTIFIER`).
- 좌표는 API 입력으로 받지 않는다 — 서버가 TourAPI contentId 또는 TMAP poiId를 좌표로 해석한다.
- `radius`: 기본 3000m, 최대 20000m.
- 조회 기준: 오늘(KST) 이후 진행 중/예정 행사. TourAPI 날짜 범위 조회 후 pageNo 1~3까지 얕게 페이지네이션한다.
- 응답 행사 좌표가 있으면 TMAP 보행거리로 목적지와의 거리를 계산하고, 반경 안 행사만
  `distanceMeters` 오름차순으로 반환한다. 일부 TMAP 실패는 해당 행사만 제외하고, 전부 실패하면 502.
- 짧은 인메모리 캐시만 사용하며 DB에 저장하지 않는다.

```jsonc
{
  "success": true,
  "data": [
    {
      "kind": "FESTIVAL",
      "tourApiContentId": "3359086",
      "name": "궁중문화축전",
      "address": "서울 종로구 ...",
      "latitude": 37.57,
      "longitude": 126.97,
      "imageUrl": "https://...",
      "distanceMeters": 920,
      "travelTimeMinutes": 14,
      "eventStartDate": "20260820",
      "eventEndDate": "20260901"
    }
  ],
  "error": null
}
```
- `404 DESTINATION_NOT_FOUND` — 목적지를 좌표로 해석하지 못함.

---

### 3.4 장소 혼잡도 — [B]
```
GET /api/places/:placeId/congestion
```
실시간(pass-through) + 예측(DB 조회)을 함께 반환.
```jsonc
{
  "success": true,
  "data": {
    "placeId": 1,
    "realtime": { "level": "CROWDED", "score": 78, "source": "SK", "measuredAt": "..." },
    "predictions": [
      { "level": "NORMAL", "score": 40, "source": "...", "predictedFor": "2026-07-30T15:00:00.000Z" }
    ]
  },
  "error": null
}
```
- 실시간 데이터가 없거나 외부 API 실패 시 `realtime: null` 로 **부분 성공**(전체 실패 아님).
- `404 PLACE_NOT_FOUND` — 장소 자체가 없을 때만 404.
- 이 placeId 기반 통합 엔드포인트는 미구현. 실시간 혼잡도는 검색 흐름용 3.4a(poiId 기반)로 제공.

### 3.4a 실시간 혼잡도 — [B] (SK 퍼즐, 구현됨)
```
GET /api/congestion?poiId=362105      # TMAP 목적지 — 검색 결과의 tmapPoiId
GET /api/congestion?contentId=126508  # TourAPI 목적지 — 검색 결과의 tourApiContentId
```
SK 지오비전 퍼즐 "실시간 장소 혼잡도". 서버 5분 캐시(해커톤 요금제 월 3,000건 쿼터 절약). DB 미저장.

**식별자 규칙:** `poiId`/`contentId` 중 **정확히 하나**(둘 다/둘 다 없음 → `400 INVALID_IDENTIFIER`).
3.3b(주변 로컬 장소)와 같은 규칙이다.

**TourAPI 목적지 처리:** SK는 TMAP `poiId`로만 조회되는데 검색은 TourAPI를 우선하므로
**유명 관광지일수록 `tmapPoiId`가 없다** — 혼잡이 가장 문제되는 곳에서 실시간 혼잡도를 못 보여주는
구멍이라 서버가 관광지↔POI를 매칭해 잇는다(`poi-matching.service`).

- 매칭: TourAPI `detailCommon2`로 이름·좌표를 얻고 → TMAP POI 검색(상위 5) →
  **SK 제공 장소 여부 우선 → 이름 일치도 → 거리** 순으로 고르며, 반경 300m 밖은 매칭하지 않는다.
- **SK 제공 장소 인덱스**(2026-08-16 추가): 퍼즐 "데이터 제공 가능 장소" 목록
  (`GET /place/meta/pois`, 약 3.4만 곳)을 lazy 1회 + 24시간 인메모리 보관(전체 로드 ≈ 30콜).
  TMAP 검색만으로는 SK가 아는 본시설 poiId를 놓치는 사례가 많았다 —
  대표 49곳 대조에서 "미제공" 측정 35곳 중 31곳이 실제로는 목록에 있었음.
  - 1차: TMAP 후보 중 목록에 있는 후보 우선(반경 검증 유지)
  - 2차(폴백): 목록에서 **이름 정확 일치**(정규화 후) poiId를 TMAP POI 상세 좌표로
    반경 검증해 채택 — 부분 일치는 쓰지 않는다("청계천"→"청계천박물관" 오매칭 방지)
  - 인덱스 로드 실패 시 기존 TMAP 매칭만으로 동작(조용한 폴백). offset 상한(30,000)로
    마지막 ~3,700곳은 인덱스에 없지만, 최종 실시간 조회(404)가 진실이라 동작엔 영향 없음
- 이름을 먼저 보는 이유: TMAP은 본 시설과 부속 시설을 각각 POI로 주는데(예: "경복궁"/"경복궁 주차장",
  id가 다르다) 부속 시설이 더 가까운 경우가 있고 SK는 본 시설만 커버한다.
- 결과는 24시간 캐시(실패도 캐시 — 같은 장소로 쿼터를 반복 소모하지 않는다).
  최초 1회만 외부 호출 2건(TourAPI 상세 1 + TMAP POI 검색 1)이 발생한다.
- 검색 응답에 `tmapPoiId`를 미리 붙이지 않는 이유: 결과 20건마다 매칭하면 호출량·응답시간이 20배가 된다.
  사용자가 실제로 여는 목적지는 하나이므로 조회 시점에 해석한다.
- 대응 POI를 못 찾으면 `404 CONGESTION_DATA_NOT_FOUND`(억지 매칭 금지).
```jsonc
{
  "success": true,
  "data": {
    "poiId": "362105",
    "poiName": "경복궁",
    "level": "NORMAL",              // RELAXED | NORMAL | CROWDED | VERY_CROWDED
    "source": "SK_PUZZLE",
    "measuredAt": "2026-08-06T03:50:00.000Z",
    "fetchedAt": "2026-08-06T03:52:10.000Z",  // 캐시 히트면 과거 값
    "isRealtime": true
  },
  "error": null
}
```
- `400` — poiId 누락.
- **`404 CONGESTION_DATA_NOT_FOUND`** — SK가 다루지 않는 POI(커버리지 밖). SK는 이 경우 HTTP 400 +
  `{"error":{"message":"NOT_FOUND_POI"}}`를 주는데, 연동 장애가 아니라 "원래 없는 데이터"이므로
  502가 아니라 404로 내린다. **재시도해도 소용없으니 클라이언트는 "실시간 혼잡도 미제공" 안내로 처리**한다.
- 그 외 외부 오류 → 502/503/504.

### 3.4b 장소 집중률 예측 — [B] (구현됨)
```
GET /api/places/:id/concentration-forecast
```
한국관광공사 "관광지 집중률 방문자 추이 예측"(TatsCnctrRateService) 기반, DB 조회 전용.

**데이터 의미와 한계 (중요):**
- 현재 날짜 기준 **향후 30일의 날짜별** 집중률 예측이다(일 1회 갱신).
- **실시간 혼잡도가 아니다.** 시간대별 예측도 아니다. "30분/60분 후 혼잡 완화" 판단에 쓸 수 없다.
- 공식 API가 혼잡 등급 임계값을 제공하지 않으므로 level/score 로 변환하지 않고 원본 소수값을 그대로 제공한다.

```jsonc
{
  "success": true,
  "data": {
    "placeId": 1,
    "isRealtime": false,
    "forecasts": [
      {
        "forecastDate": "2026-08-06",          // 예측 대상 달력 날짜(KST)
        "concentrationRate": 23.45,             // 집중률 원본 소수값
        "source": "KTO_CONCENTRATION_FORECAST",
        "fetchedAt": "2026-08-06T03:00:00.000Z", // 마지막 적재/갱신 시각
        "isRealtime": false
      }
    ]
  },
  "error": null
}
```
- `400` — id가 양의 정수가 아님. `404` — 장소 없음.
- 적재는 `npm run ingest:prediction -- --areaCd=11 --signguCd=11110 [--name=경복궁]` 수동 실행(조회 API는 DB만 바라봄).
- 집중률 API에는 TourAPI contentid가 없어, 지역(법정동) + 정규화된 관광지명이 정확히 일치하는 경우에만 저장한다(UNMATCHED/AMBIGUOUS는 저장하지 않고 집계만).

### 3.4c 집중률 예측 실시간 조회 — [B] (구현됨, 2026-08-14, **전국**)
```
GET /api/concentration-forecast?contentId=126081
```
3.4b는 적재된 내부 Place만 조회할 수 있어 **적재 지역(현재 종로구) 밖에서는 집중률을 볼 수 없다.**
KTO 집중률은 전국 시군구를 커버하므로, 목적지의 지역 코드와 이름을 실시간으로 해석해 바로 조회한다 —
**적재 없이 전국이 된다**(공모전 FAQ의 "로컬 DB 저장 대신 실시간 호출 권고"와도 맞다).

```jsonc
{
  "success": true,
  "data": {
    "destinationName": "해운대해수욕장",   // TourAPI 기준 이름
    "matchedName": "해운대해수욕장",        // 실제 매칭된 KTO 관광지명(표기가 다를 수 있음)
    "areaCd": "26",
    "signguCd": "26350",
    "isRealtime": false,
    "forecasts": [
      { "forecastDate": "2026-08-14", "concentrationRate": 87.89,
        "source": "KTO_CONCENTRATION_FORECAST", "isRealtime": false }
    ]
  },
  "error": null
}
```

**동작:** `detailCommon2`로 이름·법정동 코드 → KTO 지역 조회 → 이름 매칭(공백 제거 후 정확 일치 →
부분 일치 시 가장 짧은 이름).
- ⚠️ **시군구 코드는 5자리 전체 코드로 만들어 넘겨야 한다.** TourAPI는 3자리로 준다
  (서울 종로구 11/110, 부산 해운대구 26/350). 접두사 검사로 판단하면 안 된다 —
  `"110".startsWith("11")`이 참이라 종로구가 그대로 넘어가 조회가 0건이 된다(실제로 겪음). 길이로 판단한다.
- **지역 단위 캐시(6시간)** — 같은 시군구의 여러 목적지가 KTO 호출 1건을 공유한다.
- `400 INVALID_IDENTIFIER` — contentId 누락. `404 FORECAST_NOT_FOUND` — 지역 해석 실패 또는
  해당 관광지의 예측 데이터 없음.

---

### 3.10 우회 코스 실시간 생성 — [B] (구현됨, 2026-08-14, **전국**)
```
GET /api/courses?contentId=126508&availableMinutes=60
GET /api/courses?poiId=10817049&availableMinutes=30
GET /api/courses?contentId=126508&availableMinutes=60&variant=2
```
저장형 Route(3.5/3.6)는 내부 Place만 참조할 수 있어 적재 지역에서만 코스가 나온다.
이 API는 주변 로컬 장소 조회(3.3b)가 이미 구한 **TMAP 실측 보행거리**를 재활용해
사용자의 가용 시간 안에 다녀올 수 있는 조합을 즉석에서 만든다. 주변 행사·축제(3.3d)도
후보에 포함할 수 있으며, **저장하지 않는다.**

- `contentId`/`poiId` 중 **정확히 하나**(3.3b와 같은 규칙, 위반 시 `400 INVALID_IDENTIFIER`).
- `availableMinutes`: 10~240 정수(앱은 30/60/90을 쓴다). 범위 밖 → `400 INVALID_AVAILABLE_MINUTES`.
- `variant`: 0~1000 정수, optional. 같은 날·같은 목적지·같은 가용 시간에서도 다른 추천 조합을
  요청하기 위한 다양화 seed(앱의 "다른 코스 보기").
- `404 DESTINATION_NOT_FOUND` — 목적지를 좌표로 해석하지 못함.

```jsonc
{
  "success": true,
  "data": {
    "destination": { "name": "경복궁", "latitude": 37.5796, "longitude": 126.977 },
    "availableMinutes": 60,
    "courses": [
      {
        "totalMinutes": 60,          // 이동 + 체류 + 복귀
        "returnTravelMinutes": 7,    // 마지막 정류지 → 목적지
        "returnDistanceMeters": 520,
        "returnPath": [{ "latitude": 37.57, "longitude": 126.97 }, { "latitude": 37.5796, "longitude": 126.977 }],
        "verified": true,            // 정류지 사이 구간이 TMAP 실측이면 true(추정이면 false)
        "recommendationTags": ["혼잡 우회", "행사 포함", "식사 포함"],
        "stops": [
          {
            "kind": "LOCAL_PLACE",    // LOCAL_PLACE | FESTIVAL
            "name": "대한민국역사박물관",
            "address": "...",
            "latitude": 37.57,
            "longitude": 126.97,
            "imageUrl": null,
            "travelMinutesFromPrevious": 5,
            "distanceMetersFromPrevious": 380,
            "pathFromPrevious": [{ "latitude": 37.5796, "longitude": 126.977 }, { "latitude": 37.57, "longitude": 126.97 }],
            "stayMinutes": 20,
            "eventStartDate": null,
            "eventEndDate": null
          }
        ]
      }
    ]
  },
  "error": null
}
```
- `pathFromPrevious`: 이전 지점 → 해당 정류지의 TMAP 보행 경로 좌표.
- `returnPath`: 마지막 정류지 → 목적지 복귀 보행 경로 좌표.

**계산 구조:** 목적지 → 정류지1 → … → 정류지N → 목적지(복귀). 정류지 최대 3곳, 코스 최대 3개.
- 목적지↔정류지 구간은 3.3b/3.3d가 구한 **TMAP 실측값**(복귀는 대칭으로 간주해 재사용).
- 정류지 사이 구간은 직선거리 × 1.3 ÷ 67m/분으로 **추정해 후보를 좁힌 뒤**, 반환할 코스에 한해
  TMAP으로 실측한다(호출량 절약). 실측 후 가용 시간을 넘기면 그 코스는 뺀다.
- **체류시간은 가용 시간에 맞춰 조정한다.** 분류별 기본값(14 문화시설 40분 / 38 쇼핑 30분 /
  39 음식점 40분)에서 비율로 줄이되 **최소 15분**은 지킨다. 기본값 고정이면 30분 코스가 아예
  만들어지지 않는다(걷는 시간만 더해도 초과). 같은 장소라도 코스 제한시간에 따라 체류시간을 달리 두는 것은
  [route-data-rules §6](./route-data-rules.md)이 정한 방식이다.
- ⚠️ 분류별 기본 체류시간은 **공식 통계가 없는 팀 합의값**이다. 방문 로그가 쌓이면 실측으로 보정한다.
- 다양화: 날짜(KST) + 목적지 + 가용 시간 + `variant`를 seed로 써서 같은 조건의 반복 추천이
  고정 코스 하나로 굳지 않게 한다.
- 정렬: 가용 시간을 알차게 쓰는 순(남는 시간이 적은 순) → 같으면 정류지가 많은 순(분산 효과) →
  같은 카테고리 반복 패널티. `recommendationTags`는 행사 포함, 혼잡 우회, 식사 포함, 짧은 산책,
  구성 다양 같은 선택 이유를 프론트가 바로 표시하기 위한 서버 계산값이다.

**호출량:** 목적지 해석 1 + TourAPI 로컬 목록 3 + TourAPI 행사 목록 최대 3페이지 +
TMAP 보행자 최대 10(3.3b/3.3d 선별) + 검증 최대 6.

---

### 3.5 장소별 코스 목록 — [A] (이동시간/거리: B/TMAP 계산)
```
GET /api/places/:placeId/routes
```
해당 장소를 `mainPlace`로 하는 코스 목록. 200: `data`는 `Route[]`.

### 3.6 코스 상세 — [A]
```
GET /api/routes/:routeId
```
- `404 ROUTE_NOT_FOUND`
- 200: `data`는 `Route`(stops 포함).

---

### 3.7 방문(Trip) 생성 — [A]
```
POST /api/trips
```
Body:
```jsonc
{ "routeId": 10 }   // deviceId 없음 — Trip id 자체가 식별자(privacy)
```
- `400 INVALID_ROUTE_ID`, `404 ROUTE_NOT_FOUND`
- 201: `data`는 생성된 `Trip`(status=`PLANNED`).

### 3.8 방문 이벤트 로깅 — [A]
```
POST /api/trips/:tripId/events
```
Body:
```jsonc
{
  "eventType": "PLACE_ARRIVED",   // TripEventType (필수)
  "placeId": 1,                     // optional
  "metadata": { }                    // optional JSON — 사용자 좌표 넣지 말 것(privacy)
}
```
- `400 INVALID_EVENT_TYPE`, `404 TRIP_NOT_FOUND`
- 201: `data`는 생성된 `TripEvent`.

### 3.9 방문 상세 조회 — [A]
```
GET /api/trips/:tripId
```
- `404 TRIP_NOT_FOUND`
- 200: `data`는 `Trip`(events 포함).

---

## 4. 외부 API 실패 처리 규약 (B)

- 외부 API(TourAPI/SK/TMAP/KTO 집중률) 호출은 공용 timeout(`EXTERNAL_API_TIMEOUT_MS`)과
  `ExternalApiError` 계층으로 분류한다.
- 실시간성 데이터(혼잡도 realtime, 이동시간)는 실패 시 **해당 필드만 null/생략하여 부분 성공**으로 응답하고, 전체 요청을 500으로 실패시키지 않는다.
- 저장형 데이터(TourAPI 장소, 예측 혼잡도)는 **동기화 작업**에서 적재하며, 조회 API는 항상 DB만 바라본다(외부 API에 직접 의존하지 않음).
- 외부 API가 필수 경로에서 완전히 불가한 경우에만 `502`/`503` + `error.code = EXTERNAL_API_UNAVAILABLE`.
- 외부 API 실패와 SK 미커버는 구조화 로그로 남긴다. 로그 이벤트는 `external_api_issue`이며
  `service`, `code`, `phase`, `status`, `host`, `path`, `detailCode`를 포함한다.
  URL query·헤더·응답 원문은 API key 유출 방지를 위해 기록하지 않는다.

예시:
```jsonc
{
  "level": "warn",
  "event": "external_api_issue",
  "service": "tour",
  "code": "INVALID_RESPONSE",
  "phase": "http_status",
  "status": 500,
  "host": "apis.data.go.kr",
  "path": "/B551011/KorService2/searchFestival2",
  "timestamp": "2026-08-22T12:00:00.000Z"
}
```
SK 퍼즐 커버리지 밖(`CONGESTION_DATA_NOT_FOUND`)은 장애성 warn이 아니라 `level: "info"`로 남긴다.

---

## 5. A가 이 명세 기준으로 반영할 변경점 (요약)

1. **`/api` 프리픽스 적용** — `app.use('/api', placeRouter)` 등. `/health`만 루트 유지.
2. **`GET /places` → `GET /api/places`** + `type`, `tag` 쿼리 필터 추가.
3. **`tags` 응답 평탄화** — `placeTags[].tag` 중첩 대신 `tags: [{id, name}]`.
4. **좌표 number 변환** — `Decimal` → `Number` 직렬화.
5. **신규 엔드포인트 구현** — 코스(3.5/3.6), 방문(3.7~3.9).
6. **`error.code` 도입**(선택) — 클라이언트 분기용 코드 문자열.

> B는 3.4(혼잡도)와 3.2/3.5의 데이터 적재·가공(TourAPI/SK/TMAP)을 담당한다.

---

## 6. 관리자 API — [B] (구현됨, 2026-08-07)

관리자 웹(`admin/`)이 소비한다. 소스: `server/src/routes/admin.routes.ts`, `place.routes.ts`.

### 6.1 인증 규약

- **`/api/admin/*` 전체가 Bearer 토큰 필수** (로그인 제외). 토큰 없음/무효/만료 → `401 UNAUTHORIZED`.
- 서버 환경변수 `ADMIN_PASSWORD` 미설정 시 로그인 포함 전부 `503 ADMIN_AUTH_NOT_CONFIGURED`(fail closed).
- 토큰은 무상태 HMAC(만료 12시간). **비밀번호를 바꾸면 발급된 토큰이 전부 무효화**된다.
- 로그인 rate limit: IP별 15분 창에서 실패 10회 초과 시 `429 TOO_MANY_ATTEMPTS` + `Retry-After`(초).

```
POST /api/admin/login
```
Body: `{ "password": "..." }`
- 200: `data = { "token": "...", "expiresAt": "2026-08-07T21:00:00.000Z" }` — 이후 요청에 `Authorization: Bearer <token>`.
- `401 INVALID_CREDENTIALS` — 비밀번호 불일치.

### 6.2 장소 관리

```
POST   /api/admin/places        # 생성 (201)
PATCH  /api/admin/places/:id    # 부분 수정 — 전달한 필드만 반영
DELETE /api/admin/places/:id    # 삭제
```
- 필드: `name`\*, `type`\*, `latitude`\*, `longitude`\*, `address`, `imageUrl`, `description`,
  `openingTime`/`closingTime`(`HH:mm`), `recommendedDuration`(양의 정수), `tourApiContentId`, `tagIds`(number[]).
- `tagIds`는 **전체 교체** 방식 — 전달하면 해당 장소의 태그 연결이 이 목록으로 대체된다. 존재하지 않는 태그 ID → 400.
- DELETE: PlaceTag/Congestion/ForecastPlaceAlias는 연쇄 삭제. **Route/RouteStop에서 사용 중이면
  `409 PLACE_IN_USE`** — 코스에서 먼저 제거해야 삭제 가능(A의 코스 데이터 보호).

### 6.3 태그

```
GET    /api/tags                # 공개 — [{ id, name, placeCount }]
POST   /api/admin/tags          # 생성. Body { "name": "..." } (50자 이하, unique)
DELETE /api/admin/tags/:id      # 삭제 — 모든 장소에서 연결 제거(장소는 유지)
```
- 중복 이름 생성 → `409 TAG_ALREADY_EXISTS`.

### 6.4 KTO 집중률 매칭 도구

자동 매칭(지역+정규화 이름 정확 일치)이 못 잇는 항목을 관리자가 수동 연결(alias)한다.
alias는 적재(3.4b 데이터) 시 자동 매칭보다 **우선 적용**된다. 모델: `ForecastPlaceAlias`.

```
GET    /api/admin/concentration-matching/preview?areaCd=11&signguCd=11110
```
KTO 외부 API 1회 호출(저장 없음). `data`: `counts{matched,aliasMatched,unmatched,ambiguous}`,
`items[]{tAtsNm,status,forecastCount,averageRate,matchedPlace,candidates}`, `truncated`, `skipped`.

```
POST   /api/admin/concentration-matching/ingest        # Body { areaCd, signguCd } — 즉시 적재 실행
GET    /api/admin/concentration-matching/aliases       # alias 목록(연결 장소 포함)
POST   /api/admin/concentration-matching/aliases       # upsert. Body { areaCd, signguCd, tAtsNm, placeId }
DELETE /api/admin/concentration-matching/aliases/:id
```
- preview/ingest는 KTO 쿼터(일 1,000)를 소모하므로 관리자 화면에서 버튼 클릭 시에만 호출(자동 폴링 금지).
- 적재 조회 행 수는 5,000(`FORECAST_FETCH_NUM_OF_ROWS`) — 행 수 = 관광지 수 × 30일이라
  구 기본값(100)은 지역당 2~3곳만 담겼음. 호출 수는 동일 1회.

### 6.5 코스 관리 — [B] (구현됨, 2026-08-14)

> 작성·구현: B / 소비: 관리자 웹 "코스 관리" 화면
> 관련 기준: [route-data-rules.md](./route-data-rules.md) — 저장형 Route, 복귀 구간 포함 원칙.
> 인증: 기존 `/api/admin/*` Bearer 규약(6.1) 그대로.
> 소스: `server/src/controllers/admin-route.controller.ts`, `services/route.service.ts`.

#### 스키마 확장 (적용됨 — `20260814070000_add_route_return_segment`)

복귀 구간(마지막 stop → mainPlace)을 저장할 필드가 없었다
(route-data-rules §9 "추후 확정" 항목 해소). `Route`에 추가:

```prisma
// 마지막 RouteStop → mainPlace 복귀 구간(TMAP Place↔Place 고정 경로).
// null이면 복귀 미포함 코스. privacy: 사용자 GPS 아님(RouteStop.pathFromPrevious와 동일 성격).
returnTravelMinutes  Int?
returnDistanceMeters Int?
returnPath           Json?
```

`Route.estimatedTotalDurationMinutes` = 구간 이동시간 합 + `stayMinutes` 합 + (복귀 포함 시) 복귀 이동시간.

#### 6.5.0 코스 전체 목록 — 관리자 화면 필수

```
GET /api/admin/routes
```
현재 코스 조회는 `GET /api/places/:placeId/routes`(3.5)뿐이라 **mainPlace를 미리 알아야만** 조회할 수 있다.
관리자는 "어느 관광지에 코스가 등록돼 있는지"를 먼저 알아야 하는데, 장소가 528곳이라
하나씩 눌러 확인하는 것은 불가능하다(관리자 웹 코스 관리 화면 구현 중 확인된 갭).

`data`: `Route[]` + 화면 표시에 필요한 최소 필드 2개.
```jsonc
{
  "id": 10,
  "name": "경복궁 60분 우회 코스",
  "mainPlaceId": 1,
  "mainPlaceName": "경복궁",   // 조인 — 목록에서 관광지명 표시용
  "stopCount": 3,               // 정류지 수 — 상세 진입 전 코스 규모 파악용
  "description": "...",
  "estimatedTotalDurationMinutes": 55,
  "estimatedTotalDistanceMeters": 1800,
  "createdAt": "...",
  "updatedAt": "..."
}
```
- 정렬: `mainPlaceId` → `id` 오름차순. 코스 수가 수십 건 규모라 페이지네이션은 두지 않는다.
- optional query `?mainPlaceId=` 로 필터 가능하게 하면 3.5와 중복 없이 화면 재사용이 쉬움.

#### 6.5.1 코스 생성

```
POST /api/admin/routes
```
Body:
```jsonc
{
  "name": "경복궁 60분 우회 코스",       // 필수
  "mainPlaceId": 1,                      // 필수 — 내부 Place(관광지)
  "description": "서촌 골목 산책 코스",   // optional
  "includeReturn": true,                  // optional, 기본 true — 복귀 구간 계산·저장 여부
  "stops": [                              // 필수, 1개 이상, 방문 순서대로
    { "placeId": 12, "stayMinutes": 20 },
    { "placeId": 34, "stayMinutes": 15 }
  ]
}
```

- `stopOrder`는 배열 순서로 서버가 부여(1부터). 클라이언트가 별도 전달하지 않는다.
- **이동시간·거리·경로는 클라이언트 입력이 아니라 서버 계산** —
  `route-calculation.service.calculateWalkingRoute(mainPlace → stop1 → … → stopN [→ mainPlace])`(B 제공)로
  `estimatedTravelMinutesFromPrevious`/`estimatedDistanceMetersFromPrevious`/`pathFromPrevious`와
  `Route.estimatedTotal*`, 복귀 필드를 채운다.
- TMAP 호출: 저장 1회당 구간 수(stops + 복귀 1) — 관리자 수동 작업이라 쿼터 영향 미미.
- `400` — name/stops 누락, stops 빈 배열, `stayMinutes`가 양의 정수 아님, `mainPlaceId`/`placeId` 미존재,
  stop에 mainPlace 자신 포함, 좌표 없는 Place 포함.
- `502 EXTERNAL_API_UNAVAILABLE` — TMAP 구간 계산 실패. **부분 저장 없이 전체 실패**(all-or-nothing) —
  경로 미검증 Route는 추천 후보로 쓸 수 없으므로(route-data-rules §13) 미완성 상태로 저장하지 않는다.
- `201` — `data`는 3.6과 동일한 Route 상세(stops 포함).

#### 6.5.2 코스 수정

```
PATCH /api/admin/routes/:id
```
- 부분 수정 — 전달한 필드만 반영(장소 PATCH와 동일 규약).
- `stops` 전달 시 **전체 교체**(tagIds 패턴) + 전 구간 TMAP 재계산. `includeReturn` 변경 시도 재계산.
- `name`/`description`만 변경 시 재계산 없음.
- `404 ROUTE_NOT_FOUND`, 나머지 오류 규약은 6.5.1과 동일.

#### 6.5.3 코스 삭제

```
DELETE /api/admin/routes/:id
```
- `RouteStop`은 연쇄 삭제(스키마 `onDelete: Cascade` 기존 설정).
- **Trip이 참조 중이면 `409 ROUTE_IN_USE`** — 방문 기록 보호(장소 삭제의 `PLACE_IN_USE`와 동일 패턴).
- `404 ROUTE_NOT_FOUND`.

#### 확정된 결정 (구현 반영)

1. **복귀 구간은 `Route` 필드로 저장** — RouteStop에 mainPlace를 가상 행으로 넣는 대안은
   기존 조회 API(3.6) 응답에서 "마지막 stop이 방문지인지 복귀인지" 구분이 불가능해 채택하지 않았다.
2. **진행 중 방문이 있으면 구성 변경 불가** — `IN_PROGRESS` Trip이 있는 코스에 `stops`/`includeReturn`/
   `mainPlaceId` 변경을 시도하면 `409 ROUTE_TRIP_IN_PROGRESS`. 이름·설명 수정은 허용된다.
3. **mainPlace는 `TOURIST_SPOT`만** — 우회 코스의 기준은 원래 관광지라는 도메인 정의를 따른다.
   아니면 `400`.

#### 검증된 동작 (route.service.write.test.ts)

- 구간 배분: `segments[i]`가 i번째 정류지의 진입 구간, 복귀 포함 시 마지막 1개가 복귀 구간
- 총 소요시간 = 모든 구간 이동시간(복귀 포함) + 체류시간 합
- `includeReturn: false`면 복귀 좌표를 waypoints에 넣지 않는다(TMAP 호출 1회 절약)
- 좌표가 없거나 `(0, 0)`인 장소는 계산 전에 `400` — TourAPI 적재 경로와 동일하게 0을 무효 좌표로 본다
- 이름·설명만 수정하면 TMAP을 호출하지 않는다
