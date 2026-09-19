import { PlaceType } from '@prisma/client';

import type {
  LocalPlaceDetailData,
  NearbyLocalPlaceCandidate,
  NearbyLocalPlaceDto,
} from '../dtos';
import { ExternalApiError } from '../external/common';
import {
  extractPoiBase,
  extractRoutePath,
  extractRouteTotals,
  fetchPedestrianRoute,
  fetchPoiDetail,
} from '../external/tmap';
import {
  extractDetailCoordinate,
  extractDetailItem,
  fetchTourPlaceDetail,
  fetchTourPlaceIntro,
  fetchTourPlacesByLocation,
  mapLocalPlaceDetail,
  mapLocalPlaceIntro,
  mapNearbyCandidateList,
} from '../external/tour';
import { prisma } from '../utils/prisma';
import { TtlCache } from '../utils/ttl-cache';

/**
 * 주변 로컬 장소 실시간 조회(TourAPI + TMAP).
 * 공모전 기준상 관광정보 DB 저장 없음 — prisma는 기준 관광지 읽기(findUnique)에만 사용.
 * 실패 정책은 docs/api-spec.md §3.3b.
 */

export const DEFAULT_RADIUS_METERS = 2000;
export const MAX_RADIUS_METERS = 20_000;
/** TMAP 호출량 제한 — 후보 중 가까운 순 최대 이 개수만 호출. */
export const MAX_TOUR_CANDIDATES = 10;
/** TMAP 동시 호출 제한. */
export const TMAP_CONCURRENCY = 3;

/**
 * 상세 화면과 코스 생성이 같은 목적지를 연달아 조회할 때 보행 경로 실측을 공유한다.
 * 외부 장소 목록은 자주 바뀌지 않지만 운영 중 변경을 빠르게 반영하도록 5분만 보관한다.
 */
export const NEARBY_MEASUREMENT_CACHE_TTL_MS = 5 * 60 * 1000;
const NEARBY_MEASUREMENT_CACHE_MAX_ENTRIES = 500;
const nearbyMeasurementCache = new TtlCache<MeasuredNearbyPlace[]>(
  NEARBY_MEASUREMENT_CACHE_TTL_MS,
  NEARBY_MEASUREMENT_CACHE_MAX_ENTRIES,
);

/** 로컬 장소 후보로 볼 TourAPI contentTypeId. 14=문화시설, 38=쇼핑, 39=음식점. */
const LOCAL_CANDIDATE_CONTENT_TYPE_IDS = ['14', '38', '39'] as const;

/**
 * 세부 분류코드(cat3) → 화면 표시용 라벨.
 *
 * 이름과 거리만으로는 "가볼지" 판단이 안 된다. "음식점"보다 "카페", "쇼핑"보다 "공예·공방"이
 * 훨씬 많은 것을 말해 준다. cat3는 목록 응답에 함께 오므로 추가 호출이 없다.
 *
 * 아래 매핑은 서울 종로·부산 해운대·전주 한옥마을·제주 성산에서 실제 응답을 뽑아 확인한 값이다.
 * 표에 없는 코드는 임의로 라벨을 만들지 않고 대분류로 떨어뜨린다.
 */
const CATEGORY_BY_CAT3: Record<string, string> = {
  // A05 음식
  A05020100: '한식',
  A05020200: '양식',
  A05020300: '일식',
  A05020400: '중식',
  A05020700: '이색음식',
  A05020900: '카페·찻집',
  // A04 쇼핑
  A04010100: '5일장',
  A04010200: '전통시장',
  A04010300: '백화점',
  A04010600: '전문매장·상가',
  A04010700: '공예·공방',
  A04010900: '특산물',
  A04011200: '거리·상권',
  // A02 문화시설
  A02060100: '박물관',
  A02060200: '기념관',
  A02060300: '전시관',
  A02060400: '컨벤션',
  A02060500: '미술관·갤러리',
  A02060600: '공연장',
  A02060700: '문화원',
  A02060900: '도서관',
  A02061000: '서점',
};

/** cat3가 없거나 표에 없을 때 쓰는 대분류. */
const CATEGORY_BY_CONTENT_TYPE_ID: Record<string, string> = {
  '14': '문화시설',
  '38': '쇼핑',
  '39': '음식점',
};

/** 세부 분류 우선, 없으면 대분류, 둘 다 모르면 null(임의 라벨 금지). */
export function resolveCategoryLabel(
  categoryCode: string | null,
  contentTypeId: string | null,
): string | null {
  if (categoryCode && CATEGORY_BY_CAT3[categoryCode]) {
    return CATEGORY_BY_CAT3[categoryCode];
  }
  return contentTypeId ? CATEGORY_BY_CONTENT_TYPE_ID[contentTypeId] ?? null : null;
}

const NUM_OF_ROWS_PER_TYPE = 20;

export type NearbyLocalPlacesResult =
  | { status: 'NOT_FOUND' }
  | { status: 'NOT_TOURIST_SPOT' }
  | { status: 'NO_TOUR_CONTENT_ID' }
  | { status: 'SUCCESS'; places: NearbyLocalPlaceDto[] };

/**
 * 목적지(TourAPI contentId) 기준 주변 로컬 장소 조회. DB 미사용.
 * 상세 조회 실패·좌표 없음 → NOT_FOUND.
 */
export async function getNearbyLocalPlacesByContentId(
  contentId: string,
  radiusMeters: number = DEFAULT_RADIUS_METERS,
): Promise<NearbyLocalPlacesResult> {
  const base = await resolveDestinationByContentId(contentId);
  if (!base) {
    return { status: 'NOT_FOUND' };
  }

  const places = await findNearbyLocalPlaces(base, radiusMeters);
  return { status: 'SUCCESS', places };
}

/**
 * TMAP POI 목적지(poiId) 기준 주변 로컬 장소 조회.
 * 좌표는 서버가 POI 상세로 해석 — API 입력으로 좌표를 받지 않기 위함(docs/location-privacy.md).
 */
export async function getNearbyLocalPlacesByPoiId(
  poiId: string,
  radiusMeters: number = DEFAULT_RADIUS_METERS,
): Promise<NearbyLocalPlacesResult> {
  // TMAP POI 목적지는 contentId 없음 → 자기 자신 제외 키 없음('')
  const base = await resolveDestinationByPoiId(poiId);
  if (!base) {
    return { status: 'NOT_FOUND' };
  }

  const places = await findNearbyLocalPlaces(base, radiusMeters);
  return { status: 'SUCCESS', places };
}

/** 내부 DB 관광지(Place id) 기준 주변 로컬 장소 조회. 기준 확인에만 DB 읽기. */
export async function getNearbyLocalPlacesRealtime(
  touristSpotId: number,
  radiusMeters: number = DEFAULT_RADIUS_METERS,
): Promise<NearbyLocalPlacesResult> {
  const touristSpot = await prisma.place.findUnique({
    where: { id: touristSpotId },
    select: {
      id: true,
      name: true,
      type: true,
      latitude: true,
      longitude: true,
      tourApiContentId: true,
    },
  });

  if (!touristSpot) {
    return { status: 'NOT_FOUND' };
  }
  if (touristSpot.type !== PlaceType.TOURIST_SPOT) {
    return { status: 'NOT_TOURIST_SPOT' };
  }
  if (!touristSpot.tourApiContentId) {
    return { status: 'NO_TOUR_CONTENT_ID' };
  }

  const base = await resolveBaseCoordinate(touristSpot.tourApiContentId, {
    latitude: Number(touristSpot.latitude),
    longitude: Number(touristSpot.longitude),
  });

  const places = await findNearbyLocalPlaces(
    { ...base, name: touristSpot.name, contentId: touristSpot.tourApiContentId },
    radiusMeters,
  );
  return { status: 'SUCCESS', places };
}

/**
 * 로컬 장소 소개 조회(3.3c). 상세 화면에서 1회만 부른다.
 *
 * 목록(3.3b)에는 소개문이 없어 이름·거리만으로 "가볼지"를 판단해야 했다.
 * 목록에 붙이면 항목 수만큼 호출이 늘어 쿼터가 감당되지 않으므로 상세 진입 시에만 조회한다.
 */
export async function getLocalPlaceDetail(
  contentId: string,
): Promise<LocalPlaceDetailData | null> {
  const commonResponse = await fetchTourPlaceDetail(contentId);
  const detail = mapLocalPlaceDetail(commonResponse);
  if (!detail) {
    return null;
  }

  // 운영시간·휴무일은 detailIntro2에만 있고 contentTypeId가 필수 — common 응답에서 얻는다.
  // 상세 진입당 TourAPI 2회(일 1,000 쿼터 안에서 감당). 목록에는 여전히 붙이지 않는다.
  const contentTypeId = extractDetailItem(commonResponse)?.contenttypeid;
  if (!contentTypeId) {
    return detail;
  }
  try {
    const intro = mapLocalPlaceIntro(await fetchTourPlaceIntro(contentId, contentTypeId));
    return { ...detail, ...intro };
  } catch {
    // 운영 정보는 부가 — intro 실패로 소개 전체를 잃지 않는다
    return detail;
  }
}

/** 목적지 기준점. 좌표는 서버가 식별자로 해석한 값(사용자 GPS 아님). */
export interface DestinationBase {
  latitude: number;
  longitude: number;
  name: string;
  /** 후보에서 자기 자신을 빼기 위한 키. TMAP POI 목적지는 ''(제외 없음). */
  contentId: string;
}

/** 후보 + 목적지로부터의 TMAP 실측 거리·시간. 코스 조합용으로 원본 후보 유지. */
export interface MeasuredNearbyPlace {
  candidate: NearbyLocalPlaceCandidate;
  /** TMAP 보행거리(m). 직선거리 아님. */
  distanceMeters: number;
  /** TMAP 보행시간(분, ceil). */
  travelMinutes: number;
  /** 목적지 → 후보 장소의 TMAP 보행 경로 좌표. */
  path: { latitude: number; longitude: number }[];
}

/** 목적지 상세 → 기준점. 좌표 없으면 null. Tour 장애도 null(코스가 504 대신 NOT_FOUND). */
export async function resolveDestinationByContentId(
  contentId: string,
): Promise<DestinationBase | null> {
  let detail;
  try {
    detail = await fetchTourPlaceDetail(contentId);
  } catch (error) {
    if (error instanceof ExternalApiError) {
      return null;
    }
    throw error;
  }
  const coordinate = extractDetailCoordinate(detail);
  if (!coordinate) {
    return null;
  }
  return {
    ...coordinate,
    name: extractDetailItem(detail)?.title ?? '목적지',
    contentId,
  };
}

/** TMAP POI 목적지 해석 — 좌표를 API 입력으로 받지 않기 위한 서버측 처리. */
export async function resolveDestinationByPoiId(poiId: string): Promise<DestinationBase | null> {
  const base = extractPoiBase(await fetchPoiDetail(poiId));
  if (!base) {
    return null;
  }
  return { ...base, contentId: '' };
}

/**
 * 공용 코어: 후보 수집 → 선별 → TMAP 보행거리 측정.
 * 3.3b 응답과 코스 생성이 후보 집합 공유.
 */
export async function measureNearbyLocalPlaces(
  base: DestinationBase,
  radiusMeters: number,
): Promise<MeasuredNearbyPlace[]> {
  const key = measurementCacheKey(base, radiusMeters);
  return nearbyMeasurementCache.getOrCreate(key, () =>
    measureNearbyLocalPlacesUncached(base, radiusMeters),
  );
}

async function measureNearbyLocalPlacesUncached(
  base: DestinationBase,
  radiusMeters: number,
): Promise<MeasuredNearbyPlace[]> {
  const candidates = await fetchNearbyCandidates(base, radiusMeters, base.contentId);
  if (candidates.length === 0) {
    return [];
  }
  const selected = selectClosestCandidates(candidates, base, MAX_TOUR_CANDIDATES);
  return resolveWalkingDistances(base, selected, radiusMeters);
}

function measurementCacheKey(base: DestinationBase, radiusMeters: number): string {
  return [
    base.contentId || 'tmap',
    base.name,
    base.latitude.toFixed(6),
    base.longitude.toFixed(6),
    radiusMeters,
  ].join(':');
}

/** 테스트·운영 진단에서 측정 캐시를 명시적으로 비운다. */
export function clearNearbyMeasurementCache(): void {
  nearbyMeasurementCache.clear();
}

/** 공용 코어 결과를 3.3b 응답 형태로 변환. */
async function findNearbyLocalPlaces(
  base: DestinationBase,
  radiusMeters: number,
): Promise<NearbyLocalPlaceDto[]> {
  const measured = await measureNearbyLocalPlaces(base, radiusMeters);
  return measured.map((entry) =>
    toNearbyLocalPlaceDto(entry.candidate, entry.distanceMeters, entry.travelMinutes),
  );
}

/** 기준 좌표는 detailCommon2 실시간 조회 우선, 실패·누락 시에만 DB 좌표 fallback. */
async function resolveBaseCoordinate(
  tourApiContentId: string,
  fallback: { latitude: number; longitude: number },
): Promise<{ latitude: number; longitude: number }> {
  try {
    const detail = await fetchTourPlaceDetail(tourApiContentId);
    return extractDetailCoordinate(detail) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * contentTypeId별 locationBasedList2 결과 병합(중복·자기 자신 제외).
 * 일부 실패 → 성공분으로 진행, 전부 실패 → 첫 오류 전파.
 */
async function fetchNearbyCandidates(
  base: { latitude: number; longitude: number },
  radiusMeters: number,
  baseContentId: string,
): Promise<NearbyLocalPlaceCandidate[]> {
  const results = await Promise.allSettled(
    LOCAL_CANDIDATE_CONTENT_TYPE_IDS.map((contentTypeId) =>
      fetchTourPlacesByLocation({
        mapX: base.longitude,
        mapY: base.latitude,
        radius: radiusMeters,
        contentTypeId,
        numOfRows: NUM_OF_ROWS_PER_TYPE,
        arrange: 'E',
      }),
    ),
  );

  const fulfilled = results.filter(
    (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchTourPlacesByLocation>>> =>
      result.status === 'fulfilled',
  );
  if (fulfilled.length === 0) {
    const firstRejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    throw firstRejected?.reason ?? new ExternalApiError('tour', 'TourAPI request failed');
  }

  const seen = new Set<string>();
  const candidates: NearbyLocalPlaceCandidate[] = [];
  for (const result of fulfilled) {
    for (const candidate of mapNearbyCandidateList(result.value)) {
      if (candidate.tourApiContentId === baseContentId) {
        continue;
      }
      if (seen.has(candidate.tourApiContentId)) {
        continue;
      }
      seen.add(candidate.tourApiContentId);
      candidates.push(candidate);
    }
  }
  return candidates;
}

/** TMAP 호출량 제한용 선별. dist(없으면 하버사인)는 선별 전용, 응답 미노출. */
export function selectClosestCandidates(
  candidates: NearbyLocalPlaceCandidate[],
  base: { latitude: number; longitude: number },
  limit: number,
): NearbyLocalPlaceCandidate[] {
  return [...candidates]
    .map((candidate) => ({
      candidate,
      screeningDistance:
        candidate.tourDistanceMeters ??
        haversineMeters(base.latitude, base.longitude, candidate.latitude, candidate.longitude),
    }))
    .sort((a, b) => a.screeningDistance - b.screeningDistance)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

/** 후보별 TMAP 보행거리 계산. 일부 실패는 해당 후보 제외, 전부 실패는 오류. */
async function resolveWalkingDistances(
  base: { latitude: number; longitude: number; name: string },
  candidates: NearbyLocalPlaceCandidate[],
  radiusMeters: number,
): Promise<MeasuredNearbyPlace[]> {
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
    throw new ExternalApiError('tmap', 'All TMAP pedestrian route requests failed', {
      code: 'EXTERNAL_API_UNAVAILABLE',
    });
  }

  return succeeded
    .filter((entry) => entry.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/**
 * 응답 DTO 변환.
 *
 * `tourApiContentId`는 상세 소개 조회(3.3c) 키라 노출한다. 공공데이터 식별자이며
 * 검색 응답(3.2)도 같은 값을 이미 내려주고 있다 — 내부 DB id는 여전히 노출하지 않는다.
 */
export function toNearbyLocalPlaceDto(
  candidate: NearbyLocalPlaceCandidate,
  distanceMeters: number,
  travelTimeMinutes: number,
): NearbyLocalPlaceDto {
  return {
    tourApiContentId: candidate.tourApiContentId,
    name: candidate.name,
    address: candidate.address,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    imageUrl: candidate.imageUrl,
    category: resolveCategoryLabel(candidate.categoryCode, candidate.contentTypeId),
    distanceMeters,
    travelTimeMinutes,
  };
}

/** worker 방식 동시 실행 제한. 실패 항목은 null. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
): Promise<(R | null)[]> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await task(items[index]);
      } catch {
        results[index] = null;
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

const EARTH_RADIUS_METERS = 6_371_000;

/** 하버사인 직선거리(m). 선별 전용 — distanceMeters로 노출 금지. */
function haversineMeters(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(latitude2 - latitude1);
  const dLon = toRadians(longitude2 - longitude1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(latitude1)) * Math.cos(toRadians(latitude2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}
