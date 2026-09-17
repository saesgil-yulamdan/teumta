import AsyncStorage from '@react-native-async-storage/async-storage';

import { selectedCourseKey, type SelectedCourse } from '@/stores/selected-course';
import { courseProgressStops, parseTripProgress } from '@/utils/trip-summary';

export const PROGRESS_STORAGE_KEY = 'teumta:active-trip-progress:v1';

export async function loadTripProgress(selected: SelectedCourse) {
  try {
    const raw = await AsyncStorage.getItem(PROGRESS_STORAGE_KEY);
    return parseTripProgress(raw, selectedCourseKey(selected), courseProgressStops(selected));
  } catch {
    return null;
  }
}
