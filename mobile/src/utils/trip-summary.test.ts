import { describe, expect, it } from 'vitest';

import type { SelectedCourse } from '@/stores/selected-course';
import { INITIAL_COURSE_PROGRESS, type ProgressState } from '@/utils/course-progress-state';
import { courseProgressStops, parseTripProgress, summarizeJourneyRecord, summarizeTrip } from './trip-summary';

const selected: SelectedCourse = {
  destination: { name: '출발지', latitude: 37.5, longitude: 127 },
  destinationParams: { contentId: '1' }, availableMinutes: 60,
  course: {
    totalMinutes: 45, returnTravelMinutes: 5, returnDistanceMeters: 300, verified: true,
    stops: ['시장', '공원'].map((name, index) => ({
      name, tourApiContentId: String(index), address: null, imageUrl: null,
      latitude: 37.5, longitude: 127, travelMinutesFromPrevious: 5,
      distanceMetersFromPrevious: 300, stayMinutes: 15,
    })),
  },
};
const stops = courseProgressStops(selected);
const started: ProgressState = { ...INITIAL_COURSE_PROGRESS, phase: 'in_progress', startedAt: 1_000 };

describe('trip summary', () => {
  it('아직 출발하지 않은 코스에는 복귀 시각을 만들지 않는다', () => {
    expect(summarizeTrip(selected, null)).toMatchObject({ inProgress: false, nextPlace: '시장', plannedReturnAt: null, visited: 0 });
  });
  it('체류 중에는 머무는 곳과 실제 다음 장소를 구분한다', () => {
    const result = summarizeTrip(selected, { ...started, stayingAt: stops[0], stayingSince: 2_000 });
    expect(result).toMatchObject({ currentPlace: '시장', nextPlace: '공원', plannedReturnAt: 2_701_000, visited: 0 });
  });
  it('건너뛴 장소를 방문 완료로 세지 않고 마지막에는 복귀 장소를 보여준다', () => {
    expect(summarizeTrip(selected, { ...started, currentIndex: 2, outcomes: { 'stop-0': 'visited', 'stop-1': 'unavailable' } }))
      .toMatchObject({ visited: 1, skipped: 1, total: 2, returning: true, nextPlace: '출발지' });
  });
  it('같은 코스의 저장된 진행 상태를 복원한다', () => {
    expect(parseTripProgress(JSON.stringify({ key: 'course', state: started }), 'course', stops)).toEqual(started);
  });
  it('다른 코스의 진행률이나 손상된 저장값을 사용하지 않는다', () => {
    expect(parseTripProgress(JSON.stringify({ key: 'other', state: started }), 'course', stops)).toBeNull();
    for (const raw of [null, '', '{', 'null', '[]', '{}']) expect(parseTripProgress(raw, 'course', stops)).toBeNull();
    for (const state of [
      { ...started, currentIndex: -1 }, { ...started, currentIndex: 4 },
      { ...started, startedAt: null }, { ...started, startedAt: 'invalid' },
      { ...started, stayingAt: stops[1], stayingSince: 2_000 },
      { ...started, outcomes: { 'stop-0': 'unknown' } },
      { ...started, outcomes: { 'other-course-stop': 'visited' } },
    ]) expect(parseTripProgress(JSON.stringify({ key: 'course', state }), 'course', stops)).toBeNull();
  });

  it('여행 기록 카드용 방문·경과·커버 이미지를 요약한다', () => {
    expect(
      summarizeJourneyRecord({
        selected,
        startedAt: 1_000,
        endedAt: 1_000 + 40 * 60_000,
        status: 'completed',
        completedAll: false,
        outcomes: { 'stop-0': 'visited', 'stop-1': 'skipped' },
      }),
    ).toMatchObject({
      visited: 1,
      skipped: 1,
      total: 2,
      elapsedMinutes: 40,
      statusLabel: '복귀 완료',
      coverImageUrl: null,
    });
  });
});
