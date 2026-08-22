# 틈타 서비스 전체 구조

**목적: 오버투어리즘 완화.** 붐비는 관광지의 수요를 걸어서 갈 수 있는 로컬 장소로 분산시킨다.
혼잡도(실시간)와 집중률 예측(날짜별)이 판단 근거, 우회 코스가 분산 수단이다.

상세 명세는 [api-spec.md](./api-spec.md), 담당별 할 일은 [team-todo.md](./team-todo.md).

---

## 1. 유저플로우

```
[검색]              [상세]                      [우회 코스]              [진행]
관광지·장소 검색  →  혼잡도 + 30일 집중률   →   가용 시간 선택          →  지도 따라 이동
(TOUR/TMAP 통합)     주변 로컬 장소 목록        30/60/90분 코스 후보       도착 판정은 단말
                     ↑ 혼잡하면 우회 강조       ↑ 요청 시 실시간 생성      ↑ 서버에 기록 안 함
```

| 단계 | 호출 |
|---|---|
| 검색 | `GET /api/search/places?keyword=` |
| 실시간 혼잡도 | `GET /api/congestion?contentId=` 또는 `?poiId=` |
| 날짜별 집중률 | `GET /api/concentration-forecast?contentId=` |
| 주변 로컬 장소 | `GET /api/local-places?contentId=` 또는 `?poiId=` |
| 우회 코스 | `GET /api/courses?contentId=&availableMinutes=` |
| 코스 진행 | 서버 호출 없음 — 단말 local state |

**전국에서 동작한다.** 검색·혼잡도·집중률·주변 장소·코스 전부 요청 시점에 외부 API로 해석한다.

---

## 2. 데이터 흐름 — 실시간과 적재의 구분

공모전 데이터 활용 기준: **관광정보(장소명·주소·좌표·이미지)는 요청 시 조회하고 DB에 저장하지 않는다.**

### 실시간 경로 (DB 미저장) — 앱이 쓰는 경로 전부

```
앱 → teumta 서버 → 외부 API → 변환 → 응답 (저장 없음)

 검색       TourAPI searchKeyword2 → 결과 없으면 TMAP POI 검색 폴백
 주변 장소   TourAPI detailCommon2(기준 좌표) + locationBasedList2(14/38/39)
            → 중복 제거·선별(최대 10) → TMAP 보행자 경로(동시 3) → 거리순
 혼잡도      SK 퍼즐 실시간 (서버 5분 캐시)
 집중률      TourAPI detailCommon2로 법정동 코드 확보 → KTO 지역 예측 (지역 단위 6시간 캐시)
 우회 코스   주변 장소의 실측 보행거리를 재조합 → 반환 코스만 구간 실측 검증
```

### 적재 경로 (DB 저장 — 팀 관리 내부 데이터만)

```
 Place       ingest:tour 스크립트(수동). 현재 종로구 528곳
             → 저장형 코스의 정류지, 집중률 매칭 참조용
 Congestion  집중률 예측 스케줄러(자동, 매일 05시 KST) — MATCHED만 저장
             미매칭은 관리자 웹에서 alias로 수동 연결
 Route/Trip  관리자가 등록하는 저장형 코스. 앱은 현재 사용하지 않는다
```

> ⚠️ **DB에는 종로구 528곳뿐이다.** 전국 장소는 어디에도 저장돼 있지 않다.
> "전국이 되었다"는 적재를 늘린 것이 아니라 실시간 해석으로 바꾼 결과다.

### 개인정보 원칙 ([location-privacy.md](./location-privacy.md))

- 서버 API는 **좌표를 입력으로 받지 않는다** — 식별자(contentId/poiId)만 받고 서버가 좌표로 해석
- 사용자 GPS는 단말 내부에서만 처리, 서버 전송·저장 금지
- 도착·복귀 판정도 단말에서 — 서버는 방문 장소·시각을 알지 않는다

---

## 3. 외부 API 호출량 (쿼터)

| 사용자 액션 | TourAPI | TMAP | 퍼즐 |
|---|---|---|---|
| 검색 1회 | 1 | 0~1 (폴백 시) | — |
| 주변 장소 1회 (contentId) | 4 | 10 | — |
| 주변 장소 1회 (poiId) | 3 | 11 | — |
| 우회 코스 1회 | 0 (주변 장소 결과 재사용) | 수 건(반환 코스 구간 검증) | — |
| 혼잡도 1회 | — | — | 0~1 (5분 캐시) |
| 집중률 1회 | 1 | — | — (KTO 별도, 지역 6시간 캐시) |

**한도** — TourAPI 일 1,000 · TMAP 보행자 일 1,000 / POI 검색 일 20,000 · 퍼즐 월 3,000
→ **하루 감당량 ≈ 주변 장소 조회 100회**(병목: TMAP 보행자).
프론트는 검색 자동완성 금지(버튼 또는 500ms+ debounce).

---

## 4. 배포 (Cloudtype, 서울 리전)

```
org main 머지 → Cloudtype 콘솔 "배포하기" → 반영
```

- 서버 `https://port-0-teumta-server-msh476v8e47b3c7e.sel3.cloudtype.app`
  (기동 시 `prisma migrate deploy` 자동 실행)
- 관리자 웹 `https://port-0-teumta-admin-web-msh476v8e47b3c7e.sel3.cloudtype.app` (로그인 필요)
- DB: MariaDB 11.2, 영구 볼륨 · 백업은 GitHub Actions 매일 05:30 KST(artifact 30일)
- 서버·DB 유료 리소스, 상시 실행. **서버와 관리자 웹은 각각 배포해야 한다**
- 상세: [deploy-cloudtype.md](./deploy-cloudtype.md)

---

## 5. 코드 구조

```
server/src/
├── external/           [B] 외부 API 클라이언트·매퍼 (tour / tmap / congestion / prediction / common)
├── services/
│   ├── place.service.ts                  [A] 장소 도메인
│   ├── route.service.ts                  [A] 저장형 코스 조회 + [B] 관리자 쓰기
│   ├── trip.service.ts                   [A] Trip (앱 미사용)
│   ├── course-generation.service.ts      [B] 실시간 코스 생성 (DB 미사용)
│   ├── nearby-local-place.service.ts     [B] 실시간 주변 장소
│   ├── place-search.service.ts           [B] 목적지 검색
│   ├── congestion.service.ts             [B] 실시간 혼잡도
│   ├── concentration-forecast.service.ts [B] 실시간 집중률
│   ├── concentration-matching.service.ts [B] 집중률 매칭·alias (관리자 웹)
│   ├── *-ingestion.service.ts            [B] 적재
│   ├── prediction-scheduler.service.ts   [B] 일일 적재 스케줄러
│   └── route-calculation.service.ts      [B 제공 → A 소비] TMAP 경로 계산
├── middlewares/        error · admin-auth · login-rate-limit
├── controllers/ routes/
└── prisma/             [A] 스키마 — 변경은 A에게 요청
```

- `mobile/` Expo(React Native) — 사용자 앱
- `admin/` React + Vite — 관리자 웹. **용도 재검토 중**([team-todo.md](./team-todo.md))
- `web/` 지원·개인정보처리방침 정적 페이지(GitHub Pages)
