import type { PlaceType } from '@prisma/client';

/**
 * 내부 장소 데이터 계약.
 *
 * 외부 소스와 무관한 정규화 형태 — 원본 응답 타입(external/tour/tour.dto.ts)과 반드시 분리.
 * 필드 순서는 Prisma `Place` 모델 기준(적재·매칭 편의).
 */
export interface PlaceData {
  /** 외부 콘텐츠 식별자. `Place.tourApiContentId`(unique) 매칭·upsert 키. */
  tourApiContentId: string;
  name: string;
  /** TODO: 외부 분류코드(contentTypeId 등) → PlaceType 매핑 규칙 확정. */
  type?: PlaceType;
  address: string | null;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  description: string | null;
  /** "HH:mm" 형식. */
  openingTime: string | null;
  /** "HH:mm" 형식. */
  closingTime: string | null;
  /** 추천 체류 시간(분). */
  recommendedDuration: number | null;
  /** 법정동 시도 코드(v4.4). 집중률 지역 매칭용. */
  lDongRegnCd?: string | null;
  /** 법정동 시군구 코드(v4.4). */
  lDongSignguCd?: string | null;
  /** 분류체계 1~3Depth(v4.4). */
  lclsSystm1?: string | null;
  lclsSystm2?: string | null;
  lclsSystm3?: string | null;
}

/** 주변 로컬 장소 후보. 요청 스코프 전용 — DB 미저장(공모전 기준), 내부 id 없음. */
export interface NearbyLocalPlaceCandidate {
  /** 코스/화면 표시용 후보 종류. 기존 로컬 후보는 기본 LOCAL_PLACE. */
  kind?: 'LOCAL_PLACE' | 'FESTIVAL';
  /** 중복 제거·자기 자신 제외용. 응답 미노출. */
  tourApiContentId: string;
  /** TourAPI 분류(14 문화시설 / 38 쇼핑 / 39 음식점). 코스 체류시간 기본값 산정용. */
  contentTypeId: string | null;
  /** 세부 분류코드(cat3, 예: A05020900 카페·찻집). 표시용 라벨 산정에 쓴다. */
  categoryCode: string | null;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  /** TourAPI dist(m). 선별용 전용, 응답에 미노출. */
  tourDistanceMeters: number | null;
  /** 행사 시작일(YYYYMMDD). 행사 후보가 아니면 null. */
  eventStartDate?: string | null;
  /** 행사 종료일(YYYYMMDD). 행사 후보가 아니면 null. */
  eventEndDate?: string | null;
}

/**
 * 목적지 검색 결과 항목. 요청 스코프 전용, DB 미저장.
 * source에 따라 tourApiContentId 또는 tmapPoiId가 목적지 식별자(응답 노출).
 */
export interface DestinationSearchResult {
  source: 'TOUR' | 'TMAP';
  tourApiContentId: string | null;
  tmapPoiId: string | null;
  contentTypeId: string | null;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  /**
   * 내부 Place id. 적재된 관광지와 `tourApiContentId`가 일치할 때만, 그 외 null.
   * 집중률 조회(3.4b)가 내부 id를 요구하는데 검색 결과는 DB 미저장이라 연결 고리가 없었음.
   * 조회 전용 매칭 — 적재하지 않는다.
   */
  placeId: number | null;
}

/**
 * 로컬 장소 소개 정보(detailCommon2). 상세 화면 진입 시 1회만 조회한다.
 *
 * 목록에 붙이면 항목 수만큼 외부 호출이 늘어 쿼터가 감당되지 않는다
 * (주변 장소 10곳 × 조회 수). 사용자가 실제로 연 1곳만 부른다.
 */
export interface LocalPlaceDetailData {
  tourApiContentId: string;
  name: string | null;
  /** 소개문. HTML 정리 후 평문. */
  overview: string | null;
  tel: string | null;
  homepage: string | null;
  /**
   * 운영시간(detailIntro2). 휴무일인 장소를 제안하면 신뢰가 깨지는 문제(team-todo 미결정)를
   * DB 스키마 없이 실시간 조회로 푼다. TourAPI 미제공이면 null.
   */
  openHours: string | null;
  /** 휴무일(detailIntro2). 미제공이면 null. */
  restDays: string | null;
}

/** 주변 로컬 장소 응답 항목. distanceMeters는 직선거리 아닌 TMAP 실측 보행거리. */
export interface NearbyLocalPlaceDto {
  /** LOCAL_PLACE=상설 로컬, FESTIVAL=한시 행사·축제. */
  kind?: 'LOCAL_PLACE' | 'FESTIVAL';
  /**
   * TourAPI 콘텐츠 식별자. 상세 소개 조회(3.3c) 키.
   * 공공데이터 식별자이며 내부 id가 아니다 — 검색 응답(3.2)도 같은 값을 노출한다.
   */
  tourApiContentId: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  /** 분류 라벨(문화시설/쇼핑/음식점). 알 수 없으면 null. */
  category: string | null;
  /** TMAP 보행거리(m). */
  distanceMeters: number;
  /** TMAP 보행시간(분, ceil). */
  travelTimeMinutes: number;
  /** 행사 시작일(YYYYMMDD). 상설 로컬이면 null. */
  eventStartDate?: string | null;
  /** 행사 종료일(YYYYMMDD). 상설 로컬이면 null. */
  eventEndDate?: string | null;
}
