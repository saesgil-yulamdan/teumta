import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CourseMapView } from '@/components/course-map-view';
import { REALTIME_LEVEL_LABEL } from '@/constants/congestion';
import { TeumtaHybrid } from '@/constants/theme';
import { useCourseLog } from '@/hooks/use-course-log';
import { useCourseProgress, type CourseStop } from '@/hooks/use-course-progress';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { fetchCourseAlternatives } from '@/api/courses';
import { getLocalPlaceDetail, getRealtimeCongestion } from '@/api/places';
import {
  clearSelectedCourse,
  getSelectedCourse,
  loadSelectedCourse,
  selectedCourseKey,
  setSelectedCourse,
  type SelectedCourse,
} from '@/stores/selected-course';
import type { GeneratedCourse } from '@/types/course';
import type { LocalPlaceDetail, RealtimeCongestion } from '@/types/place';
import { buildCourseRoutePath } from '@/utils/course-path';
import { openDirections, openNaverMapPlace } from '@/utils/directions';
import { distanceInMeters } from '@/utils/distance';
import { evaluateOperatingStatus, type OperatingStatus } from '@/utils/operating-status';
import {
  cancelScheduledCourseNotification,
  ensureNotificationPermission,
  presentCourseNotification,
  scheduleReturnReminder,
} from '@/utils/notifications';
import { withRoJosa } from '@/utils/text';
import { timeLabelAt } from '@/utils/time';
import {
  courseReturningAfterCurrent,
  courseWithAlternative,
  remainingDeadlineMinutes,
  remainingTripMinutes,
} from '@/utils/trip-plan';

const WALK_METERS_PER_MINUTE = 67;
/** 서버 혼잡도 캐시가 5분 — 같은 주기면 폴링해도 외부 호출이 거의 늘지 않는다. */
const CONGESTION_POLL_INTERVAL_MS = 5 * 60 * 1000;
const CLOCK_TICK_MS = 30 * 1000;

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;
}

function courseStopId(stop: GeneratedCourse['stops'][number], index: number): string {
  return `stop-${stop.tourApiContentId ?? `${index}-${stop.name}`}`;
}

type AdjustmentPrompt = {
  outcome: 'skipped' | 'unavailable';
  title: string;
  body: string;
};

type AlternativeOption = {
  course: GeneratedCourse;
  operatingLabel: string | null;
};

type OperatingInfoState =
  | { targetId: null; status: 'idle'; detail: null; availability: null }
  | { targetId: string; status: 'ready'; detail: LocalPlaceDetail; availability: OperatingStatus }
  | { targetId: string; status: 'unavailable'; detail: null; availability: OperatingStatus };


export default function TripScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<SelectedCourse | null>(() => getSelectedCourse());
  const [selectionReady, setSelectionReady] = useState(selected !== null);
  const course = selected?.course;
  const destination = selected?.destination;
  const [activeCourse, setActiveCourse] = useState<GeneratedCourse | null>(course ?? null);
  const plannedCourse = activeCourse ?? course;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [adjustmentPrompt, setAdjustmentPrompt] = useState<AdjustmentPrompt | null>(null);
  const [alternatives, setAlternatives] = useState<AlternativeOption[]>([]);
  const [alternativeStatus, setAlternativeStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [operatingInfo, setOperatingInfo] = useState<OperatingInfoState>({
    targetId: null,
    status: 'idle',
    detail: null,
    availability: null,
  });
  const warnedOperatingStops = useRef(new Set<string>());
  const alternativeRequestId = useRef(0);

  useEffect(() => {
    if (selected) return;
    let ignored = false;
    void loadSelectedCourse().then((restored) => {
      if (!ignored) {
        setSelected(restored);
        setSelectionReady(true);
      }
    });
    return () => {
      ignored = true;
    };
  }, [selected]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // 도착 판정 대상: 정류지들 + 마지막 목적지(복귀)
  const courseStops: CourseStop[] = useMemo(
    () => plannedCourse && destination
      ? [
          ...plannedCourse.stops.map((stop, index) => ({
            id: courseStopId(stop, index),
            name: stop.name,
            latitude: stop.latitude,
            longitude: stop.longitude,
          })),
          {
            id: 'return',
            name: destination.name,
            latitude: destination.latitude,
            longitude: destination.longitude,
          },
        ]
      : [],
    [plannedCourse, destination],
  );

  const [congestion, setCongestion] = useState<RealtimeCongestion | null>(null);

  const { location, status, start: startLocation } = useCurrentLocation({ watch: true });
  const {
    phase,
    ready: progressReady,
    currentIndex,
    nextStop,
    stayingAt,
    stayingSince,
    startedAt,
    outcomes,
    start,
    clearPersistedProgress,
    skipCurrent,
    finishCurrentStay,
    updateWithLocation,
  } = useCourseProgress(courseStops, selected ? selectedCourseKey(selected) : null);
  const { markCourseCompleted } = useCourseLog();
  // 완료 기록은 코스당 1회 — 기록이 상태를 바꾸고 상태가 다시 기록을 부르는 순환 방지.
  const completionLogged = useRef(false);

  const returnReminderId = useRef<string | null>(null);
  const notificationsGranted = useRef(false);
  const notificationRevision = useRef(0);
  const [notificationsReady, setNotificationsReady] = useState(false);
  const [returnAlarmSet, setReturnAlarmSet] = useState(false);

  const completed = phase === 'completed';
  const currentCourseStop = plannedCourse?.stops[currentIndex] ?? null;
  const distanceToNext = location && nextStop ? distanceInMeters(location, nextStop) : null;
  const walkMinutes =
    distanceToNext !== null
      ? Math.max(1, Math.round(distanceToNext / WALK_METERS_PER_MINUTE))
      : null;
  const remainingMinutes = plannedCourse
    ? completed
      ? 0
      : remainingTripMinutes({
          course: plannedCourse,
          currentIndex,
          stayingSince,
          now: nowMs,
          currentWalkMinutes: walkMinutes,
        })
    : 0;
  const deadlineMinutes = selected
    ? remainingDeadlineMinutes(startedAt, selected.availableMinutes, nowMs)
    : 0;
  const slackMinutes = deadlineMinutes - remainingMinutes;
  const expectedReturnAt = nowMs + remainingMinutes * 60_000;
  const expectedReturnMinute = Math.round(expectedReturnAt / 60_000);
  const returning =
    Boolean(plannedCourse) && !completed && currentIndex === plannedCourse?.stops.length;
  const reminderReturnWalkMinutes = returning
    ? (walkMinutes ?? plannedCourse?.returnTravelMinutes ?? 0)
    : (plannedCourse?.returnTravelMinutes ?? 0);

  const routePath =
    plannedCourse && destination ? buildCourseRoutePath(destination, plannedCourse) : [];

  const cancelReturnReminder = useCallback(() => {
    notificationRevision.current += 1;
    if (returnReminderId.current) {
      void cancelScheduledCourseNotification(returnReminderId.current);
      returnReminderId.current = null;
    }
    setReturnAlarmSet(false);
  }, []);

  const refreshClock = useCallback(() => {
    setTimeout(() => setNowMs(Date.now()), 0);
  }, []);

  useEffect(() => {
    if (!plannedCourse || !destination) {
      return;
    }
    let cancelled = false;

    // 예약·발송 모두 단말 안 — 권한을 거부하면 화면 안내만으로 진행.
    void (async () => {
      const granted = await ensureNotificationPermission();
      if (!granted || cancelled) {
        return;
      }
      notificationsGranted.current = true;
      setNotificationsReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [plannedCourse, destination]);

  useEffect(() => {
    if (
      !notificationsReady ||
      !destination ||
      phase !== 'in_progress'
    ) {
      return;
    }
    const revision = ++notificationRevision.current;
    void (async () => {
      setReturnAlarmSet(false);
      if (returnReminderId.current) {
        await cancelScheduledCourseNotification(returnReminderId.current);
        returnReminderId.current = null;
      }
      const totalMinutesUntilReturn = Math.max(
        0,
        expectedReturnMinute - Math.floor(Date.now() / 60_000),
      );
      const id = await scheduleReturnReminder({
        destinationName: destination.name,
        totalMinutes: totalMinutesUntilReturn,
        returnWalkMinutes: reminderReturnWalkMinutes,
      });
      if (revision !== notificationRevision.current) {
        if (id) {
          await cancelScheduledCourseNotification(id);
        }
        return;
      }
      returnReminderId.current = id;
      setReturnAlarmSet(id !== null);
    })();
  }, [
    notificationsReady,
    destination,
    phase,
    expectedReturnMinute,
    reminderReturnWalkMinutes,
  ]);

  useEffect(
    () => () => {
      notificationRevision.current += 1;
      if (returnReminderId.current) {
        void cancelScheduledCourseNotification(returnReminderId.current);
        returnReminderId.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (phase !== 'completed') {
      return;
    }
    // 복귀를 마쳤으면 예약 알림은 필요 없다.
    notificationRevision.current += 1;
    if (returnReminderId.current) {
      void cancelScheduledCourseNotification(returnReminderId.current);
      returnReminderId.current = null;
    }
    // 마지막 복귀 지점 도착 판정이 나면 "다녀온 코스"로 기기에만 남긴다.
    if (selected && !completionLogged.current) {
      completionLogged.current = true;
      markCourseCompleted(selected, true);
      clearSelectedCourse();
    }
  }, [phase, selected, markCourseCompleted]);

  useEffect(() => {
    if (!selectionReady || !selected || !progressReady || courseStops.length === 0) return;
    start();
    void startLocation();
  }, [selectionReady, selected, progressReady, courseStops.length, start, startLocation]);

  useEffect(() => {
    if (location) {
      updateWithLocation(location);
    }
  }, [location, updateWithLocation]);

  useEffect(() => {
    const contentId = currentCourseStop?.tourApiContentId;
    if (!currentCourseStop || !contentId || returning || completed) {
      return;
    }

    let ignored = false;
    getLocalPlaceDetail(contentId)
      .then((detail) => {
        if (ignored) {
          return;
        }
        const availability = evaluateOperatingStatus(detail);
        setOperatingInfo({ targetId: contentId, status: 'ready', detail, availability });
        if (
          (availability.state === 'closed' || availability.state === 'break') &&
          !warnedOperatingStops.current.has(contentId)
        ) {
          warnedOperatingStops.current.add(contentId);
          setAdjustmentPrompt((current) => current ?? {
            outcome: 'unavailable',
            title: `${currentCourseStop.name} 운영 확인`,
            body: `${availability.label} 계속 가거나 건너뛸 수 있어요.`,
          });
        }
      })
      .catch(() => {
        if (!ignored) {
          setOperatingInfo({
            targetId: contentId,
            status: 'unavailable',
            detail: null,
            availability: { state: 'unknown', label: '운영정보 확인 필요' },
          });
        }
      });

    return () => {
      ignored = true;
    };
  }, [currentCourseStop, returning, completed]);

  const destinationParams = selected?.destinationParams;
  const lastCongestionLevel = useRef<RealtimeCongestion['level'] | null>(null);
  const easedNotified = useRef(false);
  const [congestionEased, setCongestionEased] = useState(false);

  useEffect(() => {
    if (!destinationParams) {
      return;
    }
    let ignored = false;

    // 복귀 판단용 목적지 혼잡도. "풀리면 복귀"가 핵심 루프인데 진입 시 1회 조회로는
    // 풀린 걸 알 수 없다 — 앱이 떠 있는 동안 서버 캐시와 같은 주기로 갱신한다.
    const fetchCongestion = () => {
      getRealtimeCongestion(destinationParams)
        .then((data) => {
          if (ignored) {
            return;
          }
          setCongestion(data);
          const previous = lastCongestionLevel.current;
          lastCongestionLevel.current = data.level;
          // 회복 = 우회 트리거 단계(CROWDED 이상, congestion-rules §5)에서 그 아래로 내려옴
          const wasCrowded = previous === 'CROWDED' || previous === 'VERY_CROWDED';
          const nowCalm = data.level === 'RELAXED' || data.level === 'NORMAL';
          if (wasCrowded && nowCalm && !easedNotified.current) {
            easedNotified.current = true;
            setCongestionEased(true);
            if (notificationsGranted.current) {
              void presentCourseNotification(
                '목적지 혼잡이 풀렸어요',
                `${selected?.destination.name ?? '목적지'} 지금 ${REALTIME_LEVEL_LABEL[data.level]} — 돌아가기 좋은 타이밍이에요.`,
              );
            }
          }
        })
        .catch(() => {
          // 혼잡도 조회 실패해도 코스 진행은 계속
        });
    };

    fetchCongestion();
    const timer = setInterval(() => {
      // iOS는 백그라운드에서 JS 타이머가 멈춘다 — 사실상 포그라운드 전용 폴링.
      if (AppState.currentState === 'active') {
        fetchCongestion();
      }
    }, CONGESTION_POLL_INTERVAL_MS);
    // 백그라운드에 오래 있다 돌아오면 다음 틱까지 최대 5분 낡은 값 — 복귀 즉시 한 번 갱신.
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNowMs(Date.now());
        fetchCongestion();
      }
    });

    return () => {
      ignored = true;
      clearInterval(timer);
      appStateSubscription.remove();
    };
  }, [destinationParams, selected]);

  if (!selectionReady || !progressReady) {
    return (
      <View style={styles.emptyContainer}>
        <ActivityIndicator color={TeumtaHybrid.navy} />
        <Text style={styles.emptyText}>진행 중인 코스를 복구하고 있어요.</Text>
      </View>
    );
  }

  if (!plannedCourse || !destination) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>진행 중인 코스가 없습니다.</Text>
        <Pressable style={styles.emptyButton} onPress={() => router.back()}>
          <Text style={styles.emptyButtonLabel}>코스 고르러 가기</Text>
        </Pressable>
      </View>
    );
  }

  const stayingStop = stayingAt ? plannedCourse.stops[currentIndex] : undefined;

  const movingSubtitle =
    distanceToNext !== null && walkMinutes !== null
      ? `${formatDistance(distanceToNext)} · 도보 ${walkMinutes}분`
      : status === 'denied'
        ? '남은 거리 확인에 위치 권한이 필요해요'
        : '위치 확인 중';

  const statusTitle = completed
    ? '코스 완료'
    : stayingAt
      ? `${stayingAt.name} 도착`
      : returning
        ? `${withRoJosa(destination.name)} 되돌아가는 중`
        : nextStop
          ? `${withRoJosa(nextStop.name)} 이동 중`
          : '코스를 따라 이동 중';
  const statusSubtitle = completed
    ? '목적지 복귀 완료'
    : stayingAt
      ? `권장 체류 ${stayingStop?.stayMinutes ?? 10}분`
      : movingSubtitle;

  // 로컬 상세에만 있던 영업·리뷰 확인 통로 — 진행 중 가게가 닫혀 있으면 여기서 판단.
  const reviewTarget =
    !completed && !returning && currentCourseStop
      ? { name: currentCourseStop.name, address: currentCourseStop.address }
      : null;
  const canSkip = phase === 'in_progress' && !returning && currentCourseStop !== null;

  // 도착!·복귀 전환·완료 같은 "순간"에만 카드가 새로 떨어지게 키로 구분 —
  // GPS 거리 갱신(같은 상태)에는 애니메이션이 다시 돌지 않는다.
  const statusMomentKey = completed
    ? 'completed'
    : stayingAt
      ? `stay-${currentIndex}`
      : returning
        ? 'returning'
        : `moving-${currentIndex}`;

  const previewRemainingAfterSkip = () => {
    const nextIndex = currentIndex + 1;
    const nextTarget = plannedCourse.stops[nextIndex] ?? destination;
    const nextWalkMinutes = location
      ? Math.max(
          1,
          Math.round(distanceInMeters(location, nextTarget) / WALK_METERS_PER_MINUTE),
        )
      : null;
    return remainingTripMinutes({
      course: plannedCourse,
      currentIndex: nextIndex,
      stayingSince: null,
      now: nowMs,
      currentWalkMinutes: nextWalkMinutes,
    });
  };

  const openSkipPrompt = () => {
    if (!currentCourseStop) {
      return;
    }
    const previewMinutes = previewRemainingAfterSkip();
    setAlternatives([]);
    setAlternativeStatus('idle');
    setAdjustmentPrompt({
      outcome: 'skipped',
      title: `${currentCourseStop.name} 건너뛸까요?`,
      body: `건너뛰면 ${timeLabelAt(nowMs + previewMinutes * 60_000)}쯤 복귀해요.`,
    });
  };

  const confirmSkip = () => {
    if (!currentCourseStop || !adjustmentPrompt) {
      return;
    }
    skipCurrent(adjustmentPrompt.outcome);
    alternativeRequestId.current += 1;
    setAdjustmentPrompt(null);
    setAlternatives([]);
    setAlternativeStatus('idle');
    refreshClock();
  };

  const canFindAlternative =
    Boolean(stayingAt && currentCourseStop?.tourApiContentId) && deadlineMinutes >= 10;

  const findAlternatives = async () => {
    if (
      !selected?.destinationParams ||
      !currentCourseStop?.tourApiContentId ||
      !canFindAlternative
    ) {
      return;
    }
    setAlternativeStatus('loading');
    setAlternatives([]);
    const requestId = ++alternativeRequestId.current;
    try {
      const result = await fetchCourseAlternatives({
        originContentId: currentCourseStop.tourApiContentId,
        destination: selected.destinationParams,
        availableMinutes: deadlineMinutes,
        excludeContentIds: plannedCourse.stops
          .map((stop) => stop.tourApiContentId)
          .filter((contentId): contentId is string => Boolean(contentId)),
      });
      const checked = await Promise.all(
        result.alternatives.map(async (alternative): Promise<AlternativeOption | null> => {
          const alternativeStop = alternative.stops[0];
          if (!alternativeStop.tourApiContentId) {
            return { course: alternative, operatingLabel: '운영정보 확인 필요' };
          }
          try {
            const detail = await getLocalPlaceDetail(alternativeStop.tourApiContentId);
            const availability = evaluateOperatingStatus(detail);
            if (availability.state === 'closed' || availability.state === 'break') {
              return null;
            }
            return {
              course: alternative,
              operatingLabel:
                availability.state === 'unknown' ? '운영정보 확인 필요' : null,
            };
          } catch {
            return { course: alternative, operatingLabel: '운영정보 확인 필요' };
          }
        }),
      );
      if (requestId !== alternativeRequestId.current) {
        return;
      }
      setAlternatives(checked.filter((option): option is AlternativeOption => option !== null));
      setAlternativeStatus('ready');
    } catch {
      if (requestId === alternativeRequestId.current) {
        setAlternativeStatus('error');
      }
    }
  };

  const applyAlternative = (alternative: GeneratedCourse) => {
    if (!selected) {
      return;
    }
    const replanned = courseWithAlternative(plannedCourse, currentIndex, alternative);
    setActiveCourse(replanned);
    const nextSelected = { ...selected, course: replanned };
    setSelected(nextSelected);
    setSelectedCourse(nextSelected);
    skipCurrent(adjustmentPrompt?.outcome ?? 'skipped');
    alternativeRequestId.current += 1;
    setAdjustmentPrompt(null);
    setAlternatives([]);
    setAlternativeStatus('idle');
    refreshClock();
  };

  const returnNow = () => {
    if (!selected || !currentCourseStop) {
      return;
    }
    const distanceMeters = location
      ? distanceInMeters(location, destination)
      : distanceInMeters(currentCourseStop, destination);
    const returnMinutes = Math.max(
      1,
      Math.ceil((distanceMeters * 1.3) / WALK_METERS_PER_MINUTE),
    );
    const returningCourse = courseReturningAfterCurrent(plannedCourse, currentIndex, {
      minutes: returnMinutes,
      distanceMeters: Math.round(distanceMeters * 1.3),
    });
    setActiveCourse(returningCourse);
    const nextSelected = { ...selected, course: returningCourse };
    setSelected(nextSelected);
    setSelectedCourse(nextSelected);
    skipCurrent(adjustmentPrompt?.outcome ?? 'skipped');
    alternativeRequestId.current += 1;
    setAdjustmentPrompt(null);
    setAlternatives([]);
    setAlternativeStatus('idle');
    refreshClock();
  };

  const etaPillLabel =
    !completed && !stayingAt && nextStop && walkMinutes !== null
      ? `${nextStop.name.split(' ')[0]}까지 ${walkMinutes}분`
      : null;
  const operatingAvailability = currentCourseStop && !returning
    ? currentCourseStop.tourApiContentId
      ? operatingInfo.targetId === currentCourseStop.tourApiContentId
        ? operatingInfo.availability
        : null
      : { state: 'unknown' as const, label: '운영정보 확인 필요' }
    : null;
  const operatingNeedsAttention =
    operatingAvailability && operatingAvailability.state !== 'open';
  const operatingDetail =
    operatingInfo.status === 'ready' &&
    operatingInfo.targetId === currentCourseStop?.tourApiContentId
      ? [operatingInfo.detail.restDays, operatingInfo.detail.openHours]
          .filter((value): value is string => Boolean(value))
          .join(' · ')
      : '';
  const skipActionLabel =
    currentIndex + 1 < plannedCourse.stops.length ? '건너뛰고 다음' : '건너뛰고 복귀';

  const leaveTripScreen = () => {
    Alert.alert('진행 화면을 나갈까요?', '코스는 진행 중으로 유지되며 홈에서 이어갈 수 있어요.', [
      { text: '계속 보기', style: 'cancel' },
      { text: '나가기', onPress: () => router.back() },
    ]);
  };

  return (
    <View style={styles.screen}>
      <View style={{ height: insets.top, backgroundColor: TeumtaHybrid.slateSoft }} />

      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="진행 화면 나가기" style={styles.topButton} onPress={leaveTripScreen}>
          <Image
            source={require('@/assets/images/icons/back.svg')}
            style={styles.topButtonIcon}
            contentFit="contain"
          />
        </Pressable>
        <View style={styles.tripIdentity}>
          <Text style={styles.tripEyebrow}>진행 중인 코스</Text>
          <Text numberOfLines={1} style={styles.tripDestination}>
            {destination.name}
          </Text>
        </View>
        {etaPillLabel && (
          <View style={styles.etaPill}>
            <Text style={styles.etaPillLabel}>{etaPillLabel}</Text>
          </View>
        )}
      </View>

      <View style={styles.mapArea}>
        <CourseMapView
          detour={{
            id: 'generated',
            name: destination.name,
            durationMinutes: plannedCourse.totalMinutes,
            distanceKm: 0,
            description: '',
            coordinates: [
              { latitude: destination.latitude, longitude: destination.longitude },
              ...plannedCourse.stops.map((stop) => ({
                latitude: stop.latitude,
                longitude: stop.longitude,
              })),
              { latitude: destination.latitude, longitude: destination.longitude },
            ],
            stops: [
              destination.name,
              ...plannedCourse.stops.map((stop) => stop.name),
              `${destination.name} 복귀`,
            ],
          }}
          routePath={routePath}
          skippedStopIndexes={plannedCourse.stops.flatMap((stop, index) => {
            const outcome = outcomes[courseStopId(stop, index)];
            return outcome === 'skipped' || outcome === 'unavailable' ? [index] : [];
          })}
          showsUserLocation={status === 'granted'}
        />
      </View>

      <ScrollView
        style={styles.sheet}
        contentContainerStyle={[styles.sheetContent, { paddingBottom: 18 + insets.bottom }]}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}>
        <Animated.View
          key={statusMomentKey}
          entering={FadeInDown.duration(280)}
          style={styles.statusCard}>
          <View style={styles.statusIconTile}>
            <Image
              source={require('@/assets/images/icons/arrow-move.svg')}
              style={styles.statusIcon}
              contentFit="contain"
            />
          </View>
          <View style={styles.statusTexts}>
            <Text style={styles.statusTitle}>{statusTitle}</Text>
            <Text style={styles.statusSubtitle}>{statusSubtitle}</Text>
          </View>
        </Animated.View>

        {operatingNeedsAttention && !completed && !returning && (
          <Pressable
            disabled={operatingAvailability.state === 'unknown'}
            onPress={() => {
              setAdjustmentPrompt({
                outcome: 'unavailable',
                title: `${currentCourseStop?.name ?? '이 장소'} 운영 확인`,
                body: `${operatingAvailability.label} 계속 가거나 건너뛸 수 있어요.`,
              });
            }}
            style={[
              styles.operatingChip,
              operatingAvailability.state !== 'unknown' && styles.operatingChipWarning,
            ]}>
            <View
              style={[
                styles.operatingDot,
                operatingAvailability.state !== 'unknown' && styles.operatingDotWarning,
              ]}
            />
            <Text
              style={[
                styles.operatingLabel,
                operatingAvailability.state !== 'unknown' && styles.operatingLabelWarning,
              ]}>
              {operatingAvailability.label}
            </Text>
          </Pressable>
        )}

        {congestionEased && !completed && (
          <View style={styles.easedBanner}>
            <View style={styles.easedDot} />
            <Text style={styles.easedText}>{destination.name} 혼잡 완화 · 복귀하기 좋아요</Text>
          </View>
        )}

        <View style={styles.progressRow}>
          {courseStops.map((stop, index) => {
            const outcome = outcomes[stop.id];
            const skipped = outcome === 'skipped' || outcome === 'unavailable';
            const isCurrent = !completed && index === currentIndex;
            const isReturn = index === courseStops.length - 1;
            const done = outcome === 'visited' || (completed && isReturn);
            return (
              <View
                key={stop.id}
                style={[
                  styles.progressChip,
                  done && styles.progressChipDone,
                  skipped && styles.progressChipSkipped,
                  isCurrent && styles.progressChipCurrent,
                ]}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.progressChipLabel,
                    (done || isCurrent) && styles.progressChipLabelActive,
                    skipped && styles.progressChipLabelSkipped,
                  ]}>
                  {/* 복귀 칩은 순번이 무의미하다 — 숫자 없이 라벨만. */}
                  {(done ? '✓ ' : skipped ? '– ' : isReturn ? '' : `${index + 1} `) +
                    (isReturn ? '복귀' : stop.name)}
                </Text>
              </View>
            );
          })}
        </View>

        {(canSkip || reviewTarget) && (
          <View style={styles.stopActionRow}>
            {reviewTarget && (
              <Pressable
                style={styles.stopActionButton}
                onPress={() => void openNaverMapPlace(reviewTarget)}>
                <Text style={styles.stopActionLabel}>영업·리뷰 확인</Text>
              </Pressable>
            )}
            {canSkip && (
              <Pressable style={styles.stopActionButton} onPress={openSkipPrompt}>
                <Text style={styles.stopActionLabel}>이 장소 건너뛰기</Text>
              </Pressable>
            )}
            {stayingAt && (
              <Pressable
                style={[styles.stopActionButton, styles.stopActionButtonPrimary]}
                onPress={() => {
                  finishCurrentStay();
                  refreshClock();
                }}>
                <Text style={[styles.stopActionLabel, styles.stopActionLabelPrimary]}>
                  다음 장소로
                </Text>
              </Pressable>
            )}
          </View>
        )}

        <View style={styles.noticeBox}>
          {/* 완료 후에는 예약이 취소되므로 알림 문구도 함께 내린다(상태 대신 파생 조건). */}
          <Text style={styles.noticeTitle}>
            {slackMinutes < 0
              ? `${Math.abs(slackMinutes)}분 늦을 수 있어요`
              : returnAlarmSet && !completed
              ? '복귀 5분 전 알림'
              : '복귀시각 자동 계산'}
          </Text>
          <Text style={styles.noticeBody}>
            {slackMinutes < 0
              ? '건너뛰거나 바로 복귀하면 다시 계산합니다.'
              : returnAlarmSet && !completed
              ? '알림은 이 기기에서만 처리합니다.'
              : '이동과 체류 상태를 반영합니다.'}
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statTile}>
            <Text style={styles.statLabel}>복귀 예정</Text>
            <Text style={styles.statValue}>{timeLabelAt(expectedReturnAt)}</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statLabel}>목적지 혼잡</Text>
            <Text style={[styles.statValue, styles.statValueCongestion]}>
              {congestion ? REALTIME_LEVEL_LABEL[congestion.level] : '확인 중'}
            </Text>
          </View>
          <View style={[styles.statTile, styles.statTileLast]}>
            <Text style={styles.statLabel}>남은 시간</Text>
            <Text style={styles.statValue}>{remainingMinutes}분</Text>
          </View>
        </View>

        <View style={styles.buttonRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="코스 종료 및 기록 저장"
            style={styles.endButton}
            onPress={() => {
              cancelReturnReminder();
              // 중간에 끝내도 다녀온 기록으로 남긴다(완주 여부는 구분해 저장).
              if (selected && !completionLogged.current) {
                completionLogged.current = true;
                markCourseCompleted(selected, phase === 'completed');
              }
              clearPersistedProgress();
              clearSelectedCourse();
              router.dismissAll();
            }}>
            <Text style={styles.endButtonLabel}>코스 종료</Text>
          </Pressable>
          <Pressable
            style={[styles.directionsButton, !nextStop && styles.directionsButtonDisabled]}
            disabled={!nextStop}
            onPress={() => {
              if (nextStop) {
                void openDirections(nextStop);
              }
            }}>
            <Text style={styles.directionsButtonLabel}>길찾기 열기</Text>
          </Pressable>
        </View>

        <View style={styles.privacyStrip}>
          <View style={styles.privacyDot} />
          <Text style={styles.privacyText}>
            위치는 이 기기에서만 사용합니다.
          </Text>
        </View>
      </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={() => {
          alternativeRequestId.current += 1;
          setAdjustmentPrompt(null);
          setAlternatives([]);
          setAlternativeStatus('idle');
        }}
        transparent
        visible={adjustmentPrompt !== null}>
        <View style={styles.modalBackdrop}>
          <ScrollView
            style={styles.modalCard}
            contentContainerStyle={styles.modalCardContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>{adjustmentPrompt?.title}</Text>
            <Text style={styles.modalBody}>{adjustmentPrompt?.body}</Text>
            {operatingDetail ? (
              <Text numberOfLines={2} style={styles.modalDetail}>
                한국관광공사 · {operatingDetail}
              </Text>
            ) : null}

            {alternativeStatus === 'loading' && (
              <View style={styles.alternativeState}>
                <ActivityIndicator color={TeumtaHybrid.navy} size="small" />
                <Text style={styles.alternativeStateText}>대체 코스를 계산하고 있어요…</Text>
              </View>
            )}
            {alternativeStatus === 'error' && (
              <Text style={styles.alternativeStateText}>대체 코스를 불러오지 못했어요.</Text>
            )}
            {alternativeStatus === 'ready' && alternatives.length === 0 && (
              <Text style={styles.alternativeStateText}>남은 시간에 맞는 대체 장소가 없어요.</Text>
            )}
            {alternatives.map((option) => {
              const alternative = option.course;
              const alternativeStop = alternative.stops[0];
              return (
                <Pressable
                  key={alternativeStop.tourApiContentId ?? alternativeStop.name}
                  onPress={() => applyAlternative(alternative)}
                  style={styles.alternativeCard}>
                  <View style={styles.alternativeTexts}>
                    <Text numberOfLines={1} style={styles.alternativeName}>
                      {alternativeStop.name}
                    </Text>
                    <Text style={styles.alternativeMeta}>
                      약 {alternative.totalMinutes}분 · {timeLabelAt(nowMs + alternative.totalMinutes * 60_000)} 복귀
                    </Text>
                    {option.operatingLabel && (
                      <Text style={styles.alternativeCaution}>{option.operatingLabel}</Text>
                    )}
                  </View>
                  <Text style={styles.alternativeApply}>적용</Text>
                </Pressable>
              );
            })}

            <View style={styles.modalActionRow}>
              <Pressable
                onPress={() => {
                  alternativeRequestId.current += 1;
                  setAdjustmentPrompt(null);
                  setAlternatives([]);
                  setAlternativeStatus('idle');
                }}
                style={styles.modalSecondaryButton}>
                <Text style={styles.modalSecondaryLabel}>계속 방문</Text>
              </Pressable>
              {canFindAlternative && alternativeStatus === 'idle' && (
                <Pressable onPress={() => void findAlternatives()} style={styles.modalSecondaryButton}>
                  <Text style={styles.modalSecondaryLabel}>대체 장소 찾기</Text>
                </Pressable>
              )}
              <Pressable onPress={returnNow} style={styles.modalSecondaryButton}>
                <Text style={styles.modalSecondaryLabel}>바로 복귀</Text>
              </Pressable>
              <Pressable onPress={confirmSkip} style={styles.modalPrimaryButton}>
                <Text style={styles.modalPrimaryLabel}>{skipActionLabel}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: TeumtaHybrid.canvas,
    flex: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    color: TeumtaHybrid.muted,
    fontSize: 16,
  },
  emptyButton: {
    backgroundColor: TeumtaHybrid.navy,
    borderRadius: TeumtaHybrid.radius.small,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  emptyButtonLabel: {
    color: TeumtaHybrid.white,
    fontSize: 13,
    fontWeight: '700',
  },
  topBar: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.slateSoft,
    borderBottomColor: TeumtaHybrid.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 11,
    height: 62,
    paddingHorizontal: 16,
  },
  topButton: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.paper,
    borderRadius: TeumtaHybrid.radius.small,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  topButtonIcon: {
    height: 19,
    width: 19,
  },
  tripIdentity: {
    flex: 1,
    gap: 1,
  },
  tripEyebrow: {
    color: TeumtaHybrid.terracotta,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    lineHeight: 12,
  },
  tripDestination: {
    color: TeumtaHybrid.ink,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  etaPill: {
    backgroundColor: TeumtaHybrid.signalSoft,
    borderRadius: TeumtaHybrid.radius.small,
    maxWidth: 126,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  etaPillLabel: {
    color: TeumtaHybrid.navy,
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
  },
  mapArea: {
    flex: 1,
    minHeight: 120,
  },
  sheet: {
    backgroundColor: TeumtaHybrid.paper,
    borderTopColor: TeumtaHybrid.slate,
    borderTopWidth: 2,
    maxHeight: '68%',
  },
  sheetContent: {
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  statusCard: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.paper,
    borderColor: TeumtaHybrid.line,
    borderRadius: TeumtaHybrid.radius.small,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 10,
  },
  statusIconTile: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: TeumtaHybrid.signalSoft,
    borderRadius: TeumtaHybrid.radius.small,
    justifyContent: 'center',
    width: 42,
  },
  statusIcon: {
    height: 22,
    width: 22,
  },
  statusTexts: {
    flex: 1,
    gap: 2,
  },
  statusTitle: {
    color: TeumtaHybrid.navy,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
  statusSubtitle: {
    color: TeumtaHybrid.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  easedBanner: {
    alignItems: 'center',
    borderLeftColor: TeumtaHybrid.slate,
    borderLeftWidth: 4,
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 10,
    paddingVertical: 4,
  },
  easedDot: {
    backgroundColor: TeumtaHybrid.slate,
    height: 7,
    width: 7,
  },
  easedText: {
    color: TeumtaHybrid.slate,
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  operatingChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: TeumtaHybrid.line,
    borderRadius: TeumtaHybrid.radius.small,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  operatingChipWarning: {
    backgroundColor: TeumtaHybrid.signalSoft,
    borderColor: TeumtaHybrid.signal,
  },
  operatingDot: {
    backgroundColor: TeumtaHybrid.faint,
    height: 7,
    width: 7,
  },
  operatingDotWarning: {
    backgroundColor: TeumtaHybrid.terracotta,
  },
  operatingLabel: {
    color: TeumtaHybrid.muted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  operatingLabelWarning: {
    color: TeumtaHybrid.navy,
  },
  progressRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  progressChip: {
    backgroundColor: TeumtaHybrid.paper,
    borderColor: TeumtaHybrid.line,
    borderRadius: TeumtaHybrid.radius.small,
    borderWidth: 1,
    maxWidth: 142,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  progressChipDone: {
    backgroundColor: TeumtaHybrid.navySoft,
    borderColor: TeumtaHybrid.navySoft,
  },
  progressChipCurrent: {
    backgroundColor: TeumtaHybrid.signalSoft,
    borderColor: TeumtaHybrid.signal,
  },
  progressChipSkipped: {
    backgroundColor: TeumtaHybrid.canvas,
    borderColor: TeumtaHybrid.line,
  },
  progressChipLabel: {
    color: TeumtaHybrid.faint,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 14,
  },
  progressChipLabelActive: {
    color: TeumtaHybrid.navy,
  },
  progressChipLabelSkipped: {
    color: TeumtaHybrid.faint,
    textDecorationLine: 'line-through',
  },
  stopActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  stopActionButton: {
    alignItems: 'center',
    borderColor: TeumtaHybrid.navy,
    borderRadius: TeumtaHybrid.radius.small,
    borderWidth: 1,
    flexBasis: 116,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  stopActionButtonPrimary: {
    backgroundColor: TeumtaHybrid.navy,
    borderColor: TeumtaHybrid.navy,
  },
  stopActionLabel: {
    color: TeumtaHybrid.navy,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 14,
  },
  stopActionLabelPrimary: {
    color: TeumtaHybrid.white,
  },
  noticeBox: {
    backgroundColor: TeumtaHybrid.canvas,
    borderLeftColor: TeumtaHybrid.signal,
    borderLeftWidth: 5,
    gap: 3,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  noticeTitle: {
    color: TeumtaHybrid.navy,
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
  },
  noticeBody: {
    color: TeumtaHybrid.muted,
    fontSize: 10,
    lineHeight: 15,
  },
  statsRow: {
    borderBottomColor: TeumtaHybrid.line,
    borderBottomWidth: 1,
    borderTopColor: TeumtaHybrid.line,
    borderTopWidth: 1,
    flexDirection: 'row',
  },
  statTile: {
    alignItems: 'flex-start',
    borderRightColor: TeumtaHybrid.line,
    borderRightWidth: 1,
    flex: 1,
    gap: 2,
    paddingHorizontal: 9,
    paddingVertical: 9,
  },
  statTileLast: {
    borderRightWidth: 0,
  },
  statLabel: {
    color: TeumtaHybrid.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
  },
  statValue: {
    color: TeumtaHybrid.navy,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
  },
  statValueCongestion: {
    fontSize: 14,
    lineHeight: 19,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  endButton: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.paper,
    borderColor: TeumtaHybrid.navy,
    borderRadius: TeumtaHybrid.radius.small,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: 12,
    width: 118,
  },
  endButtonLabel: {
    color: TeumtaHybrid.navy,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  directionsButton: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.navy,
    borderRadius: TeumtaHybrid.radius.small,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: 12,
  },
  directionsButtonDisabled: {
    opacity: 0.5,
  },
  directionsButtonLabel: {
    color: TeumtaHybrid.white,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  privacyStrip: {
    alignItems: 'center',
    borderTopColor: TeumtaHybrid.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 2,
    paddingTop: 9,
  },
  privacyDot: {
    backgroundColor: TeumtaHybrid.slate,
    height: 6,
    width: 6,
  },
  privacyText: {
    color: TeumtaHybrid.muted,
    fontSize: 10,
    lineHeight: 14,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(10, 18, 30, 0.62)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: TeumtaHybrid.paper,
    borderRadius: TeumtaHybrid.radius.large,
    maxHeight: '88%',
    maxWidth: 360,
    width: '100%',
  },
  modalCardContent: {
    gap: 12,
    padding: 20,
  },
  modalTitle: {
    color: TeumtaHybrid.navy,
    fontSize: 19,
    fontWeight: '900',
    lineHeight: 25,
  },
  modalBody: {
    color: TeumtaHybrid.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  modalDetail: {
    backgroundColor: TeumtaHybrid.canvas,
    borderLeftColor: TeumtaHybrid.signal,
    borderLeftWidth: 4,
    color: TeumtaHybrid.muted,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  alternativeState: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
  },
  alternativeStateText: {
    color: TeumtaHybrid.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  alternativeCard: {
    alignItems: 'center',
    borderColor: TeumtaHybrid.navy,
    borderRadius: TeumtaHybrid.radius.small,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  alternativeTexts: {
    flex: 1,
    gap: 2,
  },
  alternativeName: {
    color: TeumtaHybrid.ink,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  alternativeMeta: {
    color: TeumtaHybrid.muted,
    fontSize: 11,
    lineHeight: 15,
  },
  alternativeCaution: {
    color: TeumtaHybrid.terracotta,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
  },
  alternativeApply: {
    color: TeumtaHybrid.navy,
    fontSize: 11,
    fontWeight: '800',
  },
  modalActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    justifyContent: 'flex-end',
    marginTop: 2,
  },
  modalSecondaryButton: {
    alignItems: 'center',
    borderColor: TeumtaHybrid.navy,
    borderRadius: TeumtaHybrid.radius.small,
    borderWidth: 1,
    flexBasis: '45%',
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalSecondaryLabel: {
    color: TeumtaHybrid.navy,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalPrimaryButton: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.navy,
    borderRadius: TeumtaHybrid.radius.small,
    flexBasis: '45%',
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  modalPrimaryLabel: {
    color: TeumtaHybrid.white,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
});
