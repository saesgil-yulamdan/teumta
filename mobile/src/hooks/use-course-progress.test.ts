import { describe, expect, it } from 'vitest';

import { courseProgressReducer, type CourseStop } from '@/utils/course-progress-state';

const stop: CourseStop = {
  id: 'stop-1',
  name: '통인시장',
  latitude: 37.58,
  longitude: 126.97,
};

const initial = {
  phase: 'not_started' as const,
  currentIndex: 0,
  stayingAt: null,
  stayingSince: null,
  startedAt: null,
  outcomes: {},
};

describe('courseProgressReducer', () => {
  it('도착해 머무는 동안은 다음 정류지로 넘기지 않는다', () => {
    const started = courseProgressReducer(initial, { type: 'start', at: 100 });
    const arrived = courseProgressReducer(started, {
      type: 'arrive',
      stop,
      at: 200,
      isReturn: false,
    });

    expect(arrived.currentIndex).toBe(0);
    expect(arrived.stayingAt).toEqual(stop);
    expect(arrived.stayingSince).toBe(200);
  });

  it('도착 후 이용 불가로 건너뛰어도 올바른 현재 정류지를 처리한다', () => {
    const started = courseProgressReducer(initial, { type: 'start', at: 100 });
    const arrived = courseProgressReducer(started, {
      type: 'arrive',
      stop,
      at: 200,
      isReturn: false,
    });
    const skipped = courseProgressReducer(arrived, {
      type: 'skip',
      stop,
      outcome: 'unavailable',
    });

    expect(skipped.currentIndex).toBe(1);
    expect(skipped.stayingAt).toBeNull();
    expect(skipped.outcomes).toEqual({ 'stop-1': 'unavailable' });
  });

  it('체류 종료는 방문 완료로 기록한다', () => {
    const staying = {
      ...initial,
      phase: 'in_progress' as const,
      stayingAt: stop,
      stayingSince: 200,
    };
    const left = courseProgressReducer(staying, { type: 'finish_stay' });

    expect(left.currentIndex).toBe(1);
    expect(left.outcomes).toEqual({ 'stop-1': 'visited' });
  });

  it('마지막 복귀 지점 도착은 체류 없이 코스를 완료한다', () => {
    const started = {
      ...initial,
      phase: 'in_progress' as const,
      currentIndex: 1,
      startedAt: 100,
    };
    const returned = courseProgressReducer(started, {
      type: 'arrive',
      stop: { ...stop, id: 'return' },
      at: 300,
      isReturn: true,
    });

    expect(returned.phase).toBe('completed');
    expect(returned.currentIndex).toBe(2);
    expect(returned.stayingAt).toBeNull();
  });
});
