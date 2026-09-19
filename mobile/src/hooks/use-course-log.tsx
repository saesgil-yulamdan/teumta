import type { ReactNode } from 'react';
import type { SelectedCourse } from '@/stores/selected-course';
import { travel, useTravel, storageError } from '@/stores/travel';
export function CourseLogProvider({ children }: { children: ReactNode }) { return children; }
export function useCourseLog() {
  const { recent: entries, ready } = useTravel();
  return { entries, ready, logViewedCourse: (selected: SelectedCourse) => { void travel.view(selected).catch(storageError); } };
}
