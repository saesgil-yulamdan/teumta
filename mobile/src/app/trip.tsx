import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CourseMapView } from '@/components/course-map-view';
import { REALTIME_LEVEL_LABEL } from '@/constants/congestion';
import { Teumta } from '@/constants/theme';
import { useCourseLog } from '@/hooks/use-course-log';
import { useCourseProgress, type CourseStop } from '@/hooks/use-course-progress';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { fetchCourseAlternatives } from '@/api/courses';
import { getLocalPlaceDetail, getRealtimeCongestion } from '@/api/places';
import { getSelectedCourse, setSelectedCourse } from '@/stores/selected-course';
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

const SHEET_OVERLAP = 26;
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
  const selected = getSelectedCourse();
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
    const timer = setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // 도착 판정 대상: 정류지들 + 마지막 목적지(복귀)
  const courseStops: CourseStop[] = plannedCourse && destination
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
    : [];

  const [congestion, setCongestion] = useState<RealtimeCongestion | null>(null);

  const { location, status, start: startLocation } = useCurrentLocation({ watch: true });
  const {
    phase,
    currentIndex,
    nextStop,
    stayingAt,
    stayingSince,
    startedAt,
    outcomes,
    start,
    skipCurrent,
    finishCurrentStay,
    updateWithLocation,
  } = useCourseProgress(courseStops);
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
    }
  }, [phase, selected, markCourseCompleted]);

  useEffect(() => {
    start();
    startLocation();
  }, [start, startLocation]);

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
            title: `${currentCourseStop.name} 운영정보를 확인해 주세요`,
            body: `${availability.label} 계속 방문하거나 건너뛴 뒤 일정을 다시 계산할 수 있어요.`,
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
      ? `${formatDistance(distanceToNext)} · 도보 약 ${walkMinutes}분 남았어요`
      : status === 'denied'
        ? '위치 권한을 허용하면 남은 거리를 알려드려요'
        : '현재 위치를 확인하고 있어요';

  const statusTitle = completed
    ? '코스를 모두 마쳤어요'
    : stayingAt
      ? `${stayingAt.name} 도착!`
      : returning
        ? `${withRoJosa(destination.name)} 되돌아가는 중`
        : nextStop
          ? `${withRoJosa(nextStop.name)} 이동 중`
          : '코스를 따라 이동 중';
  const statusSubtitle = completed
    ? '복귀까지 완료했어요. 수고하셨어요!'
    : stayingAt
      ? `권장 체류 ${stayingStop?.stayMinutes ?? 10}분 · 둘러보고 나서면 다음 안내가 이어져요`
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
    setSelectedCourse({ ...selected, course: replanned });
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
    setSelectedCourse({ ...selected, course: returningCourse });
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

  return (
    <View style={styles.screen}>
      <View style={{ height: insets.top, backgroundColor: Teumta.surface }} />

      <View style={styles.topBar}>
        <Pressable style={styles.topButton} onPress={() => router.back()}>
          <Image
            source={require('@/assets/images/icons/back.svg')}
            style={styles.topButtonIcon}
            contentFit="contain"
          />
        </Pressable>
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

      <View style={[styles.sheet, { paddingBottom: 18 + insets.bottom }]}>
        <View style={styles.sheetHandle} />

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
                title: `${currentCourseStop?.name ?? '이 장소'} 운영정보를 확인해 주세요`,
                body: `${operatingAvailability.label} 계속 방문하거나 건너뛴 뒤 일정을 다시 계산할 수 있어요.`,
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
            <Text style={styles.easedText}>
              {destination.name} 혼잡이 풀렸어요 — 지금 돌아가기 좋아요.
            </Text>
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
              ? `선택한 시간보다 ${Math.abs(slackMinutes)}분 늦어질 수 있어요`
              : returnAlarmSet && !completed
              ? '돌아갈 시간이 되면 알려드려요'
              : '돌아갈 시간을 계산해 뒀어요'}
          </Text>
          <Text style={styles.noticeBody}>
            {slackMinutes < 0
              ? '바로 복귀하거나 다음 장소를 건너뛰면 복귀시각을 다시 계산해요.'
              : returnAlarmSet && !completed
              ? '복귀 출발 5분 전에 알림을 드려요. 알림도 이 기기 안에서만 처리돼요.'
              : '이동·체류·건너뛰기를 반영해 복귀시각을 계속 다시 계산해요.'}
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
          <View style={styles.statTile}>
            <Text style={styles.statLabel}>남은 시간</Text>
            <Text style={styles.statValue}>{remainingMinutes}분</Text>
          </View>
        </View>

        <View style={styles.buttonRow}>
          <Pressable
            style={styles.endButton}
            onPress={() => {
              cancelReturnReminder();
              // 중간에 끝내도 다녀온 기록으로 남긴다(완주 여부는 구분해 저장).
              if (selected && !completionLogged.current) {
                completionLogged.current = true;
                markCourseCompleted(selected, phase === 'completed');
              }
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
            현재 위치는 기기 안에서만 확인하고 서버에는 보내지 않아요.
          </Text>
        </View>
      </View>

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
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{adjustmentPrompt?.title}</Text>
            <Text style={styles.modalBody}>{adjustmentPrompt?.body}</Text>
            {operatingDetail ? (
              <Text numberOfLines={2} style={styles.modalDetail}>
                한국관광공사 · {operatingDetail}
              </Text>
            ) : null}

            {alternativeStatus === 'loading' && (
              <View style={styles.alternativeState}>
                <ActivityIndicator color={Teumta.green} size="small" />
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
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: Teumta.background,
    flex: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    color: Teumta.textSecondary,
    fontSize: 16,
  },
  emptyButton: {
    backgroundColor: Teumta.greenLight,
    borderRadius: 999,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  emptyButtonLabel: {
    color: Teumta.greenDark,
    fontSize: 13,
    fontWeight: '700',
  },
  topBar: {
    alignItems: 'center',
    backgroundColor: Teumta.surface,
    flexDirection: 'row',
    height: 52,
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  topButton: {
    alignItems: 'center',
    backgroundColor: Teumta.surface,
    borderColor: Teumta.border,
    borderRadius: 13,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  topButtonIcon: {
    height: 19,
    width: 19,
  },
  etaPill: {
    backgroundColor: Teumta.surface,
    borderColor: Teumta.border,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  etaPillLabel: {
    color: Teumta.greenDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  mapArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: Teumta.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    gap: 12,
    marginTop: -SHEET_OVERLAP,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: '#DBE3DE',
    borderRadius: 999,
    height: 5,
    width: 44,
  },
  statusCard: {
    alignItems: 'center',
    backgroundColor: Teumta.greenLight,
    borderRadius: 15,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  statusIconTile: {
    alignItems: 'center',
    backgroundColor: Teumta.surface,
    borderRadius: 12,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  statusIcon: {
    height: 21,
    width: 21,
  },
  statusTexts: {
    flex: 1,
    gap: 2,
  },
  statusTitle: {
    color: Teumta.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  statusSubtitle: {
    color: Teumta.textSecondary,
    fontSize: 10,
    lineHeight: 14,
  },
  easedBanner: {
    alignItems: 'center',
    backgroundColor: Teumta.greenLight,
    borderColor: Teumta.green,
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  easedDot: {
    backgroundColor: Teumta.green,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  easedText: {
    color: Teumta.greenDark,
    flex: 1,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  operatingChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#F7F9F8',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  operatingChipWarning: {
    backgroundColor: Teumta.congestion.medium.background,
  },
  operatingDot: {
    backgroundColor: Teumta.textTertiary,
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  operatingDotWarning: {
    backgroundColor: Teumta.congestion.medium.dot,
  },
  operatingLabel: {
    color: Teumta.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  operatingLabelWarning: {
    color: Teumta.congestion.medium.text,
  },
  progressRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  progressChip: {
    backgroundColor: Teumta.surface,
    borderColor: Teumta.border,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 132,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  progressChipDone: {
    backgroundColor: Teumta.greenLight,
    borderColor: Teumta.greenLight,
  },
  progressChipCurrent: {
    backgroundColor: Teumta.greenLight,
    borderColor: Teumta.green,
  },
  progressChipSkipped: {
    backgroundColor: '#F4F5F4',
    borderColor: Teumta.border,
  },
  progressChipLabel: {
    color: Teumta.textTertiary,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  progressChipLabelActive: {
    color: Teumta.greenDark,
  },
  progressChipLabelSkipped: {
    color: Teumta.textTertiary,
    textDecorationLine: 'line-through',
  },
  stopActionRow: {
    flexDirection: 'row',
    gap: 7,
  },
  stopActionButton: {
    alignItems: 'center',
    borderColor: Teumta.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  stopActionButtonPrimary: {
    backgroundColor: Teumta.greenLight,
    borderColor: Teumta.green,
  },
  stopActionLabel: {
    color: Teumta.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  stopActionLabelPrimary: {
    color: Teumta.greenDark,
  },
  noticeBox: {
    backgroundColor: Teumta.greenLight,
    borderColor: '#BFE7D7',
    borderRadius: 13,
    borderWidth: 1,
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  noticeTitle: {
    color: Teumta.greenDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  noticeBody: {
    color: Teumta.textSecondary,
    fontSize: 10,
    lineHeight: 14,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 7,
  },
  statTile: {
    alignItems: 'center',
    backgroundColor: Teumta.surface,
    borderColor: Teumta.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  statLabel: {
    color: Teumta.textTertiary,
    fontSize: 10,
    lineHeight: 13,
  },
  statValue: {
    color: Teumta.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  statValueCongestion: {
    fontSize: 14,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  endButton: {
    alignItems: 'center',
    backgroundColor: Teumta.surface,
    borderColor: Teumta.border,
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 118,
  },
  endButtonLabel: {
    color: Teumta.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  directionsButton: {
    alignItems: 'center',
    backgroundColor: Teumta.green,
    borderRadius: 14,
    flex: 1,
    height: 48,
    justifyContent: 'center',
  },
  directionsButtonDisabled: {
    opacity: 0.5,
  },
  directionsButtonLabel: {
    color: Teumta.surface,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  privacyStrip: {
    alignItems: 'center',
    backgroundColor: '#F7F9F8',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  privacyDot: {
    backgroundColor: Teumta.green,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  privacyText: {
    color: Teumta.textSecondary,
    fontSize: 10,
    lineHeight: 14,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 28, 24, 0.42)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: Teumta.surface,
    borderRadius: 20,
    gap: 10,
    maxWidth: 360,
    padding: 20,
    width: '100%',
  },
  modalTitle: {
    color: Teumta.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 23,
  },
  modalBody: {
    color: Teumta.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  modalDetail: {
    backgroundColor: '#F7F9F8',
    borderRadius: 10,
    color: Teumta.textSecondary,
    fontSize: 10,
    lineHeight: 15,
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
    color: Teumta.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  alternativeCard: {
    alignItems: 'center',
    borderColor: Teumta.border,
    borderRadius: 12,
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
    color: Teumta.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  alternativeMeta: {
    color: Teumta.textSecondary,
    fontSize: 10,
    lineHeight: 14,
  },
  alternativeCaution: {
    color: Teumta.congestion.medium.text,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 13,
  },
  alternativeApply: {
    color: Teumta.greenDark,
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
    borderColor: Teumta.border,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 12,
  },
  modalSecondaryLabel: {
    color: Teumta.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  modalPrimaryButton: {
    alignItems: 'center',
    backgroundColor: Teumta.green,
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 15,
  },
  modalPrimaryLabel: {
    color: Teumta.surface,
    fontSize: 11,
    fontWeight: '800',
  },
});
