import { describe, expect, it } from 'vitest';

import type { GeneratedCourse } from '@/types/course';

import {
  courseReturningAfterCurrent,
  courseWithAlternative,
  remainingDeadlineMinutes,
  remainingTripMinutes,
} from './trip-plan';

const course: GeneratedCourse = {
  totalMinutes: 55,
  returnTravelMinutes: 5,
  returnDistanceMeters: 300,
  verified: true,
  stops: [
    {
      name: '첫 장소',
      address: null,
      latitude: 37.5,
      longitude: 127,
      imageUrl: null,
      travelMinutesFromPrevious: 5,
      distanceMetersFromPrevious: 300,
      stayMinutes: 20,
    },
    {
      name: '둘째 장소',
      address: null,
      latitude: 37.51,
      longitude: 127.01,
      imageUrl: null,
      travelMinutesFromPrevious: 10,
      distanceMetersFromPrevious: 600,
      stayMinutes: 15,
    },
  ],
};

describe('remainingTripMinutes', () => {
  it('현재 위치로 계산한 이동시간과 이후 일정으로 복귀시간을 갱신한다', () => {
    expect(
      remainingTripMinutes({
        course,
        currentIndex: 0,
        stayingSince: null,
        now: 0,
        currentWalkMinutes: 3,
      }),
    ).toBe(53);
  });

  it('체류 중에는 실제 경과시간만큼 남은 체류시간을 줄인다', () => {
    expect(
      remainingTripMinutes({
        course,
        currentIndex: 0,
        stayingSince: 0,
        now: 7 * 60_000,
        currentWalkMinutes: 0,
      }),
    ).toBe(43);
  });

  it('모든 정류지를 지나면 현재 위치 기준 복귀 이동만 남긴다', () => {
    expect(
      remainingTripMinutes({
        course,
        currentIndex: 2,
        stayingSince: null,
        now: 0,
        currentWalkMinutes: 2,
      }),
    ).toBe(2);
  });
});

it('선택한 최대 시간의 남은 여유를 실제 경과 기준으로 계산한다', () => {
  expect(remainingDeadlineMinutes(0, 60, 17 * 60_000)).toBe(43);
});

it('승인된 대체 장소로 현재 이후 일정과 복귀 구간을 교체한다', () => {
  const alternative: GeneratedCourse = {
    totalMinutes: 30,
    returnTravelMinutes: 6,
    returnDistanceMeters: 400,
    verified: true,
    stops: [{ ...course.stops[0], name: '대체 장소', travelMinutesFromPrevious: 4 }],
  };
  const replanned = courseWithAlternative(course, 0, alternative);

  expect(replanned.stops.map((stop) => stop.name)).toEqual(['첫 장소', '대체 장소']);
  expect(replanned.returnTravelMinutes).toBe(6);
});

it('바로 복귀를 승인하면 현재 장소 뒤의 정류지를 제거한다', () => {
  const returning = courseReturningAfterCurrent(course, 0, {
    minutes: 8,
    distanceMeters: 500,
  });

  expect(returning.stops.map((stop) => stop.name)).toEqual(['첫 장소']);
  expect(returning.returnTravelMinutes).toBe(8);
  expect(returning.returnPath).toBeNull();
  expect(returning.verified).toBe(false);
});
