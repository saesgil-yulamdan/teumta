import { useCallback, useReducer } from 'react';

import { ARRIVAL_RADIUS_METERS } from '@/constants/location';
import type { Coordinate } from '@/types/place';
import { hasArrived } from '@/utils/arrival';
import {
  courseProgressReducer,
  INITIAL_COURSE_PROGRESS,
  type CourseStop,
} from '@/utils/course-progress-state';
import { distanceInMeters } from '@/utils/distance';

export type { CourseStop } from '@/utils/course-progress-state';

/**
 * 도착 반경보다 넉넉히 벗어나야 "체류 끝"으로 본다.
 * 같은 반경을 쓰면 GPS 요동만으로 도착↔이동이 깜빡인다(히스테리시스).
 */
const STAY_LEAVE_RADIUS_METERS = ARRIVAL_RADIUS_METERS * 1.5;

/**
 * 코스 진행 상태(시작/도착/체류/다음/복귀/완료)를 **단말 local state로만** 관리한다.
 *
 * 개인정보 최소화 원칙:
 *  - 진행 상태와 도착 판정을 서버 TripEvent로 전송/저장하지 않는다.
 *  - 현재 위치가 다음 목적지 반경에 들어오면 로컬에서 도착 처리하고 다음 지점으로 넘어간다.
 *  - 서버에는 사용자가 특정 시각 특정 장소에 있었다는 정보가 남지 않는다.
 */
export function useCourseProgress(stops: CourseStop[]) {
  const [state, dispatch] = useReducer(courseProgressReducer, INITIAL_COURSE_PROGRESS);
  const { phase, currentIndex, stayingAt, stayingSince, startedAt, outcomes } = state;

  const nextStop: CourseStop | null = stops[currentIndex] ?? null;

  const start = useCallback(() => dispatch({ type: 'start', at: Date.now() }), []);

  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  /**
   * 다음 정류지를 방문 처리 없이 넘긴다(가게가 닫혀 있는 등).
   * 마지막 지점(복귀)은 건너뛸 수 없다 — 코스를 끝내는 건 "코스 종료"의 몫.
   */
  const skipCurrent = useCallback((outcome: 'skipped' | 'unavailable' = 'skipped') => {
    if (phase !== 'in_progress' || currentIndex >= stops.length - 1 || !nextStop) {
      return;
    }
    dispatch({ type: 'skip', stop: nextStop, outcome });
  }, [phase, currentIndex, stops.length, nextStop]);

  const finishCurrentStay = useCallback(() => dispatch({ type: 'finish_stay' }), []);

  /** foreground GPS 갱신 시 호출. 도착·체류 이탈을 판정한다(전부 로컬). */
  const updateWithLocation = useCallback(
    (current: Coordinate) => {
      if (phase !== 'in_progress') {
        return;
      }
      if (stayingAt) {
        if (distanceInMeters(current, stayingAt) > STAY_LEAVE_RADIUS_METERS) {
          dispatch({ type: 'leave' });
        }
        return;
      }
      if (!nextStop) {
        return;
      }
      if (hasArrived(current, nextStop, ARRIVAL_RADIUS_METERS)) {
        const isFinal = currentIndex + 1 >= stops.length;
        dispatch({ type: 'arrive', stop: nextStop, at: Date.now(), isReturn: isFinal });
      }
    },
    [phase, stayingAt, nextStop, currentIndex, stops.length],
  );

  return {
    phase,
    currentIndex,
    nextStop,
    stayingAt,
    stayingSince,
    startedAt,
    outcomes,
    start,
    reset,
    skipCurrent,
    finishCurrentStay,
    updateWithLocation,
  };
}
