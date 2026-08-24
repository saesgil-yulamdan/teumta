import type { NearbyLocalPlaceCandidate, NearbyLocalPlaceDto } from '../dtos';
import { ExternalApiError } from '../external/common';
import { extractRoutePath, extractRouteTotals, fetchPedestrianRoute } from '../external/tmap';
import {
  extractDetailItem,
  fetchTourFestivals,
  fetchTourPlaceDetail,
  mapFestivalCandidateList,
  type TourApiListResponse,
  type TourFestivalSearchParams,
} from '../external/tour';
import { TtlCache } from '../utils/ttl-cache';
import {
  DEFAULT_RADIUS_METERS,
  TMAP_CONCURRENCY,
  mapWithConcurrency,
  resolveDestinationByContentId,
  resolveDestinationByPoiId,
  selectClosestCandidates,
  type DestinationBase,
  type MeasuredNearbyPlace,
} from './nearby-local-place.service';

/**
 * 목적지 주변 행사·축제 조회(TourAPI searchFestival2 + TMAP).
 *
 * 행사 정보는 DB에 저장하지 않는다. 목적지 식별자(contentId|poiId)를 서버에서 좌표로 해석하고,
 * 행사 좌표가 있는 항목만 거리 계산에 사용한다. 진행 중인 행사를 놓치지 않도록 과거 60일~향후
 * 90일 창을 조회한 뒤 종료일이 오늘 이후인 항목만 남긴다.
 */

export const DEFAULT_FESTIVAL_RADIUS_METERS = DEFAULT_RADIUS_METERS;
export const MAX_FESTIVAL_RADIUS_METERS = 20_000;
const FESTIVAL_LOOKBACK_DAYS = 60;
const FESTIVAL_LOOKAHEAD_DAYS = 90;
const FESTIVAL_NUM_OF_ROWS = 100;
const FESTIVAL_MAX_PAGES = 3;
const FESTIVAL_CANDIDATE_LIMIT = 6;
const FESTIVAL_CACHE_TTL_MS = 15 * 60 * 1000;
const FESTIVAL_CACHE_MAX_ENTRIES = 300;

const festivalCache = new TtlCache<NearbyFestivalsResult>(
  FESTIVAL_CACHE_TTL_MS,
  FESTIVAL_CACHE_MAX_ENTRIES,
);

export type NearbyFestivalsResult =
  | { status: 'NOT_FOUND' }
  | { status: 'SUCCESS'; festivals: NearbyLocalPlaceDto[] };

export async function getNearbyFestivalsByContentId(
  contentId: string,
  radiusMeters: number = DEFAULT_FESTIVAL_RADIUS_METERS,
): Promise<NearbyFestivalsResult> {
  const key = `content:${contentId}:${radiusMeters}:${todayKstYmd()}`;
  return festivalCache.getOrCreate(key, async () => {
    const base = await resolveDestinationByContentId(contentId);
    if (!base) {
      return { status: 'NOT_FOUND' as const };
    }
    const candidates = await fetchNearbyFestivalCandidates(base, radiusMeters, contentId);
    const measured = await measureFestivalCandidates(base, candidates, radiusMeters);
    return { status: 'SUCCESS' as const, festivals: measured.map(toFestivalDto) };
  });
}

export async function getNearbyFestivalsByPoiId(
  poiId: string,
  radiusMeters: number = DEFAULT_FESTIVAL_RADIUS_METERS,
): Promise<NearbyFestivalsResult> {
  const key = `poi:${poiId}:${radiusMeters}:${todayKstYmd()}`;
  return festivalCache.getOrCreate(key, async () => {
    const base = await resolveDestinationByPoiId(poiId);
    if (!base) {
      return { status: 'NOT_FOUND' as const };
    }
    const candidates = await fetchNearbyFestivalCandidates(base, radiusMeters, '');
    const measured = await measureFestivalCandidates(base, candidates, radiusMeters);
    return { status: 'SUCCESS' as const, festivals: measured.map(toFestivalDto) };
  });
}

/** 코스 생성용: 행사 후보를 목적지→행사 TMAP 실측값까지 포함해 반환한다. */
export async function measureNearbyFestivals(
  base: DestinationBase,
  radiusMeters: number,
): Promise<MeasuredNearbyPlace[]> {
  const candidates = await fetchNearbyFestivalCandidates(base, radiusMeters, base.contentId);
  return measureFestivalCandidates(base, candidates, radiusMeters);
}

async function fetchNearbyFestivalCandidates(
  base: DestinationBase,
  radiusMeters: number,
  baseContentId: string,
): Promise<NearbyLocalPlaceCandidate[]> {
  const today = todayKstYmd();
  const params: TourFestivalSearchParams = {
    eventStartDate: addDaysKstYmd(today, -FESTIVAL_LOOKBACK_DAYS),
    eventEndDate: addDaysKstYmd(today, FESTIVAL_LOOKAHEAD_DAYS),
    ...(await regionParams(base.contentId)),
    numOfRows: FESTIVAL_NUM_OF_ROWS,
    arrange: 'D',
  };
  const responses = await fetchFestivalPagesWithRegionFallback(params);

  const seen = new Set<string>();
  const candidates = responses
    .flatMap(mapFestivalCandidateList)
    .filter((candidate) => candidate.tourApiContentId !== baseContentId)
    .filter((candidate) => (candidate.eventEndDate ?? '') >= today)
    .filter((candidate) => {
      if (seen.has(candidate.tourApiContentId)) {
        return false;
      }
      seen.add(candidate.tourApiContentId);
      return true;
    })
    .map((candidate) => ({
      ...candidate,
      tourDistanceMeters: straightDistanceMeters(base, candidate),
    }))
    .filter((candidate) => (candidate.tourDistanceMeters ?? Number.POSITIVE_INFINITY) <= radiusMeters);

  return selectClosestCandidates(candidates, base, FESTIVAL_CANDIDATE_LIMIT);
}

async function fetchFestivalPagesWithRegionFallback(
  params: TourFestivalSearchParams,
): Promise<TourApiListResponse[]> {
  const hasRegion = params.lDongRegnCd !== undefined || params.lDongSignguCd !== undefined;
  try {
    return await fetchFestivalPages(params);
  } catch (error) {
    if (!hasRegion) {
      throw error;
    }
    const { lDongRegnCd, lDongSignguCd, ...withoutRegion } = params;
    return fetchFestivalPages(withoutRegion);
  }
}

async function fetchFestivalPages(
  params: TourFestivalSearchParams,
): Promise<TourApiListResponse[]> {
  const first = await fetchTourFestivals({ ...params, pageNo: 1 });
  const totalCount = numericBodyValue(first.response.body.totalCount);
  const numOfRows =
    numericBodyValue(first.response.body.numOfRows) || params.numOfRows || FESTIVAL_NUM_OF_ROWS;
  const totalPages =
    totalCount > 0 && numOfRows > 0 ? Math.ceil(totalCount / numOfRows) : 1;
  const pageCount = Math.min(FESTIVAL_MAX_PAGES, Math.max(1, totalPages));

  if (pageCount === 1) {
    return [first];
  }

  const rest = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) =>
      fetchTourFestivals({ ...params, pageNo: index + 2 }),
    ),
  );
  return [first, ...rest];
}

async function regionParams(contentId: string): Promise<{
  lDongRegnCd?: string;
  lDongSignguCd?: string;
}> {
  if (!contentId) {
    return {};
  }
  try {
    const item = extractDetailItem(await fetchTourPlaceDetail(contentId));
    const lDongRegnCd = String(item?.lDongRegnCd ?? '').trim();
    const lDongSignguCd = String(item?.lDongSignguCd ?? '').trim();
    return {
      ...(lDongRegnCd ? { lDongRegnCd } : {}),
      ...(lDongSignguCd ? { lDongSignguCd } : {}),
    };
  } catch {
    return {};
  }
}

async function measureFestivalCandidates(
  base: DestinationBase,
  candidates: NearbyLocalPlaceCandidate[],
  radiusMeters: number,
): Promise<MeasuredNearbyPlace[]> {
  if (candidates.length === 0) {
    return [];
  }

  const settled = await mapWithConcurrency(candidates, TMAP_CONCURRENCY, async (candidate) => {
    const route = await fetchPedestrianRoute({
      start: { latitude: base.latitude, longitude: base.longitude },
      end: { latitude: candidate.latitude, longitude: candidate.longitude },
      startName: base.name,
      endName: candidate.name,
    });
    const { distanceMeters, totalSeconds } = extractRouteTotals(route);
    return {
      candidate,
      distanceMeters,
      travelMinutes: Math.ceil(totalSeconds / 60),
      path: extractRoutePath(route),
    };
  });

  const succeeded = settled.filter((entry): entry is MeasuredNearbyPlace => entry !== null);
  if (succeeded.length === 0 && candidates.length > 0) {
    throw new ExternalApiError('tmap', 'All TMAP festival route requests failed', {
      code: 'EXTERNAL_API_UNAVAILABLE',
    });
  }

  return succeeded
    .filter((entry) => entry.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

function toFestivalDto(entry: MeasuredNearbyPlace): NearbyLocalPlaceDto {
  const { candidate } = entry;
  return {
    kind: 'FESTIVAL',
    tourApiContentId: candidate.tourApiContentId,
    name: candidate.name,
    address: candidate.address,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    imageUrl: candidate.imageUrl,
    category: '행사·축제',
    distanceMeters: entry.distanceMeters,
    travelTimeMinutes: entry.travelMinutes,
    eventStartDate: candidate.eventStartDate ?? null,
    eventEndDate: candidate.eventEndDate ?? null,
  };
}

function todayKstYmd(): string {
  const now = new Date();
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
}

function addDaysKstYmd(ymd: string, days: number): string {
  const date = new Date(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T00:00:00+09:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
}

function numericBodyValue(value: number | string): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

const EARTH_RADIUS_METERS = 6_371_000;

function straightDistanceMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(second.latitude - first.latitude);
  const dLon = toRadians(second.longitude - first.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(first.latitude)) *
      Math.cos(toRadians(second.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return Math.round(EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}
