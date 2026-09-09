import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isAxiosError } from 'axios';

import { fetchCourses } from '@/api/courses';
import { TourApiAttribution } from '@/components/tour-api-attribution';
import { Fonts, TeumtaHybrid } from '@/constants/theme';
import { useCourseLog } from '@/hooks/use-course-log';
import { setSelectedCourse } from '@/stores/selected-course';
import {
  courseDistanceMeters,
  courseStayMinutes,
  type CourseDestination,
  type DestinationIdentifier,
  type GeneratedCourse,
} from '@/types/course';
import { courseCompositionLabel, courseTitle, formatKilometers } from '@/utils/course-labels';
import { createRequestGuard } from '@/utils/request-guard';
import { timeLabelAfter } from '@/utils/time';

/** 서버 지원 가용 시간 선택지(api-spec 3.10). */
const DURATION_OPTIONS = [30, 60, 90] as const;

type Status = 'loading' | 'idle' | 'error' | 'rate-limited';

type DetoursParams = {
  /** 목적지 식별자 — tourApiContentId 또는 tmapPoiId 중 하나. */
  contentId?: string;
  poiId?: string;
  name?: string;
};

type RouteCardProps = {
  course: GeneratedCourse;
  destination: CourseDestination;
  routeIndex: number;
  selected: boolean;
  onSelect: () => void;
};

function RouteCard({
  course,
  destination,
  routeIndex,
  selected,
  onSelect,
}: RouteCardProps) {
  const distanceLabel = formatKilometers(courseDistanceMeters(course));
  const stats = [
    { value: timeLabelAfter(course.totalMinutes), label: '예상 복귀' },
    { value: `${courseStayMinutes(course)}분`, label: '추천 체류' },
    { value: distanceLabel, label: '걷는 거리' },
  ];
  const stopNames = [...course.stops.map((stop) => stop.name), `${destination.name} 복귀`];
  const recommendationTags = course.recommendationTags ?? [];

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onSelect}
      style={[styles.card, selected ? styles.cardSelected : styles.cardAlternative]}>
      <View style={styles.cardHeader}>
        <View style={[styles.routeCode, selected && styles.routeCodeSelected]}>
          <Text style={[styles.routeCodeLabel, selected && styles.routeCodeLabelSelected]}>
            R{routeIndex + 1}
          </Text>
        </View>
        <View style={styles.routeHeaderTexts}>
          <Text style={styles.routeKind}>{selected ? '추천 경로' : '대안 경로'}</Text>
          <Text style={styles.headerDuration}>
            {course.totalMinutes}분 · {distanceLabel}
          </Text>
        </View>
        <View style={selected ? styles.radioOn : styles.radioOff} />
      </View>

      <View style={[styles.cardBody, selected ? styles.cardBodySelected : styles.cardBodyAlternative]}>
        <View style={styles.cardTitleRow}>
          <View style={selected ? styles.cardTexts : styles.cardTextsAlternative}>
            <Text
              numberOfLines={1}
              style={selected ? styles.cardName : styles.cardNameAlternative}>
              {courseTitle(course)}
            </Text>
            <Text
              numberOfLines={1}
              style={selected ? styles.cardDescription : styles.cardDescriptionAlternative}>
              {courseCompositionLabel(course)}
            </Text>
          </View>
        </View>

        {recommendationTags.length > 0 && (
          <View style={styles.reasonRow}>
            {recommendationTags.map((tag, index) => (
              <View key={tag} style={styles.reasonChip}>
                {index > 0 && <Text style={styles.reasonDivider}>/</Text>}
                <Text style={styles.reasonChipLabel}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.stopsRow}>
          {stopNames.map((stop, index) => (
            <View key={`${stop}-${index}`} style={styles.stopRow}>
              <View style={styles.stopCode}>
                <Text style={styles.stopCodeLabel}>
                  {index === stopNames.length - 1 ? 'D' : String(index + 1).padStart(2, '0')}
                </Text>
              </View>
              <Text style={styles.stopName}>{stop}</Text>
            </View>
          ))}
        </View>

        <View style={styles.statsRow}>
          {stats.map((stat, index) => (
            <View
              key={stat.label}
              style={[
                styles.statTile,
                index === stats.length - 1 && styles.statTileLast,
                selected ? styles.statTileSelected : styles.statTileAlternative,
              ]}>
              <Text style={selected ? styles.statValue : styles.statValueAlternative}>
                {stat.value}
              </Text>
              <Text style={selected ? styles.statLabel : styles.statLabelAlternative}>
                {stat.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

export default function DetoursScreen() {
  const { contentId, poiId, name } = useLocalSearchParams<DetoursParams>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { logViewedCourse } = useCourseLog();

  const [availableMinutes, setAvailableMinutes] =
    useState<(typeof DURATION_OPTIONS)[number]>(60);
  const [destination, setDestination] = useState<CourseDestination | null>(null);
  const [courses, setCourses] = useState<GeneratedCourse[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState<Status>('loading');
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | null>(null);
  const [variant, setVariant] = useState(0);
  const requestGuard = useMemo(() => createRequestGuard(), []);

  const identifier: DestinationIdentifier | null = contentId
    ? { contentId }
    : poiId
      ? { poiId }
      : null;

  const load = useCallback(async () => {
    const currentIdentifier: DestinationIdentifier | null = contentId
      ? { contentId }
      : poiId
        ? { poiId }
        : null;
    const requestId = requestGuard.start();

    if (!currentIdentifier) {
      setStatus('error');
      return;
    }

    setStatus('loading');
    setRetryAfterSeconds(null);
    try {
      const result = await fetchCourses(currentIdentifier, availableMinutes, variant);
      if (!requestGuard.isCurrent(requestId)) {
        return;
      }
      setDestination(result.destination);
      setCourses(result.courses);
      setSelectedIndex(0);
      setStatus('idle');
    } catch (error) {
      if (!requestGuard.isCurrent(requestId)) {
        return;
      }
      setCourses([]);
      if (isAxiosError(error) && error.response?.status === 429) {
        const retryAfter = Number(error.response.headers['retry-after']);
        setRetryAfterSeconds(Number.isFinite(retryAfter) ? retryAfter : null);
        setStatus('rate-limited');
      } else {
        setStatus('error');
      }
    }
  }, [contentId, poiId, availableMinutes, variant, requestGuard]);

  useEffect(() => {
    // 코스 생성은 외부 API 다중 호출 → 화면 전환 뒤 늦게 온 응답이 상태를 덮어쓰지 않게
    const timer = setTimeout(() => {
      void load();
    }, 0);

    return () => {
      clearTimeout(timer);
      requestGuard.invalidate();
    };
  }, [load, requestGuard]);

  const handleStart = () => {
    const course = courses[selectedIndex];
    if (!destination || !course || !identifier) {
      return;
    }

    const selected = {
      destination,
      course,
      availableMinutes,
      destinationParams: identifier,
    };
    setSelectedCourse(selected);
    // 내 여행 탭 "최근 본 코스"에 기기 전용으로 남긴다 — 앱을 껐다 켜도 재진입 가능.
    logViewedCourse(selected);
    router.push('/course-map');
  };

  const handleChangeMinutes = (minutes: (typeof DURATION_OPTIONS)[number]) => {
    setAvailableMinutes(minutes);
    setVariant(0);
  };

  const handleRefreshCourses = () => {
    if (status === 'loading') {
      return;
    }
    setVariant((current) => current + 1);
  };

  const destinationName = destination?.name ?? name ?? '목적지';

  return (
    <View style={styles.screen}>
      <View style={{ height: insets.top, backgroundColor: TeumtaHybrid.canvas }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="뒤로 가기" style={styles.backButton} onPress={() => router.back()}>
            <Image
              source={require('@/assets/images/icons/back.svg')}
              style={styles.backIcon}
              contentFit="contain"
            />
          </Pressable>
          <View style={styles.headerTexts}>
            <Text style={styles.headerEyebrow}>시간 맞춤 보행 안내</Text>
            <Text style={styles.headerTitle}>틈타 코스</Text>
            <Text style={styles.headerSubtitle}>
              {destinationName} 복귀 경로
            </Text>
          </View>
        </View>

        <View style={styles.durationBlock}>
          <Text style={styles.durationLabel}>가용 시간</Text>
          <View style={styles.chipRow}>
            {DURATION_OPTIONS.map((minutes) => {
              const chipSelected = minutes === availableMinutes;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: chipSelected, disabled: status === 'loading' }}
                  key={minutes}
                  onPress={() => handleChangeMinutes(minutes)}
                  disabled={status === 'loading'}
                  style={[styles.chip, chipSelected && styles.chipSelected]}>
                  <Text style={[styles.chipLabel, chipSelected && styles.chipLabelSelected]}>
                    {minutes}분
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {status === 'loading' && (
          <View style={styles.stateBox}>
            <ActivityIndicator />
            <Text style={styles.stateText}>경로 계산 중…</Text>
          </View>
        )}

        {(status === 'error' || status === 'rate-limited') && (
          <View style={styles.stateBox}>
            <Text style={styles.stateText}>
              {status === 'rate-limited'
                ? `코스 요청이 잠시 몰렸어요.${
                    retryAfterSeconds ? ` ${retryAfterSeconds}초 후 다시 시도해 주세요.` : ' 잠시 후 다시 시도해 주세요.'
                  }`
                : identifier
                ? '코스를 불러오지 못했어요.'
                : '목적지 정보가 없어요.'}
            </Text>
            {identifier && (
              <Pressable accessibilityRole="button" accessibilityLabel="코스 다시 시도" style={styles.retryButton} onPress={() => void load()}>
                <Text style={styles.retryLabel}>다시 시도</Text>
              </Pressable>
            )}
          </View>
        )}

        {status === 'idle' && courses.length === 0 && (
          <View style={styles.stateBox}>
            <Text style={styles.stateText}>
              {availableMinutes}분 코스가 없어요. 시간을 늘려보세요.
            </Text>
          </View>
        )}

        {status === 'idle' && destination && courses.length > 0 && (
          <View accessibilityRole="radiogroup" accessibilityLabel="코스 선택">
            {courses.map((course, index) => (
              <RouteCard
                key={`${index}-${courseTitle(course)}`}
                course={course}
                destination={destination}
                routeIndex={index}
                selected={index === selectedIndex}
                onSelect={() => setSelectedIndex(index)}
              />
            ))}
          </View>
        )}

        {status === 'idle' && courses.length > 0 && (
          <>
            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>추천 기준</Text>
              <Text style={styles.infoBody}>
                {availableMinutes <= 30
                  ? '잠깐 들렀다가 제시간에 돌아오기 좋은 짧은 코스예요.'
                  : '동네를 한 곳 더 둘러보고도 목적지로 돌아올 수 있는 코스예요.'}
                {'\n'}실제 보행 경로와 권장 체류시간을 반영합니다.
              </Text>
            </View>

            <TourApiAttribution style={styles.attribution} />

            <Pressable style={styles.secondaryButton} onPress={handleRefreshCourses}>
              <Text style={styles.secondaryButtonLabel}>다른 코스 보기</Text>
            </Pressable>

            <Pressable style={styles.ctaButton} onPress={handleStart}>
              <Text style={styles.ctaLabel}>코스 상세 보기</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: TeumtaHybrid.canvas,
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: 16,
    paddingBottom: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
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
  headerRow: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.slateSoft,
    borderColor: TeumtaHybrid.line,
    borderRadius: TeumtaHybrid.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 16,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.paper,
    borderRadius: TeumtaHybrid.radius.small,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  backIcon: {
    height: 19,
    width: 19,
  },
  headerTexts: {
    flex: 1,
    gap: 2,
  },
  headerEyebrow: {
    color: TeumtaHybrid.terracotta,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    lineHeight: 14,
  },
  headerTitle: {
    color: TeumtaHybrid.ink,
    fontFamily: Fonts.sans,
    fontSize: 25,
    fontWeight: '500',
    lineHeight: 31,
  },
  headerSubtitle: {
    color: TeumtaHybrid.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  durationBlock: {
    gap: 8,
  },
  durationLabel: {
    color: TeumtaHybrid.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    lineHeight: 15,
  },
  chipRow: {
    flexDirection: 'row',
  },
  chip: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.paper,
    borderColor: TeumtaHybrid.line,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
  },
  chipSelected: {
    backgroundColor: TeumtaHybrid.signalSoft,
    borderColor: TeumtaHybrid.signal,
  },
  chipLabel: {
    color: TeumtaHybrid.navy,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  chipLabelSelected: {
    color: TeumtaHybrid.navy,
  },
  card: {
    backgroundColor: TeumtaHybrid.paper,
    borderColor: TeumtaHybrid.line,
    borderRadius: TeumtaHybrid.radius.small,
    overflow: 'hidden',
  },
  cardSelected: {
    borderColor: TeumtaHybrid.slate,
    borderWidth: 2,
  },
  cardAlternative: {
    borderWidth: 1,
  },
  cardHeader: {
    alignItems: 'center',
    borderBottomColor: TeumtaHybrid.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 64,
  },
  routeCode: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: TeumtaHybrid.slateSoft,
    justifyContent: 'center',
    width: 58,
  },
  routeCodeSelected: {
    backgroundColor: TeumtaHybrid.signalSoft,
  },
  routeCodeLabel: {
    color: TeumtaHybrid.navy,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  routeCodeLabelSelected: {
    color: TeumtaHybrid.navy,
  },
  routeHeaderTexts: {
    flex: 1,
    gap: 2,
    paddingHorizontal: 13,
  },
  routeKind: {
    color: TeumtaHybrid.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    lineHeight: 14,
  },
  headerDuration: {
    color: TeumtaHybrid.navy,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
  },
  cardBody: {
    backgroundColor: TeumtaHybrid.paper,
    paddingHorizontal: 16,
  },
  cardBodySelected: {
    gap: 14,
    paddingVertical: 16,
  },
  cardBodyAlternative: {
    gap: 12,
    paddingVertical: 14,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardTexts: {
    flex: 1,
    gap: 3,
  },
  cardTextsAlternative: {
    flex: 1,
    gap: 3,
  },
  cardName: {
    color: TeumtaHybrid.ink,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  cardNameAlternative: {
    color: TeumtaHybrid.ink,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 23,
  },
  cardDescription: {
    color: TeumtaHybrid.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  cardDescriptionAlternative: {
    color: TeumtaHybrid.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  reasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  reasonChip: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  reasonChipLabel: {
    color: TeumtaHybrid.slate,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  reasonDivider: {
    color: TeumtaHybrid.line,
    fontSize: 11,
  },
  radioOn: {
    backgroundColor: TeumtaHybrid.slate,
    borderColor: TeumtaHybrid.signalSoft,
    borderWidth: 5,
    height: 20,
    marginRight: 14,
    width: 20,
  },
  radioOff: {
    borderColor: TeumtaHybrid.slate,
    borderWidth: 1,
    height: 20,
    marginRight: 14,
    width: 20,
  },
  stopsRow: {
    borderBottomColor: TeumtaHybrid.line,
    borderTopColor: TeumtaHybrid.line,
    borderTopWidth: 1,
  },
  stopRow: {
    alignItems: 'center',
    borderBottomColor: TeumtaHybrid.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 38,
  },
  stopCode: {
    alignItems: 'center',
    borderRightColor: TeumtaHybrid.line,
    borderRightWidth: 1,
    justifyContent: 'center',
    width: 40,
  },
  stopCodeLabel: {
    color: TeumtaHybrid.terracotta,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  stopName: {
    color: TeumtaHybrid.ink,
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    paddingHorizontal: 11,
  },
  statsRow: {
    borderBottomColor: TeumtaHybrid.line,
    borderBottomWidth: 1,
    borderTopColor: TeumtaHybrid.line,
    borderTopWidth: 1,
    flexDirection: 'row',
  },
  statTile: {
    borderRightColor: TeumtaHybrid.line,
    borderRightWidth: 1,
    flex: 1,
    gap: 2,
    paddingHorizontal: 10,
  },
  statTileLast: {
    borderRightWidth: 0,
  },
  statTileSelected: {
    paddingVertical: 10,
  },
  statTileAlternative: {
    paddingVertical: 9,
  },
  statValue: {
    color: TeumtaHybrid.slate,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
  },
  statValueAlternative: {
    color: TeumtaHybrid.slate,
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 17,
  },
  statLabel: {
    color: TeumtaHybrid.muted,
    fontSize: 10,
    lineHeight: 14,
  },
  statLabelAlternative: {
    color: TeumtaHybrid.muted,
    fontSize: 10,
    lineHeight: 14,
  },
  infoBox: {
    borderLeftColor: TeumtaHybrid.signal,
    borderLeftWidth: 5,
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  infoTitle: {
    color: TeumtaHybrid.navy,
    fontSize: 11,
    fontWeight: '900',
  },
  infoBody: {
    color: TeumtaHybrid.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  stateBox: {
    alignItems: 'center',
    borderColor: TeumtaHybrid.line,
    borderWidth: 1,
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 28,
  },
  stateText: {
    color: TeumtaHybrid.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: TeumtaHybrid.navy,
    borderRadius: TeumtaHybrid.radius.small,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryLabel: {
    color: TeumtaHybrid.white,
    fontSize: 12,
    fontWeight: '700',
  },
  attribution: {
    marginTop: 2,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.paper,
    borderColor: TeumtaHybrid.navy,
    borderRadius: TeumtaHybrid.radius.small,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
  },
  secondaryButtonLabel: {
    color: TeumtaHybrid.navy,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  ctaButton: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.navy,
    borderRadius: TeumtaHybrid.radius.small,
    height: 52,
    justifyContent: 'center',
  },
  ctaLabel: {
    color: TeumtaHybrid.white,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18,
  },
});
