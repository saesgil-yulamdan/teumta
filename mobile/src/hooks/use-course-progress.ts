import { useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import { travel, useTravel, storageError } from '@/stores/travel';
import { INITIAL_COURSE_PROGRESS, type CourseStop, type ProgressAction } from '@/utils/course-progress-state';
import type { Coordinate } from '@/types/place';
import { hasArrived } from '@/utils/arrival';
import { ARRIVAL_RADIUS_METERS } from '@/constants/location';
export type { CourseStop } from '@/utils/course-progress-state';

export function useCourseProgress(stops: CourseStop[], sessionId?: string | null) {
  const { active, ready } = useTravel();
  const router = useRouter();
  const state = active && active.id === sessionId ? active.progress : INITIAL_COURSE_PROGRESS;
  const nextStop = stops[state.currentIndex] ?? null;
  const busy = useRef(false);
  const correctedStop = useRef<string | null>(null);
  const lastLocation = useRef<Coordinate | null>(null);
  const dispatch = useCallback(async (action: ProgressAction) => {
    if (!sessionId || busy.current) return;
    busy.current = true;
    try {
      await travel.progress(sessionId, action);
      if (!travel.state.active && travel.state.records.some(v => v.id === sessionId)) router.replace({ pathname: '/history/[id]', params: { id: sessionId } });
    } catch (error) { storageError(error); }
    finally { busy.current = false; }
  }, [sessionId, router]);
  const arrive = useCallback(() => {
    if (nextStop) void dispatch({ type: 'arrive', stop: nextStop, at: Date.now(), isReturn: nextStop.id === 'return' });
  }, [nextStop, dispatch]);
  const updateWithLocation = useCallback((location: Coordinate) => {
    if (location === lastLocation.current) return;
    lastLocation.current = location;
    if (nextStop?.id === correctedStop.current) {
      if (hasArrived(location, nextStop, ARRIVAL_RADIUS_METERS)) return;
      correctedStop.current = null;
    }
    // Do not infer departure or final return from unobserved movement.
    if (!state.stayingAt && nextStop && nextStop.id !== 'return' && hasArrived(location, nextStop, ARRIVAL_RADIUS_METERS)) arrive();
  }, [state.stayingAt, nextStop, arrive]);
  return { ...state, ready, nextStop, arrive,
    undoArrival: () => { correctedStop.current = nextStop?.id ?? null; void dispatch({ type: 'undo_arrival' }); },
    skipCurrent: (outcome: 'skipped' | 'unavailable' = 'skipped') => {
      if (nextStop && nextStop.id !== 'return') void dispatch({ type: 'skip', stop: nextStop, outcome });
    },
    finishCurrentStay: () => void dispatch({ type: 'finish_stay' }),
    updateWithLocation,
  };
}
