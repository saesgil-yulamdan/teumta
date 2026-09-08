# 위치정보 처리 아키텍처 (Location Privacy)

> 원칙: **사용자의 실제 현재 GPS는 단말기(mobile) 내부에서만 처리하고, 틈타 서버로 전송·저장하지 않는다.**
> 목적은 위치정보 처리를 최소화하는 아키텍처 구현이다(법적 판단 목적 아님).

---

## 1. 데이터 흐름

```
 KTO(TourAPI) / SK 혼잡도 / TMAP
              │
              ▼
       teumta Backend
   - Place 고정 좌표
   - 혼잡도 / 예측
   - 장소 ↔ 장소 경로(TMAP)
   - 추천 코스 데이터
              │  (사용자 GPS는 오지 않음)
              ▼
           Mobile
   Place 좌표  +  사용자 GPS(OS Location API)
              │
              ▼
   거리 계산 · 도착 판정 · 진행 상태 · 복귀 여부  ← 전부 단말 내부
              │
              ▼
   사용자 GPS는 단말 밖으로 나가지 않음
```

### 서버가 아는 것 / 모르는 것
- **서버가 아는 것**: Place 고정 좌표, 혼잡도, Place↔Place 경로/이동시간, 추천 코스
- **서버가 모르는 것**: 사용자의 현재 위치, 이동 경로, 위치 history, 도착/방문 시각·장소

---

## 2. 서버 측 원칙

- 서버 API 표면(`/health`, `/places`, `/places/:id`)은 **좌표를 입력으로 받지 않는다.**
- `Place.latitude/longitude`는 **관광지/로컬 장소의 고정 좌표**이며 사용자 위치가 아니다(계속 관리).
- TMAP 호출은 **Place ↔ Place 좌표만** 사용한다. `user GPS → backend → TMAP` 형태는 금지.
  - 안전장치: 내부 `Coordinate` 타입/`route-calculation.service`에 "Place 전용, 사용자 GPS 금지" 주석 명시.
- 서버 로그: `error.middleware`는 sanitized message만 기록. 요청 body 로깅·요청 로거·analytics 없음.
- **스키마에서 제거한 필드**
  - `TripEvent.latitude`, `TripEvent.longitude` — 사용자 GPS 저장 벡터 제거
  - `Trip.deviceId`(+ 인덱스) — 장기 device identifier 저장 제거
- `TripEvent.metadata(Json)`는 유지하되 **사용자 위치를 절대 넣지 않는다**(스키마 주석으로 명시).

### Trip / TripEvent 취급
- 현재 Trip/TripEvent를 사용하는 API/코드는 없다(진행 상태는 서버에 저장되지 않음).
- 진행 상태(코스 시작/도착/출발/복귀/완료)는 **mobile local state**에서 관리한다.
  현재 코스와 진행 상태는 AsyncStorage에 저장해 앱이 재시작되어도 복구하며,
  코스 완료 또는 명시적 종료 시 삭제한다. 이 데이터는 서버로 전송하지 않는다.
- 향후 "방문 로그" 기능이 필요하면, `PLACE_ARRIVED + placeId + timestamp + persistent deviceId`처럼
  사용자 방문 위치를 지속 축적하는 구조는 피한다. Trip 식별은 device identifier 대신
  **Trip 자체 id 또는 Trip 한정 랜덤 session id**를 사용한다.

---

## 3. Mobile 측 원칙

- 위치 권한: **foreground(when-in-use) 전용.** `ACCESS_BACKGROUND_LOCATION` 사용하지 않음.
  - `app.json`의 `expo-location` 플러그인: `isAndroidBackgroundLocationEnabled: false`,
    `isAndroidForegroundServiceEnabled: false`, `locationWhenInUsePermission`만 설정.
- 위치 획득: `Location.requestForegroundPermissionsAsync()` → `getCurrentPositionAsync` /
  `watchPositionAsync`(foreground). watch 구독은 unmount 시 `remove()`로 해제 → 지속 추적 없음.
- 위치는 **단말 state로만 유지**하고 어떤 서버로도 전송하지 않는다.
- 도착 판정: 단말에서 Haversine 거리 계산 후 `ARRIVAL_RADIUS_METERS` 이내면 도착.
- 길찾기: 외부 지도 앱(TMAP/구글맵)을 **목적지만 넘겨** 실행. 출발지 미지정 →
  외부 앱이 자체 위치로 길찾기. 틈타 서버로 현재 GPS를 보내지 않는다.

### 관련 파일 (mobile/src)
| 파일 | 역할 |
|------|------|
| `constants/location.ts` | `ARRIVAL_RADIUS_METERS`(=50), foreground 위치 옵션 |
| `utils/distance.ts` | Haversine 거리(m) — 단말 내부 계산 |
| `utils/arrival.ts` | `hasArrived(current, destination, radius)` |
| `utils/directions.ts` | 외부 지도 앱 길찾기(목적지만 전달) |
| `hooks/use-current-location.ts` | foreground 전용 위치 훅(구독 해제 포함) |
| `hooks/use-course-progress.ts` | 코스 진행 상태 local state·AsyncStorage 복구 관리 |
| `stores/selected-course.ts` | 현재 코스 선택값을 AsyncStorage에 보존·복구 |

---

## 4. 마이그레이션

스키마 변경(`TripEvent.lat/lng`, `Trip.deviceId` 제거)을 적용하려면:

```sh
cd server
npx prisma migrate dev   # 20260730120000_remove_user_gps_and_device_id 적용
# 클라이언트만 갱신하려면: npx prisma generate
```

> DB가 이미 init 마이그레이션까지 적용된 상태에서 위 마이그레이션이 컬럼/인덱스를 DROP한다.
> 새로 시작하는 환경은 `npx prisma migrate dev`가 init → 본 마이그레이션 순으로 적용한다.

---

## 5. 검증 체크리스트(수동)

1. GPS 권한 승인 후 현재 위치 조회 가능
2. 현재 위치 ↔ Place 좌표 거리 단말에서 계산 가능
3. 목적지 반경(`ARRIVAL_RADIUS_METERS`) 이내 진입 시 도착 판정
4. backend 요청에 사용자 latitude/longitude 없음
5. DB에 사용자 latitude/longitude 저장 안 됨(스키마에 필드 없음)
6. server log에 사용자 GPS 없음
7. TMAP 호출은 Place ↔ Place 좌표만 사용
8. background location permission 없음
9. 앱 종료/foreground 이탈 후 지속 위치 추적 없음
10. 관광지 검색 / 우회 코스 추천 / 혼잡도 조회 기능 정상

---

## 6. 남은 위험 요소(residual risk)

- `TripEvent.metadata(Json)`: 자유형 필드라 실수로 위치가 들어갈 수 있음 → 주석으로 금지 명시.
  향후 방문 로그 구현 시 metadata 사용 정책을 A와 확정(필요 없으면 제거 권장).
- `Trip.id`가 순차 정수(autoincrement): 방문 로그 API를 노출한다면 랜덤/추측 불가 식별자 고려.
- (참고) 외부 지도 앱은 자체적으로 사용자 위치에 접근하지만, 이는 해당 앱의 처리이며 틈타 서버와 무관.
