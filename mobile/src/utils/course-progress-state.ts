import type { Coordinate } from '@/types/place';

export type CourseStop = Coordinate & { id: string; name: string };
export type ProgressPhase = 'not_started' | 'in_progress' | 'completed';
export type StopOutcome = 'visited' | 'skipped' | 'unavailable';

export type ProgressState = {
  phase: ProgressPhase;
  currentIndex: number;
  stayingAt: CourseStop | null;
  stayingSince: number | null;
  startedAt: number | null;
  outcomes: Record<string, StopOutcome>;
};

export type ProgressAction =
  | { type: 'start'; at: number }
  | { type: 'reset' }
  | { type: 'arrive'; stop: CourseStop; at: number; isReturn: boolean }
  | { type: 'leave' }
  | { type: 'skip'; stop: CourseStop; outcome: 'skipped' | 'unavailable' }
  | { type: 'finish_stay' };

export const INITIAL_COURSE_PROGRESS: ProgressState = {
  phase: 'not_started',
  currentIndex: 0,
  stayingAt: null,
  stayingSince: null,
  startedAt: null,
  outcomes: {},
};

export function courseProgressReducer(
  state: ProgressState,
  action: ProgressAction,
): ProgressState {
  switch (action.type) {
    case 'start':
      return state.phase === 'not_started'
        ? { ...state, phase: 'in_progress', startedAt: action.at }
        : state;
    case 'reset':
      return INITIAL_COURSE_PROGRESS;
    case 'arrive':
      if (state.phase !== 'in_progress' || state.stayingAt) {
        return state;
      }
      if (action.isReturn) {
        return {
          ...state,
          phase: 'completed',
          currentIndex: state.currentIndex + 1,
          stayingAt: null,
          stayingSince: null,
        };
      }
      return { ...state, stayingAt: action.stop, stayingSince: action.at };
    case 'leave':
    case 'finish_stay':
      if (state.phase !== 'in_progress' || !state.stayingAt) {
        return state;
      }
      return {
        ...state,
        currentIndex: state.currentIndex + 1,
        stayingAt: null,
        stayingSince: null,
        outcomes: { ...state.outcomes, [state.stayingAt.id]: 'visited' },
      };
    case 'skip':
      if (state.phase !== 'in_progress') {
        return state;
      }
      return {
        ...state,
        currentIndex: state.currentIndex + 1,
        stayingAt: null,
        stayingSince: null,
        outcomes: { ...state.outcomes, [action.stop.id]: action.outcome },
      };
  }
}
