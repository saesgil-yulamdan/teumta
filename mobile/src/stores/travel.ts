import { appAlert as Alert } from '@/utils/app-alert';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useEffect, useSyncExternalStore } from 'react';
import { TravelRepository } from './travel-repository';
import { clearSelectedCourse } from './selected-course';

export const travel = new TravelRepository(AsyncStorage, async () => {
  if (Platform.OS !== 'web') await Notifications.cancelAllScheduledNotificationsAsync();
});
// The hook must return the snapshot received from useSyncExternalStore itself.
// Reading the mutable singleton after ignoring the hook's value is not reactive
// under React Compiler, even if a separate revision counter triggers a render.
const snapshot = () => ({ ...travel.state, ready: travel.ready, error: travel.error, deletionRevision: travel.deletionRevision });
let currentSnapshot = snapshot();
travel.subscribe(() => {
  if (travel.state.deletionPending) clearSelectedCourse();
  currentSnapshot = snapshot();
});
export function useTravel() {
  const state = useSyncExternalStore(travel.subscribe, () => currentSnapshot, () => currentSnapshot);
  useEffect(() => { void travel.load().catch(() => {}); }, []);
  return state;
}
export function storageError(error: unknown) {
  Alert.alert('저장하지 못했어요', error instanceof Error ? error.message : '기기 저장 공간을 확인하고 다시 시도해 주세요.');
}
