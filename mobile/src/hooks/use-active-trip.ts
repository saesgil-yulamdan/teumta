import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState } from 'react-native';

import { loadSelectedCourse, type SelectedCourse } from '@/stores/selected-course';
import { loadTripProgress } from '@/stores/trip-progress';
import type { ProgressState } from '@/utils/course-progress-state';

export function useActiveTrip() {
  const [snapshot, setSnapshot] = useState<{
    selected: SelectedCourse | null;
    progress: ProgressState | null;
    ready: boolean;
  }>({ selected: null, progress: null, ready: false });

  useFocusEffect(useCallback(() => {
    let ignored = false;
    let request = 0;
    const refresh = async () => {
      const id = ++request;
      const selected = await loadSelectedCourse();
      const progress = selected ? await loadTripProgress(selected) : null;
      if (!ignored && id === request) {
        setSnapshot({ selected: progress?.phase === 'completed' ? null : selected, progress, ready: true });
      }
    };
    void refresh();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => { ignored = true; listener.remove(); };
  }, []));

  return snapshot;
}
