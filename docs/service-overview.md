# 틈타 서비스 구조

## 사용자 흐름

```text
장소 검색 → 실시간 혼잡도/30일 집중률 확인 → 30·60·90분 코스 생성 → 단말에서 코스 진행
```

| 단계 | 현재 API |
|---|---|
| 검색 | `GET /api/search/places` |
| 실시간 혼잡도 | `GET /api/congestion` |
| 날짜별 집중률 | `GET /api/concentration-forecast` |
| 주변 장소/행사 | `GET /api/local-places`, `GET /api/festivals/nearby` |
| 장소 소개 | `GET /api/local-places/detail` |
| 코스 | `GET /api/courses`, `GET /api/course-alternatives` |
| 진행 | 서버 호출 없음. GPS·진행 상태는 단말에서 처리 |

## 데이터 흐름과 DB

현재 모바일 경로는 모두 DB 비의존입니다.

```text
Mobile → Express 공개 API → TourAPI/TMAP/SK/KTO → 변환·메모리 캐시 → Mobile
```

- 서버는 시작할 때 Prisma 연결, migration, 예측 적재 스케줄러를 실행하지 않습니다.
- `/health`는 프로세스 상태만 확인하고 DB를 조회하지 않습니다.
- 검색 결과의 과거 내부 `placeId` 연결을 제거했으며 `placeId`는 호환성을 위해 `null`입니다.
- `Route`, `Trip`, 관리자 API, DB 적재 코드는 소스에 보존되어 있지만 라우터에 마운트되지 않습니다.
- 따라서 현재 서비스 운영에는 MySQL이 필요하지 않습니다. 보존 스크립트나 과거 데이터를 다시 쓸 때만 필요합니다.

## 코스 생성

1. 식별자(`contentId` 또는 `poiId`)로 목적지와 주변 후보를 조회합니다.
2. 후보를 최대 10곳으로 줄이고 최대 3개 정류지 조합을 만듭니다.
3. TourAPI 운영정보를 최대 5곳, 동시 3개씩 조회합니다.
4. 예상 도착 시각에 명확히 휴무 또는 브레이크타임인 장소가 든 코스는 제외합니다. 정보가 없거나 자유문자를 확실히 해석하지 못하면 `unknown`으로 두어 과잉 제외하지 않습니다.
5. 상위 후보의 전 구간을 TMAP 보행 경로로 검증하고 제한시간을 넘는 코스를 제외합니다.
6. 시간 활용도·정류지 수·거리·다양성에 가중치를 둔 점수로 정렬해 최대 3개를 반환합니다.

완성된 코스 응답은 서버 메모리에 2분(최대 300건), 모바일에 30초(최대 40건) 캐시합니다. 서버가 여러 인스턴스가 되면 캐시는 인스턴스별입니다.

## timeout과 오류

- 외부 API 1회 호출: 서버 `EXTERNAL_API_TIMEOUT_MS`, 기본 15초
- 일반 모바일 API: 10초
- 코스 생성/대체 코스 모바일 API: 30초
- 모든 JSON 응답: `{ success, data, error }`
- 실패 응답: `data: null`, `error: { code, message }`

코스만 30초로 둔 이유는 단일 요청 안에서 여러 외부 조회와 경로 검증이 직렬·병렬로 섞이기 때문입니다. 일반 조회까지 늘리면 장애 감지가 늦어집니다.

## 캐시와 Redis 판단

현재는 단일 서버 인스턴스와 짧은 TTL, 작은 상한의 메모리 캐시가 맞습니다. Redis를 추가하면 공유 캐시·재시작 간 유지·분산 rate limit을 얻지만 네트워크 장애점, 운영비, 직렬화와 무효화 복잡도가 늘어납니다.

다음 중 하나가 실제로 생기기 전에는 Redis를 도입하지 않습니다.

- 서버를 2개 이상으로 수평 확장
- 인스턴스별 캐시 미스로 외부 API 쿼터가 부족
- 재시작 때 캐시 소실이 사용자 장애로 관측
- 인스턴스 전체에서 정확한 rate limit이 필요

우선 `public_api_usage`, 외부 API rate-limit/timeout, 코스 응답시간과 캐시 hit ratio를 관측합니다.

## 코드 경계

- `server/src/routes/public.routes.ts`: 현재 공개 표면
- `server/src/services/course-generation.service.ts`: 코스 계획·휴무 필터·검증·캐시
- `mobile/src/app`: 화면 조합
- `mobile/src/hooks`: 장소 상세 조회, 코스 조회, 진행, 혼잡도 polling, 알림
- `admin/`: 보존 전용이며 본 문서의 운영 구조에 포함하지 않음
