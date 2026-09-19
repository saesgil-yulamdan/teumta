import type { SelectedCourse } from '@/stores/selected-course';
import { travel, useTravel, storageError } from '@/stores/travel';

export function useCourseLog() {
  const { recent: entries, ready } = useTravel();
  return {
    entries,
    ready,
    logViewedCourse: (selected: SelectedCourse) => {
      void travel.view(selected).catch(storageError);
    },
  };
}
