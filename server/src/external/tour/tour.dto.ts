/**
 * 한국관광공사 TourAPI(KorService2) 원본 응답 타입.
 *
 * 출처: 공공데이터포털 "한국관광공사_국문 관광정보 서비스" 공식 매뉴얼 v4.4 기준.
 *
 * 응답 공통 구조:
 *   { response: { header: {...}, body: { items: {...} | "", numOfRows, pageNo, totalCount } } }
 * - totalCount 0 → items가 빈 문자열("")로 오는 케이스 있음
 * - 결과 1건 → item이 배열 아닌 단일 객체 가능(mapper에서 방어)
 * - 숫자 필드(numOfRows/totalCount 등)가 문자열로 오는 경우 있어 number | string
 *
 * v4.4 주의: 구 areacode/sigungucode/cat1~cat3 대신 법정동 코드(lDongRegnCd/lDongSignguCd) +
 * 분류체계(lclsSystm1~3)가 최신 필드. 내부 로직은 최신 필드에만 의존.
 */

export interface TourApiHeader {
  /** '0000'이 정상. 그 외 오류 코드(예: '30' 미등록 키, '22' 요청제한 초과). */
  resultCode: string;
  resultMsg: string;
}

/**
 * areaBasedList2 / locationBasedList2 등의 개별 장소 항목.
 * 알려진 필드만 명시, 나머지는 확장 허용.
 */
export interface TourApiPlaceItem {
  /** 콘텐츠 ID. 내부 Place.tourApiContentId(unique)와 매칭. */
  contentid: string;
  /** 콘텐츠 타입 ID(12=관광지, 14=문화시설, 39=음식점 등). */
  contenttypeid: string;
  title: string;
  addr1?: string;
  addr2?: string;
  zipcode?: string;
  /** 경도. 문자열로 옴, 빈 문자열("") 가능. */
  mapx?: string;
  /** 위도. 문자열로 옴, 빈 문자열("") 가능. */
  mapy?: string;
  firstimage?: string;
  firstimage2?: string;
  /** 저작권 유형(Type1: 출처표시-권장, Type3: 제한). */
  cpyrhtDivCd?: string;
  /** 지도 레벨. */
  mlevel?: string;
  tel?: string;
  /** locationBasedList2 응답 전용(중심점으로부터 거리, m). */
  dist?: string;
  createdtime?: string;
  modifiedtime?: string;
  /** searchFestival2 응답 전용. 행사 시작일(YYYYMMDD). */
  eventstartdate?: string;
  /** searchFestival2 응답 전용. 행사 종료일(YYYYMMDD). */
  eventenddate?: string;
  /** 법정동 시도 코드. */
  lDongRegnCd?: string;
  /** 법정동 시군구 코드. */
  lDongSignguCd?: string;
  /** 분류체계 1Depth. */
  lclsSystm1?: string;
  /** 분류체계 2Depth. */
  lclsSystm2?: string;
  /** 분류체계 3Depth. */
  lclsSystm3?: string;
  /**
   * 구 분류코드 3Depth(예: A05020900 카페·찻집). v4.4 요청 파라미터에서는 빠졌지만
   * 응답에는 계속 들어온다. 세부 분류 라벨은 공식 코드표가 있는 이 값을 쓴다.
   */
  cat3?: string;
  [key: string]: unknown;
}

/**
 * detailCommon2 응답의 상세 항목.
 * 기준 관광지의 현재 좌표를 실시간으로 얻는 용도(mapinfoYN=Y).
 */
export interface TourApiDetailItem {
  contentid: string;
  contenttypeid?: string;
  title?: string;
  /** 경도. 문자열로 옴. */
  mapx?: string;
  /** 위도. 문자열로 옴. */
  mapy?: string;
  addr1?: string;
  addr2?: string;
  firstimage?: string;
  firstimage2?: string;
  /** 소개문. HTML 태그·엔티티가 섞여 온다(매퍼에서 정리). */
  overview?: string;
  tel?: string;
  /** 앵커 태그로 감싸져 오는 경우가 있다. */
  homepage?: string;
  [key: string]: unknown;
}

export interface TourApiDetailBody {
  items: { item: TourApiDetailItem | TourApiDetailItem[] } | '';
  numOfRows: number | string;
  pageNo: number | string;
  totalCount: number | string;
}

export interface TourApiDetailResponse {
  response: {
    header: TourApiHeader;
    body: TourApiDetailBody;
  };
}

export interface TourApiListBody {
  /** 결과 없으면 빈 문자열("") 가능. */
  items: { item: TourApiPlaceItem | TourApiPlaceItem[] } | '';
  numOfRows: number | string;
  pageNo: number | string;
  totalCount: number | string;
}

export interface TourApiListResponse {
  response: {
    header: TourApiHeader;
    body: TourApiListBody;
  };
}
