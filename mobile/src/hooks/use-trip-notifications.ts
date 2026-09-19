import { useCallback, useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { travel, useTravel, storageError } from '@/stores/travel';
import { ensureNotificationPermission, presentCourseNotification } from '@/utils/notifications';
import { appAlert } from '@/utils/app-alert';

type Options = { sessionId?: string; enabled: boolean; active: boolean; destinationName: string | null; totalMinutesUntilReturn: number; returnWalkMinutes: number };
/** The preference and alarm belong to the journey; unmounting never cancels them. */
export function useTripNotifications(options: Options) {
  const { active } = useTravel();
  const sessionId = options.sessionId;
  const enabled = active?.id === sessionId && active?.reminderEnabled === true;
  const returnWalk = active?.selected.course.returnTravelMinutes;
  const schedule = useCallback(async () => {
    if (!sessionId || Platform.OS === 'web') return;
    await travel.reminder(sessionId, async () => {
      const a = travel.state.active;
      if (!a) return;
      const seconds = Math.round((a.startedAt + (a.selected.availableMinutes - a.selected.course.returnTravelMinutes - 5) * 60000 - Date.now()) / 1000);
      await Notifications.cancelScheduledNotificationAsync('teumta-return-' + sessionId);
      if (seconds < 1) return false;
      await Notifications.scheduleNotificationAsync({
        identifier: 'teumta-return-' + sessionId,
        content: { title: '복귀 시간을 확인해 주세요', body: a.selected.destination.name + '까지 예상 이동시간을 확인하고 출발하세요.' },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, repeats: false, channelId: 'course' },
      });
    });
  }, [sessionId]);
  // Replan/relaunch updates the one alarm at the same absolute journey deadline.
  useEffect(() => { if (enabled) void schedule().catch(storageError); }, [enabled, returnWalk, schedule]);
  const enableReminder = async () => {
    if (Platform.OS === 'web') { appAlert.alert('웹에서는 알림을 지원하지 않아요', '화면의 복귀 예상 시각을 확인해 주세요.'); return; }
    if (!sessionId) return;
    try {
      if (enabled) {
        await travel.reminder(sessionId, () => Notifications.cancelScheduledNotificationAsync('teumta-return-' + sessionId), false);
      } else if (await ensureNotificationPermission()) {
        await schedule();
        if (!travel.state.active?.reminderEnabled) appAlert.alert('복귀 알림 시각이 지났어요', '현재 이동시간과 복귀 예정 시각을 화면에서 확인해 주세요.');
      } else appAlert.alert('알림 권한이 꺼져 있어요', '설정·도움에서 OS 권한을 확인할 수 있어요. 알림 없이도 여행을 계속할 수 있습니다.');
    } catch (error) { storageError(error); }
  };
  const notify = useCallback((title: string, body: string) => {
    if (enabled && sessionId) void travel.reminder(sessionId, () => presentCourseNotification(title, body)).catch(storageError);
  }, [enabled, sessionId]);
  return { returnAlarmSet: enabled, enableReminder, notify };
}
