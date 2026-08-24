export type CongestionLevel = 'low' | 'medium' | 'high' | 'veryHigh';

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type DetourCourse = {
  id: string;
  name: string;
  durationMinutes: number;
  distanceKm: number;
  description: string;
  coordinates: Coordinate[];
  /** 코스 경유지 이름(표시용, 마지막은 복귀 지점). */
  stops?: string[];
  /** 코스 내 추천 체류시간(분). */
  stayMinutes?: number;
};

export type Place = {
  id: string;
  name: string;
  area: string;
  shortDescription: string;
  description: string;
  congestionLevel: CongestionLevel;
  congestionLabel: string;
  congestionMessage: string;
  recommendedDurationMinutes: number;
  detours: DetourCourse[];
};

/** GET /api/search/places 응답 항목. DB 미저장 — source에 따라 식별자 상이. */
export type SearchPlaceResult = {
  source: 'TOUR' | 'TMAP';
  tourApiContentId: string | null;
  tmapPoiId: string | null;
  contentTypeId: string | null;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
};

/** GET /api/congestion 응답. TMAP POI로 매칭되는 장소만 조회 가능. */
export type RealtimeCongestion = {
  poiId: string;
  poiName: string | null;
  level: 'RELAXED' | 'NORMAL' | 'CROWDED' | 'VERY_CROWDED';
  source: string;
  measuredAt: string | null;
  fetchedAt: string;
  isRealtime: boolean;
};

/** GET /api/local-places 응답 항목. DB 미저장 — 내부 id 없이 name+좌표로 구분. */
export type NearbyLocalPlaceResult = {
  kind?: 'LOCAL_PLACE' | 'FESTIVAL';
  /** TourAPI 콘텐츠 식별자. 상세 소개 조회 키. */
  tourApiContentId: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  /** 분류 라벨(문화시설/쇼핑/음식점). 알 수 없으면 null. */
  category: string | null;
  /** TMAP 실측 보행거리(m). 직선거리 아님. */
  distanceMeters: number;
  travelTimeMinutes: number;
  /** 행사 시작일(YYYYMMDD). 상설 로컬이면 null. */
  eventStartDate?: string | null;
  /** 행사 종료일(YYYYMMDD). 상설 로컬이면 null. */
  eventEndDate?: string | null;
};

/** GET /api/concentration-forecast 응답. 날짜별 예측 — 실시간 혼잡도 아님. */
export type ConcentrationForecastEntry = {
  /** "YYYY-MM-DD" (KST). */
  forecastDate: string;
  concentrationRate: number;
  source: string;
  isRealtime: false;
};

export type ConcentrationForecast = {
  destinationName: string;
  /** 실제 매칭된 KTO 관광지명(표기 상이 가능). */
  matchedName: string;
  areaCd: string;
  signguCd: string;
  isRealtime: false;
  forecasts: ConcentrationForecastEntry[];
};

/**
 * GET /api/local-places/detail 응답. 상세 화면 진입 시 1회만 조회한다.
 * 목록에는 소개문이 없어 이름·거리만으로 판단해야 한다.
 */
export type LocalPlaceDetail = {
  tourApiContentId: string;
  name: string | null;
  /** 소개문. HTML 정리 후 평문. */
  overview: string | null;
  tel: string | null;
  homepage: string | null;
  /** 운영시간(TourAPI detailIntro2). 미제공이면 null. 구서버 응답엔 필드가 없을 수 있다. */
  openHours?: string | null;
  /** 휴무일. 미제공이면 null. */
  restDays?: string | null;
};
