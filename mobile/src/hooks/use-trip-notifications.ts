import { useCallback, useEffect, useRef, useState } from 'react';

import {
  cancelScheduledCourseNotification,
  ensureNotificationPermission,
  presentCourseNotification,
  scheduleReturnReminder,
} from '@/utils/notifications';

type TripNotificationOptions = {
  enabled: boolean;
  active: boolean;
  destinationName: string | null;
  totalMinutesUntilReturn: number;
  returnWalkMinutes: number;
};

/** 코스 진행의 권한 요청·복귀 알림 예약·즉시 로컬 알림을 한곳에서 관리한다. */
export function useTripNotifications(options: TripNotificationOptions) {
  const reminderId = useRef<string | null>(null);
  const granted = useRef(false);
  const revision = useRef(0);
  const [ready, setReady] = useState(false);
  const [returnAlarmSet, setReturnAlarmSet] = useState(false);

  const cancelReturnReminder = useCallback(() => {
    revision.current += 1;
    if (reminderId.current) {
      void cancelScheduledCourseNotification(reminderId.current);
      reminderId.current = null;
    }
    setReturnAlarmSet(false);
  }, []);

  const notify = useCallback((title: string, body: string) => {
    if (granted.current) {
      void presentCourseNotification(title, body);
    }
  }, []);

  useEffect(() => {
    if (!options.enabled) return;
    let cancelled = false;
    void ensureNotificationPermission().then((permissionGranted) => {
      if (!cancelled && permissionGranted) {
        granted.current = true;
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [options.enabled]);

  useEffect(() => {
    if (!ready || !options.destinationName || !options.active) return;
    const currentRevision = ++revision.current;
    void (async () => {
      setReturnAlarmSet(false);
      if (reminderId.current) {
        await cancelScheduledCourseNotification(reminderId.current);
        reminderId.current = null;
      }
      const id = await scheduleReturnReminder({
        destinationName: options.destinationName as string,
        totalMinutes: options.totalMinutesUntilReturn,
        returnWalkMinutes: options.returnWalkMinutes,
      });
      if (currentRevision !== revision.current) {
        if (id) await cancelScheduledCourseNotification(id);
        return;
      }
      reminderId.current = id;
      setReturnAlarmSet(id !== null);
    })();
  }, [
    ready,
    options.active,
    options.destinationName,
    options.totalMinutesUntilReturn,
    options.returnWalkMinutes,
  ]);

  useEffect(() => {
    if (!options.active && reminderId.current) {
      cancelReturnReminder();
    }
  }, [options.active, cancelReturnReminder]);

  useEffect(
    () => () => {
      revision.current += 1;
      if (reminderId.current) {
        void cancelScheduledCourseNotification(reminderId.current);
        reminderId.current = null;
      }
    },
    [],
  );

  return { returnAlarmSet, cancelReturnReminder, notify };
}
