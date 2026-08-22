import type { NearbyLocalPlaceCandidate } from '../dtos';
import {
  extractRoutePath,
  extractRouteTotals,
  fetchPedestrianRoute,
} from '../external/tmap';
import { distanceMeters } from '../utils/geo';
import {
  DEFAULT_RADIUS_METERS,
  TMAP_CONCURRENCY,
  mapWithConcurrency,
  measureNearbyLocalPlaces,
  resolveDestinationByContentId,
  resolveDestinationByPoiId,
  type DestinationBase,
  type MeasuredNearbyPlace,
} from './nearby-local-place.service';
import { measureNearbyFestivals } from './nearby-festival.service';

/**
 * 우회 코스 실시간 생성 — DB 미사용, 전국.
 *
 * 저장형 Route는 내부 Place만 참조 가능 → 적재 지역(종로구)에서만 코스가 나옴.
 * 여기서는 주변 장소 조회(3.3b)가 이미 구한 실측 보행거리를 재활용해 즉석 조합.
 *
 * 구조: 목적지 → 정류지1 … 정류지N → 목적지(복귀).
 * 목적지↔정류지는 실측, 정류지 사이는 추정으로 후보를 좁힌 뒤 반환할 코스만 TMAP 검증(호출량 절약).
 */

/** 앱이 제시하는 선택지. 그 밖의 값도 허용, 범위만 제한. */
export const COURSE_TIME_OPTIONS = [30, 60, 90] as const;
export const MIN_AVAILABLE_MINUTES = 10;
export const MAX_AVAILABLE_MINUTES = 240;

/**
 * 분류별 기본 체류시간(분). 14=문화시설, 38=쇼핑, 39=음식점.
 *
 * ⚠️ 공식 통계 없는 팀 합의값 — 방문 로그 쌓이면 실측으로 보정
 * (docs/congestion-rules.md "장소별 권장 체류시간 기준" 미결정 항목).
 */
export const STAY_MINUTES_BY_CONTENT_TYPE: Record<string, number> = {
  '15': 30,
  '14': 40,
  '38': 30,
  '39': 40,
};
export const DEFAULT_STAY_MINUTES = 30;

/** 최소 체류시간(분). 이 밑으로 줄이면 방문 자체가 무의미(docs/route-data-rules.md §6). */
export const MIN_STAY_MINUTES = 15;

/** 코스당 최대 정류지 수. */
const MAX_STOPS = 3;
/** 후보 상한 — 조합 폭발 방지. 거리순만 쓰지 않고 분류 균형을 맞춰 뽑는다. */
const MAX_CANDIDATE_POOL = 10;
/** 반환 코스 수. */
const MAX_COURSES = 3;
/** TMAP으로 정류지 사이 구간까지 검증할 계획 수. 다양화 이후 탈락 여지를 둔다. */
const MAX_VERIFICATION_PLANS = 8;

/** 보행 속도(m/분), 4km/h 기준 — 정류지 사이 구간 어림용. */
const WALKING_METERS_PER_MINUTE = 67;
/** 직선거리 → 실제 보행거리 보정 계수(골목·횡단보도). */
const DETOUR_FACTOR = 1.3;
const SHORT_WALK_DISTANCE_METERS = 1500;

export interface CourseStop {
  kind: 'LOCAL_PLACE' | 'FESTIVAL';
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  /** 이전 지점(첫 정류지는 목적지)에서 여기까지 보행시간(분). */
  travelMinutesFromPrevious: number;
  /** 이전 지점에서 여기까지 보행거리(m). */
  distanceMetersFromPrevious: number;
  pathFromPrevious: { latitude: number; longitude: number }[] | null;
  stayMinutes: number;
  eventStartDate: string | null;
  eventEndDate: string | null;
}

export interface GeneratedCourse {
  /** 이동 + 체류 + 복귀 합산(분). */
  totalMinutes: number;
  /** 마지막 정류지 → 목적지 복귀 시간(분). */
  returnTravelMinutes: number;
  returnDistanceMeters: number;
  returnPath: { latitude: number; longitude: number }[] | null;
  stops: CourseStop[];
  /** 정류지 사이 구간이 TMAP 실측인지 여부. 정류지 1곳이면 전 구간 실측이라 항상 true. */
  verified: boolean;
  /** 카드 설명용 추천 근거 태그. */
  recommendationTags: string[];
}

export interface CourseGenerationResult {
  destination: { name: string; latitude: number; longitude: number };
  availableMinutes: number;
  courses: GeneratedCourse[];
}

export type CourseGenerationLookup =
  | { status: 'SUCCESS'; result: CourseGenerationResult }
  /** 목적지 식별자 → 좌표 해석 실패. */
  | { status: 'DESTINATION_NOT_FOUND' };

/** 후보의 기본 체류시간. */
export function stayMinutesFor(candidate: NearbyLocalPlaceCandidate): number {
  const contentTypeId = candidate.contentTypeId ?? '';
  return STAY_MINUTES_BY_CONTENT_TYPE[contentTypeId] ?? DEFAULT_STAY_MINUTES;
}

/** 정류지 사이 보행시간 추정(분) — 실측 전 조합 압축용. */
export function estimateWalkMinutes(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const straight = distanceMeters(from, to);
  return Math.max(1, Math.ceil((straight * DETOUR_FACTOR) / WALKING_METERS_PER_MINUTE));
}

/** k개 조합(순서 무관). 방문 순서는 목적지에서 가까운 순. */
function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) {
    return [[]];
  }
  const result: T[][] = [];
  items.forEach((item, index) => {
    for (const rest of combinations(items.slice(index + 1), size - 1)) {
      result.push([item, ...rest]);
    }
  });
  return result;
}

interface CoursePlan {
  stops: MeasuredNearbyPlace[];
  /** 정류지 사이 구간(추정 또는 실측). legs[i] = stops[i] → stops[i+1]. */
  legs: {
    travelMinutes: number;
    distanceMeters: number;
    path: { latitude: number; longitude: number }[] | null;
  }[];
  /** 정류지별 체류시간. 가용 시간에 따라 기본값에서 축소 가능. */
  stayMinutes: number[];
  totalMinutes: number;
  verified: boolean;
}

/** 목적지 → 정류지들 → 목적지 이동시간 합(체류 제외). */
function travelMinutesOf(
  stops: MeasuredNearbyPlace[],
  legs: { travelMinutes: number }[],
): number {
  const outbound = stops[0].travelMinutes;
  // 복귀 구간: 왕복 대칭으로 보고 실측 편도값 재사용
  const inbound = stops[stops.length - 1].travelMinutes;
  const between = legs.reduce((sum, leg) => sum + leg.travelMinutes, 0);
  return outbound + between + inbound;
}

/**
 * 남는 시간에 맞춘 체류시간 결정.
 *
 * 기본값 고정 시 30분 코스가 아예 안 나옴 — 문화시설 40분이라 이동시간만 더해도 초과.
 * 제한시간에 따라 체류시간을 달리 두는 건 route-data-rules §6이 정한 방식.
 * 기본값에서 비율 축소하되 최소 체류시간은 사수, 그래도 안 되면 조합 불가(null).
 */
export function fitStayMinutes(
  stops: MeasuredNearbyPlace[],
  travelMinutes: number,
  availableMinutes: number,
): number[] | null {
  const defaults = stops.map((stop) => stayMinutesFor(stop.candidate));
  const stayBudget = availableMinutes - travelMinutes;

  if (stayBudget < MIN_STAY_MINUTES * stops.length) {
    return null;
  }

  const defaultTotal = defaults.reduce((sum, minutes) => sum + minutes, 0);
  if (defaultTotal <= stayBudget) {
    return defaults;
  }

  const scale = stayBudget / defaultTotal;
  const scaled = defaults.map((minutes) =>
    Math.max(MIN_STAY_MINUTES, Math.floor(minutes * scale)),
  );

  // 최소 체류시간 보정으로 다시 초과 가능
  return scaled.reduce((sum, minutes) => sum + minutes, 0) <= stayBudget ? scaled : null;
}

interface PlanCourseOptions {
  /** 같은 입력도 날짜/요청 맥락에 따라 순위를 조금 바꾸기 위한 안정 seed. */
  diversitySeed?: string;
}

/** 추정값 기준 코스 후보 생성(가용 시간 초과분 제외). */
export function planCourses(
  measured: MeasuredNearbyPlace[],
  availableMinutes: number,
  options: PlanCourseOptions = {},
): CoursePlan[] {
  const seed = options.diversitySeed ?? 'stable';
  const pool = selectBalancedCandidatePool(measured, seed);
  const plans: CoursePlan[] = [];

  for (let size = 1; size <= Math.min(MAX_STOPS, pool.length); size += 1) {
    for (const combo of combinations(pool, size)) {
      // 방문 순서: 목적지에서 가까운 순 — 불필요한 왕복 감소
      const stops = [...combo].sort((a, b) => a.distanceMeters - b.distanceMeters);
      const legs = stops.slice(1).map((stop, index) => {
        // 하버사인은 구간당 1회만 — 시간·거리 추정이 같은 직선거리를 공유한다
        const detourMeters =
          distanceMeters(stops[index].candidate, stop.candidate) * DETOUR_FACTOR;
        return {
          travelMinutes: Math.max(1, Math.ceil(detourMeters / WALKING_METERS_PER_MINUTE)),
          distanceMeters: Math.round(detourMeters),
          path: null,
        };
      });
      const travelMinutes = travelMinutesOf(stops, legs);
      const stayMinutes = fitStayMinutes(stops, travelMinutes, availableMinutes);
      if (stayMinutes === null) {
        continue;
      }

      plans.push({
        stops,
        legs,
        stayMinutes,
        totalMinutes: travelMinutes + stayMinutes.reduce((sum, minutes) => sum + minutes, 0),
        verified: stops.length === 1,
      });
    }
  }

  return rankCourses(plans, availableMinutes, seed);
}

/** 가까운 후보만 고정 선택하지 않도록 분류별 1순위 후보를 먼저 살린다. */
function selectBalancedCandidatePool(
  measured: MeasuredNearbyPlace[],
  seed: string,
): MeasuredNearbyPlace[] {
  const byDistance = [...measured].sort((first, second) => {
    if (first.distanceMeters !== second.distanceMeters) {
      return first.distanceMeters - second.distanceMeters;
    }
    return seededUnit(`${first.candidate.tourApiContentId}:candidate`, seed) -
      seededUnit(`${second.candidate.tourApiContentId}:candidate`, seed);
  });

  const selectedIds = new Set<string>();
  const selected: MeasuredNearbyPlace[] = [];
  const seenCategories = new Set<string>();

  for (const entry of byDistance) {
    const category = courseCategoryKey(entry.candidate);
    if (seenCategories.has(category)) {
      continue;
    }
    seenCategories.add(category);
    selectedIds.add(entry.candidate.tourApiContentId);
    selected.push(entry);
    if (selected.length >= MAX_CANDIDATE_POOL) {
      return selected;
    }
  }

  for (const entry of byDistance) {
    if (selectedIds.has(entry.candidate.tourApiContentId)) {
      continue;
    }
    selected.push(entry);
    if (selected.length >= MAX_CANDIDATE_POOL) {
      break;
    }
  }

  return selected;
}

/**
 * 구성 다양성 우선 → 시간 활용도 → 날짜 기반 미세 변동.
 *
 * 같은 분류만 반복하는 코스(예: 음식점 2곳)는 감점한다. 단, 후보가 그것뿐이면 완전히 제거하지
 * 않고 낮은 순위로 남겨 빈 결과를 피한다.
 */
export function rankCourses(
  plans: CoursePlan[],
  availableMinutes: number,
  diversitySeed = 'stable',
): CoursePlan[] {
  return [...plans].sort((first, second) => {
    const firstScore = courseRankScore(first, availableMinutes, diversitySeed);
    const secondScore = courseRankScore(second, availableMinutes, diversitySeed);
    if (firstScore !== secondScore) {
      return secondScore - firstScore;
    }
    return stableCourseKey(first).localeCompare(stableCourseKey(second));
  });
}

function courseRankScore(
  plan: CoursePlan,
  availableMinutes: number,
  diversitySeed: string,
): number {
  const slack = Math.max(0, availableMinutes - plan.totalMinutes);
  const categories = plan.stops.map((stop) => courseCategoryKey(stop.candidate));
  const uniqueCategoryCount = new Set(categories).size;
  const duplicateCategoryCount = plan.stops.length - uniqueCategoryCount;
  const festivalCount = plan.stops.filter((stop) => stop.candidate.kind === 'FESTIVAL').length;

  return (
    uniqueCategoryCount * 24 +
    plan.stops.length * 6 +
    festivalCount * 4 -
    duplicateCategoryCount * 30 -
    slack * 0.8 +
    seededUnit(stableCourseKey(plan), diversitySeed) * 8
  );
}

function courseCategoryKey(candidate: NearbyLocalPlaceCandidate): string {
  if (candidate.kind === 'FESTIVAL') {
    return 'FESTIVAL';
  }
  return candidate.contentTypeId ?? candidate.categoryCode ?? 'UNKNOWN';
}

function stableCourseKey(plan: CoursePlan): string {
  return plan.stops.map((stop) => stop.candidate.tourApiContentId).sort().join('|');
}

function seededUnit(value: string, seed: string): number {
  let hash = 2166136261;
  const input = `${seed}:${value}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

/** 정류지 사이 구간 TMAP 실측 후 총 시간 재계산. 실패 시 추정값 유지. */
async function verifyPlan(plan: CoursePlan): Promise<CoursePlan> {
  if (plan.legs.length === 0) {
    return plan;
  }

  const measuredLegs = await mapWithConcurrency(
    plan.legs.map((_, index) => index),
    TMAP_CONCURRENCY,
    async (index) => {
      const from = plan.stops[index].candidate;
      const to = plan.stops[index + 1].candidate;
      const route = await fetchPedestrianRoute({
        start: { latitude: from.latitude, longitude: from.longitude },
        end: { latitude: to.latitude, longitude: to.longitude },
        startName: from.name,
        endName: to.name,
      });
      const totals = extractRouteTotals(route);
      return {
        travelMinutes: Math.ceil(totals.totalSeconds / 60),
        distanceMeters: totals.distanceMeters,
        path: extractRoutePath(route),
      };
    },
  );

  const legs = plan.legs.map((leg, index) => measuredLegs[index] ?? leg);
  const verified = measuredLegs.every((leg) => leg !== null);
  const travelMinutes = travelMinutesOf(plan.stops, legs);

  return {
    ...plan,
    legs,
    verified,
    totalMinutes: travelMinutes + plan.stayMinutes.reduce((sum, minutes) => sum + minutes, 0),
  };
}

function toGeneratedCourse(plan: CoursePlan): GeneratedCourse {
  const stops: CourseStop[] = plan.stops.map((stop, index) => ({
    kind: stop.candidate.kind ?? 'LOCAL_PLACE',
    name: stop.candidate.name,
    address: stop.candidate.address,
    latitude: stop.candidate.latitude,
    longitude: stop.candidate.longitude,
    imageUrl: stop.candidate.imageUrl,
    travelMinutesFromPrevious: index === 0 ? stop.travelMinutes : plan.legs[index - 1].travelMinutes,
    distanceMetersFromPrevious:
      index === 0 ? stop.distanceMeters : plan.legs[index - 1].distanceMeters,
    pathFromPrevious: index === 0 ? stop.path : plan.legs[index - 1].path,
    stayMinutes: plan.stayMinutes[index],
    eventStartDate: stop.candidate.eventStartDate ?? null,
    eventEndDate: stop.candidate.eventEndDate ?? null,
  }));

  const last = plan.stops[plan.stops.length - 1];

  return {
    totalMinutes: plan.totalMinutes,
    returnTravelMinutes: last.travelMinutes,
    returnDistanceMeters: last.distanceMeters,
    returnPath: [...last.path].reverse(),
    stops,
    verified: plan.verified,
    recommendationTags: recommendationTagsFor(plan),
  };
}

function recommendationTagsFor(plan: CoursePlan): string[] {
  const tags = ['혼잡 우회'];
  const candidates = plan.stops.map((stop) => stop.candidate);
  const totalWalkingMeters =
    plan.stops.reduce((sum, stop, index) => {
      const distance = index === 0 ? stop.distanceMeters : plan.legs[index - 1].distanceMeters;
      return sum + distance;
    }, 0) + plan.stops[plan.stops.length - 1].distanceMeters;

  if (candidates.some((candidate) => candidate.kind === 'FESTIVAL')) {
    tags.push('행사 포함');
  }
  if (candidates.some((candidate) => candidate.contentTypeId === '39')) {
    tags.push('식사 포함');
  }
  if (totalWalkingMeters <= SHORT_WALK_DISTANCE_METERS) {
    tags.push('짧은 산책');
  }
  if (new Set(candidates.map(courseCategoryKey)).size >= 2) {
    tags.push('구성 다양');
  }

  return tags.slice(0, 4);
}

export interface GenerateCoursesParams {
  contentId?: string;
  poiId?: string;
  availableMinutes: number;
  radiusMeters?: number;
  /** 같은 날짜·목적지·시간 조건에서 다른 추천 조합을 요청하기 위한 클라이언트 variant. */
  variant?: number;
}

/** 목적지 주변에서 가용 시간에 맞는 우회 코스 생성. 저장 없음 — 요청 시점 결과. */
export async function generateCourses(
  params: GenerateCoursesParams,
): Promise<CourseGenerationLookup> {
  const base = await resolveDestination(params);
  if (!base) {
    return { status: 'DESTINATION_NOT_FOUND' };
  }

  const localMeasured = await measureNearbyLocalPlaces(
    base,
    params.radiusMeters ?? DEFAULT_RADIUS_METERS,
  );
  const festivalMeasured = await measureNearbyFestivals(
    base,
    params.radiusMeters ?? DEFAULT_RADIUS_METERS,
  ).catch(() => []);
  const measured = [...localMeasured, ...festivalMeasured];

  const diversitySeed = buildDailyDiversitySeed(base, params);
  const planned = planCourses(measured, params.availableMinutes, { diversitySeed });
  const verified = await Promise.all(planned.slice(0, MAX_VERIFICATION_PLANS).map(verifyPlan));

  // 실측 후 초과한 코스 제외 — 약속한 시간 안에 복귀 불가
  const courses = rankCourses(
    verified.filter((plan) => plan.totalMinutes <= params.availableMinutes),
    params.availableMinutes,
    diversitySeed,
  )
    .slice(0, MAX_COURSES)
    .map(toGeneratedCourse);

  return {
    status: 'SUCCESS',
    result: {
      destination: { name: base.name, latitude: base.latitude, longitude: base.longitude },
      availableMinutes: params.availableMinutes,
      courses,
    },
  };
}

function buildDailyDiversitySeed(
  base: DestinationBase,
  params: GenerateCoursesParams,
): string {
  const destinationKey = params.contentId ?? params.poiId ?? base.contentId;
  return `${todayKstYmd()}:${destinationKey}:${params.availableMinutes}:${params.variant ?? 0}`;
}

function todayKstYmd(): string {
  const now = new Date();
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function resolveDestination(
  params: GenerateCoursesParams,
): Promise<DestinationBase | null> {
  if (params.contentId) {
    return resolveDestinationByContentId(params.contentId);
  }
  if (params.poiId) {
    return resolveDestinationByPoiId(params.poiId);
  }
  return null;
}
