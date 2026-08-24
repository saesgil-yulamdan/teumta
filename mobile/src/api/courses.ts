import { apiClient } from './client';
import type { CourseGenerationResult, DestinationIdentifier } from '@/types/course';

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
  const response = await apiClient.get<{ data: CourseGenerationResult }>('/courses', {
    params: { ...identifier, availableMinutes, variant },
  });
  return response.data.data;
}
