import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearCourseRequestCache, fetchCourseAlternatives, fetchCourses } from './courses';
import { COURSE_API_TIMEOUT_MS } from './client';

const getMock = vi.hoisted(() => vi.fn());

vi.mock('./client', () => ({
  apiClient: { get: getMock },
  COURSE_API_TIMEOUT_MS: 30_000,
}));

const result = {
  destination: { name: '경복궁', latitude: 37.5796, longitude: 126.977 },
  availableMinutes: 60,
  courses: [],
};

beforeEach(() => {
  clearCourseRequestCache();
  getMock.mockReset();
  getMock.mockResolvedValue({ data: { data: result } });
});

describe('fetchCourses', () => {
  it('같은 조건의 동시 요청을 한 번의 네트워크 호출로 합친다', async () => {
    const requests = [
      fetchCourses({ contentId: '126508' }, 60),
      fetchCourses({ contentId: '126508' }, 60),
    ];

    await expect(Promise.all(requests)).resolves.toEqual([result, result]);
    expect(getMock).toHaveBeenCalledOnce();
  });

  it('짧은 시간 안의 동일 요청은 캐시 결과를 사용한다', async () => {
    await fetchCourses({ contentId: '126508' }, 60);
    await fetchCourses({ contentId: '126508' }, 60);

    expect(getMock).toHaveBeenCalledOnce();
  });

  it('시간이나 추천 variant가 바뀌면 새로 요청한다', async () => {
    await fetchCourses({ contentId: '126508' }, 60, 0);
    await fetchCourses({ contentId: '126508' }, 90, 0);
    await fetchCourses({ contentId: '126508' }, 90, 1);

    expect(getMock).toHaveBeenCalledTimes(3);
  });

  it('코스 생성과 대체 코스에만 긴 타임아웃을 적용한다', async () => {
    await fetchCourses({ contentId: '126508' }, 60);
    expect(getMock).toHaveBeenLastCalledWith('/courses', expect.objectContaining({
      timeout: COURSE_API_TIMEOUT_MS,
    }));

    getMock.mockResolvedValueOnce({ data: { data: { alternatives: [] } } });
    await fetchCourseAlternatives({
      originContentId: '100',
      destination: { contentId: '126508' },
      availableMinutes: 30,
      excludeContentIds: [],
    });
    expect(getMock).toHaveBeenLastCalledWith('/course-alternatives', expect.objectContaining({
      timeout: COURSE_API_TIMEOUT_MS,
    }));
  });
});
