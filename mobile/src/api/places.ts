import { apiClient } from './client';
import type {
  ConcentrationForecast,
  LocalPlaceDetail,
  NearbyLocalPlaceResult,
  Place,
  RealtimeCongestion,
  SearchPlaceResult,
} from '@/types/place';

export async function getPlaces(): Promise<Place[]> {
  const response = await apiClient.get<{ data: Place[] }>('/places');
  return response.data.data;
}

export async function searchPlaces(keyword: string, pageNo = 1): Promise<SearchPlaceResult[]> {
  const response = await apiClient.get<{ data: SearchPlaceResult[] }>('/search/places', {
    params: { keyword, pageNo },
  });
  return response.data.data;
}

/**
 * GET /api/congestion — 목적지의 실시간 혼잡도.
 * TMAP 목적지는 poiId, TourAPI 목적지는 contentId를 쓴다(서버가 TMAP POI로 매칭해 조회).
 * SK가 다루지 않는 장소는 404 CONGESTION_DATA_NOT_FOUND.
 */
export async function getRealtimeCongestion(
  identifier: { poiId: string } | { contentId: string },
): Promise<RealtimeCongestion> {
  const response = await apiClient.get<{ data: RealtimeCongestion }>('/congestion', {
    params: identifier,
  });
  return response.data.data;
}

/**
 * GET /api/concentration-forecast — 향후 30일 날짜별 집중률 예측(전국).
 * 실시간 혼잡도가 아니라 "이 날 붐빌지"를 보는 값이다. 데이터가 없으면 404.
 */
export async function getConcentrationForecast(
  contentId: string,
): Promise<ConcentrationForecast> {
  const response = await apiClient.get<{ data: ConcentrationForecast }>(
    '/concentration-forecast',
    { params: { contentId } },
  );
  return response.data.data;
}

/**
 * GET /api/local-places/detail — 로컬 장소 소개(TourAPI detailCommon2).
 *
 * 상세 화면 진입 시 1회만 부른다. 목록 화면에서 항목마다 부르면 외부 API 쿼터가 감당되지 않는다.
 */
export async function getLocalPlaceDetail(contentId: string): Promise<LocalPlaceDetail> {
  const response = await apiClient.get<{ data: LocalPlaceDetail }>('/local-places/detail', {
    params: { contentId },
  });
  return response.data.data;
}

/** contentId(TOUR)/poiId(TMAP) 중 정확히 하나로 주변 로컬 장소를 조회한다. */
export async function getNearbyLocalPlaces(
  identifier: { contentId: string } | { poiId: string },
  radius = 2000,
): Promise<NearbyLocalPlaceResult[]> {
  const response = await apiClient.get<{ data: NearbyLocalPlaceResult[] }>('/local-places', {
    params: { ...identifier, radius },
  });
  return response.data.data;
}

/** GET /api/festivals/nearby — 목적지 주변 진행 중/예정 행사·축제. */
export async function getNearbyFestivals(
  identifier: { contentId: string } | { poiId: string },
  radius = 5000,
): Promise<NearbyLocalPlaceResult[]> {
  const response = await apiClient.get<{ data: NearbyLocalPlaceResult[] }>(
    '/festivals/nearby',
    {
      params: { ...identifier, radius },
    },
  );
  return response.data.data;
}
