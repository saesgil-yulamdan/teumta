import { apiClient } from './client';
import type {
  CourseAlternativesResult,
  CourseGenerationResult,
  DestinationIdentifier,
} from '@/types/course';

const COURSE_CACHE_TTL_MS = 30 * 1000;
const COURSE_CACHE_MAX_ENTRIES = 40;

type CourseCacheEntry = {
  expiresAt: number;
  value: CourseGenerationResult;
};

const courseCache = new Map<string, CourseCacheEntry>();
const courseRequests = new Map<string, Promise<CourseGenerationResult>>();

function courseRequestKey(
  identifier: DestinationIdentifier,
  availableMinutes: number,
  variant: number,
): string {
  const destination = 'contentId' in identifier
    ? `content:${identifier.contentId}`
    : `poi:${identifier.poiId}`;
  return `${destination}:${availableMinutes}:${variant}`;
}

function cacheCourse(key: string, value: CourseGenerationResult): void {
  if (!courseCache.has(key) && courseCache.size >= COURSE_CACHE_MAX_ENTRIES) {
    const oldestKey = courseCache.keys().next().value;
    if (oldestKey !== undefined) {
      courseCache.delete(oldestKey);
    }
  }
  courseCache.delete(key);
  courseCache.set(key, { expiresAt: Date.now() + COURSE_CACHE_TTL_MS, value });
}

/**
 * GET /api/courses — 목적지 주변에서 가용 시간에 맞는 우회 코스를 실시간 생성한다.
 *
 * 서버가 TMAP 보행 경로를 여러 번 호출하므로 응답에 1초 안팎이 걸리고 외부 API 쿼터를 쓴다.
 * 화면에서 자동으로 반복 호출하지 말고, 사용자가 시간을 고를 때만 요청한다.
 */
export async function fetchCourses(
  identifier: DestinationIdentifier,
  availableMinutes: number,
  variant = 0,
): Promise<CourseGenerationResult> {
  const key = courseRequestKey(identifier, availableMinutes, variant);
  const cached = courseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  if (cached) {
    courseCache.delete(key);
  }

  const pending = courseRequests.get(key);
  if (pending) {
    return pending;
  }

  const request = apiClient
    .get<{ data: CourseGenerationResult }>('/courses', {
      params: { ...identifier, availableMinutes, variant },
    })
    .then((response) => {
      cacheCourse(key, response.data.data);
      return response.data.data;
    })
    .finally(() => {
      if (courseRequests.get(key) === request) {
        courseRequests.delete(key);
      }
    });
  courseRequests.set(key, request);
  return request;
}

/** 테스트와 명시적인 앱 데이터 초기화에서만 사용한다. */
export function clearCourseRequestCache(): void {
  courseCache.clear();
  courseRequests.clear();
}

/**
 * 도착한 정류지의 공개 좌표를 기준으로 대체 장소 → 원 목적지 복귀 코스를 계산한다.
 * 사용자 현재 위치는 보내지 않는다.
 */
export async function fetchCourseAlternatives(input: {
  originContentId: string;
  destination: DestinationIdentifier;
  availableMinutes: number;
  excludeContentIds: string[];
}): Promise<CourseAlternativesResult> {
  const response = await apiClient.get<{ data: CourseAlternativesResult }>(
    '/course-alternatives',
    {
      params: {
        originContentId: input.originContentId,
        ...input.destination,
        availableMinutes: input.availableMinutes,
        excludeContentIds: input.excludeContentIds.join(','),
      },
    },
  );
  return response.data.data;
}
