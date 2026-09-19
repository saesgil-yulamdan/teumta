import type { DestinationSearchResult } from '../dtos';
import { ExternalApiError } from '../external/common';
import { fetchPoiSearch, mapPoiSearchToDestinations } from '../external/tmap';
import { fetchTourPlacesByKeyword, mapSearchResultList } from '../external/tour';

/**
 * 목적지 검색 — 실시간, DB 미저장.
 * TourAPI(상세정보 풍부) 우선, 결과 없거나 Tour 장애(타임아웃 등)면 TMAP POI 검색 폴백.
 * 폴백 구조라 검색 1회당 외부 호출 보통 1건, 최대 2건.
 */

const TMAP_SEARCH_COUNT = 10;

export interface SearchDestinationsParams {
  keyword: string;
  pageNo?: number;
  numOfRows?: number;
}

export async function searchDestinations(
  params: SearchDestinationsParams,
): Promise<DestinationSearchResult[]> {
  try {
    const tourResponse = await fetchTourPlacesByKeyword({
      keyword: params.keyword,
      contentTypeId: '12',
      pageNo: params.pageNo,
      numOfRows: params.numOfRows ?? 20,
    });
    const tourResults = mapSearchResultList(tourResponse);
    if (tourResults.length > 0) {
      return tourResults;
    }
  } catch (error) {
    // Tour 타임아웃·장애를 검색 전체 실패로 올리지 않고 TMAP으로 이어간다.
    if (!(error instanceof ExternalApiError)) {
      throw error;
    }
  }

  // TMAP POI는 tourApiContentId 없음 → 내부 Place와 이을 키 없음(placeId는 계속 null)
  const poiResponse = await fetchPoiSearch(params.keyword, {
    count: TMAP_SEARCH_COUNT,
    page: params.pageNo,
  });
  return mapPoiSearchToDestinations(poiResponse);
}
