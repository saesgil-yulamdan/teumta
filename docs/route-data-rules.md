# Route 데이터 구성 및 추천 기준 초안

## 1. 문서 목적

틈타 서비스에서 우회 코스로 사용하는 `Route`와 `RouteStop` 데이터를 어떤 기준으로 구성하고 관리할지 정의한다.

본 문서는 현재 Prisma의 `Place`, `Route`, `RouteStop` 구조와 백엔드의 `route-calculation.service.ts` 기반 TMAP 경로 계산 방식을 기준으로 작성한다.

MVP에서는 사용자 요청 시 후보 Place를 조합해 새로운 Route를 동적으로 생성하기보다, 팀이 미리 구성하고 관리하는 Route 후보 중 사용자의 이용 가능 시간과 코스 조건에 맞는 Route를 조회하는 방식을 우선 적용한다.

Route API는 현재 백엔드 A에서 구현 예정이므로, 사용자 요청 시 추가적인 TMAP 재계산이 필요한지 등 세부 동작은 API 구현 과정에서 확정한다.

---

## 2. 현재 Route 데이터 구조

현재 백엔드의 주요 Route 관련 필드는 다음과 같다.

### Route

| 필드 | 의미 |
|---|---|
| `id` | Route 식별자 |
| `name` | 코스 이름 |
| `mainPlaceId` | 우회 코스의 기준이 되는 원래 관광지 |
| `description` | 코스 설명 |
| `estimatedTotalDurationMinutes` | Route의 예상 총 소요시간 |
| `estimatedTotalDistanceMeters` | Route의 예상 총 이동거리 |

### RouteStop

| 필드 | 의미 |
|---|---|
| `routeId` | 소속 Route |
| `placeId` | 방문 장소 |
| `stopOrder` | Route 내 방문 순서 |
| `stayMinutes` | 해당 Route에서의 권장 체류시간 |
| `estimatedTravelMinutesFromPrevious` | 이전 장소에서 현재 장소까지의 예상 이동시간 |
| `estimatedDistanceMetersFromPrevious` | 이전 장소에서 현재 장소까지의 예상 이동거리 |
| `pathFromPrevious` | 이전 장소에서 현재 장소까지의 TMAP 보행 경로 |

첫 번째 `RouteStop`의 이전 장소는 `Route.mainPlace`로 본다.

예시는 다음과 같다.

```text
mainPlace
→ RouteStop 1
→ RouteStop 2
→ RouteStop 3
```

---

## 3. 실시간 주변 장소와 Route 데이터 구분

`GET /api/local-places`에서 반환하는 주변 로컬 장소는 요청 시 TourAPI와 TMAP을 통해 조회하는 실시간 데이터이며, 해당 응답 자체는 DB에 저장하지 않는다.

반면 `RouteStop.placeId`는 DB에 등록된 `Place.id`를 참조한다.

따라서 실시간 `local-places` API 응답을 그대로 `RouteStop`으로 저장하거나 연결하지 않는다.

```text
실시간 local-places 결과
→ 사용자에게 주변 장소 후보로 제공
→ DB에 자동 저장하지 않음
→ RouteStop으로 자동 연결하지 않음
```

팀이 관리하는 Route에 특정 로컬 장소를 포함하려면 해당 장소가 먼저 내부 `Place` 데이터로 등록되어 있어야 한다.

```text
팀 관리 Place
→ Place.id 생성
→ RouteStop.placeId로 연결
→ 저장된 Route 구성에 사용
```

실시간 주변 장소와 팀이 관리하는 Route 데이터는 서로 다른 역할로 구분한다.

---

## 4. Route 구성 기본 원칙

MVP에서는 하나의 Route를 원래 관광지를 기준으로 여러 장소를 방문하는 형태로 구성한다.

```text
mainPlace
→ 로컬 장소 A
→ 로컬 장소 B
→ ...
→ 필요한 경우 mainPlace 복귀
```

Route의 장소 구성과 방문 순서는 미리 저장한다.

사용자 요청 시에는 새로운 장소 조합을 즉석에서 생성하기보다 해당 `mainPlace`에 등록된 Route 후보를 조회한다.

Route는 다음 기준을 만족하도록 구성한다.

- 기준 관광지인 `mainPlace`가 명확해야 한다.
- 최소 하나 이상의 `RouteStop`을 포함해야 한다.
- 모든 `RouteStop`은 DB에 존재하는 `Place`를 참조해야 한다.
- 동일 Route 안에서 `stopOrder`가 중복되지 않아야 한다.
- 각 장소의 체류시간을 설정할 수 있어야 한다.
- 장소 사이의 TMAP 보행 경로 계산이 가능해야 한다.
- 사용자가 선택한 제한시간 안에 이용할 수 있는 코스인지 판단할 수 있어야 한다.

---

## 5. RouteStop 장소 선정 기준

Route에 포함할 Place는 다음 기준을 바탕으로 검토한다.

### 필수 조건

- 내부 DB의 `Place`에 등록되어 있다.
- `latitude`, `longitude`가 존재해 TMAP 경로 계산이 가능하다.
- 기준 관광지인 `mainPlace`에서 현실적으로 이동 가능한 위치에 있다.
- 실제 방문 장소로 사용자에게 제공할 수 있는 장소이다.

### 추가 고려 조건

- 장소의 운영시간
- 장소의 기본 권장 체류시간
- 장소 유형
- 태그
- mainPlace와의 이동거리
- 다른 RouteStop과의 위치 관계
- 전체 Route의 예상 소요시간

현재 `Place`에는 `openingTime`과 `closingTime`이 존재하지만, 요일별 영업시간, 정기 휴무일 및 임시 휴무 정보를 저장하는 구조는 없다.

따라서 현재 DB 정보만으로 장소의 정확한 실시간 영업 여부를 완전히 판단할 수 없으며, 저장된 운영시간 범위 안에서 확인 가능한 수준으로만 활용한다.

---

## 6. 권장 체류시간 기준

장소 자체의 기본 권장 체류시간은 `Place.recommendedDuration`을 참고한다.

특정 Route에서 실제로 사용할 체류시간은 `RouteStop.stayMinutes`에 저장한다.

```text
Place.recommendedDuration
→ 장소 자체의 기본 권장 체류시간

RouteStop.stayMinutes
→ 해당 Route에서 실제 적용하는 체류시간
```

따라서 동일한 Place라도 Route의 전체 제한시간과 코스 성격에 따라 `stayMinutes`를 다르게 설정할 수 있다.

예를 들어 기본 권장 체류시간이 20분인 장소라도 짧은 Route에서는 10~15분 등 별도의 체류시간을 적용할 수 있다.

다만 지나치게 짧은 체류시간으로 인해 실제 방문 의미가 없어지지 않도록 장소별 최소 체류시간 기준은 추후 Route 데이터 구성 과정에서 정한다.

---

## 7. 30분 / 60분 / 90분 Route 구성 기준

사용자는 우회 코스를 이용할 수 있는 시간으로 다음 세 구간 중 하나를 선택한다.

| 코스 구분 | 사용자 선택 시간 |
|---|---|
| 짧은 코스 | 30분 |
| 기본 코스 | 60분 |
| 여유 코스 | 90분 |

30분, 60분, 90분은 Route가 정확히 해당 시간만큼 소요되어야 한다는 의미가 아니라 사용자가 허용하는 최대 이용시간으로 사용한다.

Route의 예상 총 소요시간은 다음 요소를 기준으로 계산한다.

```text
전체 Route 소요시간
= mainPlace → 첫 RouteStop 이동시간
+ 각 RouteStop 체류시간
+ RouteStop 간 이동시간
+ 필요한 경우 mainPlace 복귀 구간
```

원래 관광지로 다시 돌아오는 형태의 우회 코스라면 마지막 RouteStop에서 `mainPlace`까지의 복귀 이동시간도 전체 소요시간에 포함해야 한다.

다만 현재 `RouteStop` 스키마에는 마지막 RouteStop에서 `mainPlace`로 복귀하는 구간의 이동시간, 거리 및 경로를 별도로 저장하는 필드가 없다.

따라서 복귀 구간의 계산 및 저장 방식은 Route API 구현 과정에서 백엔드 A와 확정한다.

사용자가 선택한 시간보다 예상 총 소요시간이 긴 Route는 추천 후보에서 제외한다.

예시는 다음과 같다.

```text
사용자 선택 시간: 60분

Route A 예상 총 소요시간: 52분
→ 후보 포함

Route B 예상 총 소요시간: 67분
→ 후보 제외
```

---

## 8. RouteStop 순서 결정 기준

`RouteStop.stopOrder`는 Route에서 실제 장소를 방문하는 순서를 의미한다.

방문 순서는 다음 항목을 고려해 결정한다.

- mainPlace에서 첫 장소까지의 접근성
- RouteStop 사이의 실제 보행 이동시간
- 불필요한 왕복 이동 최소화
- 전체 이동거리
- 장소 운영시간
- 장소별 권장 체류시간
- 마지막 장소 이후 Route 종료 또는 mainPlace 복귀 가능성

Route 구성 시 TMAP 경로 계산 결과를 활용해 비효율적인 이동 순서를 줄인다.

예시는 다음과 같다.

```text
mainPlace
→ stopOrder 1
→ stopOrder 2
→ stopOrder 3
```

동일 Route 안에서는 `stopOrder`가 중복되지 않는다.

---

## 9. TMAP 경로 계산 기준

Route 구성 과정의 보행 경로 계산은 백엔드 B에서 제공하는 `route-calculation.service.ts`를 사용한다.

백엔드 A가 Route 관련 기능을 구현할 때 TMAP을 직접 호출하기보다 해당 서비스를 통해 경로를 계산하는 구조를 기준으로 한다.

경로 계산에는 DB에 저장된 Place의 고정 좌표를 사용한다.

```text
Place.latitude
Place.longitude
```

사용자의 현재 GPS 좌표는 Route 경로 계산에 사용하지 않는다.

TMAP 계산 결과는 현재 다음 데이터에 활용한다.

- `RouteStop.estimatedTravelMinutesFromPrevious`
- `RouteStop.estimatedDistanceMetersFromPrevious`
- `RouteStop.pathFromPrevious`
- `Route.estimatedTotalDurationMinutes`
- `Route.estimatedTotalDistanceMeters`

`pathFromPrevious`에는 이전 장소에서 현재 장소까지의 고정 보행 경로를 저장한다.

이는 Place와 Place 사이의 경로 데이터이며 사용자의 실제 GPS 이동 기록이 아니다.

### 복귀 구간

현재 `RouteStop`의 경로 관련 필드는 모두 이전 장소에서 현재 RouteStop까지의 구간을 기준으로 한다.

따라서 마지막 RouteStop에서 `mainPlace`로 다시 돌아오는 복귀 구간을 사용하는 경우 해당 구간의 세부 경로를 어떤 방식으로 저장할지는 현재 스키마만으로 확정할 수 없다.

복귀 구간의 이동시간은 전체 Route 소요시간에 포함할 수 있지만, 세부 거리와 폴리라인 저장 방식은 Route API 구현 과정에서 확정한다.

---

## 10. Route 소요시간 검증

Route 구성 시 `route-calculation.service.ts`를 이용해 Place 간 보행 경로를 계산하고 예상 이동시간과 이동거리 정보를 Route 및 RouteStop 데이터에 반영한다.

현재 Route 관련 API는 백엔드 A에서 구현 예정이므로, 사용자가 Route를 조회할 때마다 TMAP을 다시 호출해 이동시간을 재계산할지는 아직 확정하지 않는다.

MVP에서는 우선 저장된 Route의 예상 총 소요시간을 이용해 사용자가 선택한 시간에 맞는 후보를 조회하는 방식을 기준으로 한다.

```text
현재 관광지의 혼잡 상태 확인
→ 사용자가 30 / 60 / 90분 선택
→ 해당 mainPlace의 저장된 Route 조회
→ 저장된 예상 총 소요시간 기준 후보 필터링
→ 선택 시간 내 이용 가능한 Route 추천
```

사용자 요청 시 최신 TMAP 경로를 다시 계산하는 기능이 필요한 경우 다음 요소를 고려해 적용 여부를 결정한다.

- TMAP 보행자 API 호출 한도
- 응답 속도
- 저장된 경로와 최신 경로의 차이
- 사용자 요청당 필요한 API 호출 횟수

현재 TMAP 보행자 API가 전체 외부 API 호출 구조의 주요 병목 중 하나이므로 불필요한 반복 호출은 피하는 방향을 우선 검토한다.

---

## 11. Route 필터링 기준

사용자에게 Route를 제공하기 전에 다음 조건을 확인한다.

### 1차 필터링

- 현재 관광지를 `mainPlace`로 하는 Route인지 확인한다.
- 사용자가 선택한 30분, 60분, 90분 시간 조건에 맞는지 확인한다.
- RouteStop 데이터가 정상적으로 구성되어 있는지 확인한다.
- 저장된 예상 총 소요시간이 사용자 선택 시간 이하인지 확인한다.
- 장소 운영시간 정보가 존재하는 경우 예상 방문 가능한 시간인지 확인한다.

### 최종 확인

- Route 구성 시 필요한 TMAP 경로 계산이 정상적으로 완료된 데이터인지 확인한다.
- RouteStop의 이동시간과 체류시간 데이터가 존재하는지 확인한다.
- 사용자가 선택한 제한시간 내 이용 가능한지 확인한다.
- 명확하게 이용 불가능한 장소가 포함되어 있지 않은지 확인한다.
- 원래 관광지 복귀가 필요한 Route라면 복귀시간까지 포함한 총 소요시간을 확인한다.

사용자 요청 시 TMAP 재계산 기능을 도입하는 경우에는 최신 계산 결과를 최종 소요시간 판단에 우선 적용한다.

조건을 만족하지 않는 Route는 추천 후보에서 제외한다.

---

## 12. Route ranking 기준

여러 Route가 필터링 조건을 만족하는 경우 다음 항목을 ranking 후보 기준으로 활용할 수 있다.

- 사용자가 선택한 시간과 Route 예상 총 소요시간의 적합도
- 총 이동시간
- 총 이동거리
- RouteStop 수
- 각 장소에 확보된 체류시간
- Route 데이터의 완전성 및 유효성

초기 MVP에서는 복잡한 점수 기반 추천 모델보다 단순한 우선순위 규칙을 먼저 적용하는 방향을 검토한다.

예를 들어 동일한 60분 Route 후보가 여러 개 존재한다면 불필요한 이동이 적고 충분한 체류시간을 확보할 수 있는 Route를 우선할 수 있다.

구체적인 ranking 우선순위와 가중치는 실제 Route 데이터 구성 후 팀 논의를 통해 확정한다.

SK 실시간 혼잡도를 각 RouteStop의 ranking 요소로 활용할 수 있는지는 개별 장소의 SK POI 매칭 및 조회 가능 범위를 확인한 후 결정한다.

---

## 13. 데이터 누락 및 예외 처리

### Place 좌표가 없는 경우

TMAP 경로 계산이 불가능하므로 해당 Place를 RouteStop으로 구성하지 않는다.

### `recommendedDuration`이 없는 경우

Route 구성 과정에서 `RouteStop.stayMinutes`를 별도로 설정할 수 있다.

공통 기본값을 사용할지 여부는 실제 Route 데이터 구성 과정에서 결정한다.

### `stayMinutes`가 없는 경우

전체 Route 소요시간을 정확하게 계산할 수 없으므로 추천에 사용할 수 있도록 Route 데이터 구성 단계에서 보완하는 것을 우선한다.

### 운영시간 정보가 없는 경우

현재 이용 가능 여부를 정확하게 판단하기 어렵다.

운영시간 정보가 없는 장소를 Route에서 허용할지 여부는 별도 추천 정책으로 정한다.

### 휴무일 정보가 없는 경우

현재 스키마에는 요일별 영업시간, 정기 휴무 및 임시 휴무 정보를 저장하는 구조가 없으므로 정확한 판단이 불가능하다.

추가 데이터 확보 여부에 따라 보완한다.

### TMAP 경로 계산 실패

Route 생성 또는 관리 단계에서 경로 계산이 완료되지 않은 Route는 정상 추천 후보로 사용하지 않는다.

### 선택 시간 내 Route가 없는 경우

사용자에게 선택한 시간 내 이용 가능한 우회 코스가 없음을 안내한다.

필요한 경우 더 긴 시간 조건을 선택하도록 안내할 수 있다.

```text
30분 → 60분
60분 → 90분
```

### RouteStop으로 사용할 DB Place가 없는 경우

실시간 `local-places` 결과를 임의로 `RouteStop`에 연결하지 않는다.

Route 구성에 필요한 장소라면 먼저 내부 `Place` 등록 및 관리 절차를 거친 뒤 Route에 포함한다.

---

## 14. Route와 Trip의 역할 구분

`Route`는 팀이 미리 구성하고 관리하는 코스 데이터이다.

`Trip`은 사용자가 특정 Route를 선택한 뒤 해당 코스를 실제로 진행하는 방문 세션이다.

```text
Route
→ 방문 장소와 순서, 예상 이동시간 및 체류시간 정의

Trip
→ 사용자가 선택한 Route의 실제 진행 상태 관리
```

Route 데이터에는 사용자의 실제 위치 정보를 저장하지 않는다.

사용자의 GPS는 단말 내부에서 처리하며 서버에 전송하거나 저장하지 않는 현재 privacy 원칙을 따른다.

장소 도착 여부와 Route 진행 여부를 판단하기 위한 GPS 처리는 Mobile에서 수행한다.

Backend에서는 Route와 Place의 고정 좌표 및 코스 데이터를 관리한다.

---

## 15. 현재 구현 상태와 역할 구분

현재 Route 관련 Prisma 스키마는 준비되어 있다.

주요 준비 항목은 다음과 같다.

- `Route`
- `RouteStop`
- `Trip`
- `TripEvent`
- `RouteStop.pathFromPrevious`
- `route-calculation.service.ts`

현재 백엔드 A에서 다음 Route / Trip API를 구현할 예정이다.

```text
GET /api/places/:placeId/routes
GET /api/routes/:routeId
POST /api/trips
POST /api/trips/:tripId/events
GET /api/trips/:tripId
```

따라서 본 문서에서 정의한 데이터 구성 기준 중 실제 API 동작과 직접 연결되는 세부 사항은 Route API 구현 과정에서 추가 조정될 수 있다.

---

## 16. 추후 확인 및 결정 사항

- 실제 Route에 포함할 Place 선정 방식
- 신규 로컬 장소를 내부 DB의 Place로 등록하는 관리 절차
- 장소 유형별 기본 `recommendedDuration` 기준
- `RouteStop.stayMinutes` 설정 기준
- 30분 / 60분 / 90분 Route별 적정 RouteStop 개수
- Route 소요시간에 별도 여유시간을 적용할지 여부
- 마지막 RouteStop → mainPlace 복귀 구간의 저장 방식
- 복귀 구간의 거리 및 `pathFromPrevious`와 별도 경로 데이터 처리 방식
- 사용자 Route 조회 시 TMAP을 다시 호출해 경로를 재계산할지 여부
- 운영시간 정보가 없는 Place의 추천 정책
- 요일별 영업시간 및 휴무일 데이터 확보 방식
- Route ranking 우선순위 및 가중치
- SK 실시간 혼잡도를 Route ranking에 활용할지 여부
- 태그를 Route 추천에 활용할지 여부
- 관리자 웹의 Route 생성·수정 방식
- 동적 Route 생성 기능을 MVP 이후 도입할지 여부