import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchCourses } from '@/api/courses';
import { TourApiAttribution } from '@/components/tour-api-attribution';
import { Teumta } from '@/constants/theme';
import { useCourseLog } from '@/hooks/use-course-log';
import { setSelectedCourse } from '@/stores/selected-course';
import {
  courseDistanceMeters,
  courseStayMinutes,
  type CourseDestination,
  type DestinationIdentifier,
  type GeneratedCourse,
} from '@/types/course';
import { isStaleRequest, nextRequestId } from '@/utils/async-request';
import { courseCompositionLabel, courseTitle, formatKilometers } from '@/utils/course-labels';
import { withRoJosa } from '@/utils/text';
import { timeLabelAfter } from '@/utils/time';

/** 서버 지원 가용 시간 선택지(api-spec 3.10). */
const DURATION_OPTIONS = [30, 60, 90] as const;
const HEADER_TINTS = ['#A8D6C2', '#D6C7AB'];

type Status = 'loading' | 'idle' | 'error';

type DetoursParams = {
  /** 목적지 식별자 — tourApiContentId 또는 tmapPoiId 중 하나. */
  contentId?: string;
  poiId?: string;
  name?: string;
};

type RouteCardProps = {
  course: GeneratedCourse;
  destination: CourseDestination;
  headerTint: string;
  badgeLabel: string;
  selected: boolean;
  onSelect: () => void;
};

function RouteCard({
  course,
  destination,
  headerTint,
  badgeLabel,
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
      onPress={onSelect}
      style={[styles.card, selected ? styles.cardSelected : styles.cardAlternative]}>
      <View
        style={[
          styles.cardHeader,
          { backgroundColor: headerTint },
          selected ? styles.cardHeaderSelected : styles.cardHeaderAlternative,
        ]}>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>{badgeLabel}</Text>
        </View>
        {selected ? (
          <View style={styles.summaryPill}>
            <Text style={styles.summaryText}>
              약 {course.totalMinutes}분 · 도보 {distanceLabel} · {withRoJosa(destination.name)} 복귀
            </Text>
          </View>
        ) : (
          <Text style={styles.headerDuration}>약 {course.totalMinutes}분 코스</Text>
        )}
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
          <View style={selected ? styles.radioOn : styles.radioOff} />
        </View>

        {recommendationTags.length > 0 && (
          <View style={styles.reasonRow}>
            {recommendationTags.map((tag) => (
              <View key={tag} style={styles.reasonChip}>
                <Text style={styles.reasonChipLabel}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.stopsRow}>
          {stopNames.map((stop, index) => (
            <Fragment key={`${stop}-${index}`}>
              {index > 0 && <Text style={styles.stopArrow}>→</Text>}
              <Text style={styles.stopName}>{stop}</Text>
            </Fragment>
          ))}
        </View>

        <View style={styles.statsRow}>
          {stats.map((stat) => (
            <View
              key={stat.label}
              style={[styles.statTile, selected ? styles.statTileSelected : styles.statTileAlternative]}>
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
  const [variant, setVariant] = useState(0);
  const loadRequestId = useRef(0);

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
    const requestId = nextRequestId(loadRequestId.current);
    loadRequestId.current = requestId;

    if (!currentIdentifier) {
      setStatus('error');
      return;
    }

    setStatus('loading');
    try {
      const result = await fetchCourses(currentIdentifier, availableMinutes, variant);
      if (isStaleRequest(requestId, loadRequestId.current)) {
        return;
      }
      setDestination(result.destination);
      setCourses(result.courses);
      setSelectedIndex(0);
      setStatus('idle');
    } catch {
      if (isStaleRequest(requestId, loadRequestId.current)) {
        return;
      }
      setCourses([]);
      setStatus('error');
    }
  }, [contentId, poiId, availableMinutes, variant]);

  useEffect(() => {
    // 코스 생성은 외부 API 다중 호출 → 화면 전환 뒤 늦게 온 응답이 상태를 덮어쓰지 않게
    const timer = setTimeout(() => {
      void load();
    }, 0);

    return () => {
      clearTimeout(timer);
      loadRequestId.current = nextRequestId(loadRequestId.current);
    };
  }, [load]);

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
      <View style={{ height: insets.top, backgroundColor: Teumta.surface }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Image
              source={require('@/assets/images/icons/back.svg')}
              style={styles.backIcon}
              contentFit="contain"
            />
          </Pressable>
          <View style={styles.headerTexts}>
            <Text style={styles.headerTitle}>틈타 코스</Text>
            <Text style={styles.headerSubtitle}>
              {destinationName} 주변에서 남는 시간에 맞춰 골라보세요.
            </Text>
          </View>
        </View>

        <View style={styles.chipRow}>
          {DURATION_OPTIONS.map((minutes) => {
            const chipSelected = minutes === availableMinutes;
            return (
              <Pressable
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

        {status === 'loading' && (
          <View style={styles.stateBox}>
            <ActivityIndicator />
            <Text style={styles.stateText}>걷는 시간을 계산하고 있어요…</Text>
          </View>
        )}

        {status === 'error' && (
          <View style={styles.stateBox}>
            <Text style={styles.stateText}>
              {identifier
                ? '코스를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
                : '목적지 정보가 없어 코스를 만들 수 없어요.'}
            </Text>
            {identifier && (
              <Pressable style={styles.retryButton} onPress={() => void load()}>
                <Text style={styles.retryLabel}>다시 시도</Text>
              </Pressable>
            )}
          </View>
        )}

        {status === 'idle' && courses.length === 0 && (
          <View style={styles.stateBox}>
            <Text style={styles.stateText}>
              {availableMinutes}분 안에 다녀올 수 있는 코스가 없어요. 더 긴 시간을 골라보세요.
            </Text>
          </View>
        )}

        {status === 'idle' &&
          destination &&
          courses.map((course, index) => (
            <RouteCard
              key={`${index}-${courseTitle(course)}`}
              course={course}
              destination={destination}
              headerTint={HEADER_TINTS[index % HEADER_TINTS.length]}
              badgeLabel={index === 0 ? '가장 알맞아요' : '조금 더 여유롭게'}
              selected={index === selectedIndex}
              onSelect={() => setSelectedIndex(index)}
            />
          ))}

        {status === 'idle' && courses.length > 0 && (
          <>
            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>추천 기준</Text>
              <Text style={styles.infoBody}>
                걷는 시간은 실제 보행 경로로 계산했어요. 체류시간은 장소 유형을 기준으로 한 예상값이라
                실제와 다를 수 있어요.
              </Text>
            </View>

            <TourApiAttribution style={styles.attribution} />

            <Pressable style={styles.secondaryButton} onPress={handleRefreshCourses}>
              <Text style={styles.secondaryButtonLabel}>다른 코스 보기</Text>
            </Pressable>

            <Pressable style={styles.ctaButton} onPress={handleStart}>
              <Text style={styles.ctaLabel}>선택한 코스 자세히 보기</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: Teumta.background,
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: 12,
    paddingBottom: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
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
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: Teumta.surface,
    borderColor: Teumta.border,
    borderRadius: 13,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  backIcon: {
    height: 19,
    width: 19,
  },
  headerTexts: {
    gap: 1,
  },
  headerTitle: {
    color: Teumta.textPrimary,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 28,
  },
  headerSubtitle: {
    color: Teumta.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 7,
  },
  chip: {
    backgroundColor: Teumta.surface,
    borderColor: Teumta.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  chipSelected: {
    backgroundColor: Teumta.greenLight,
    borderColor: Teumta.green,
  },
  chipLabel: {
    color: Teumta.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  chipLabelSelected: {
    color: Teumta.greenDark,
  },
  card: {
    backgroundColor: Teumta.surface,
    overflow: 'hidden',
  },
  cardSelected: {
    borderColor: Teumta.green,
    borderRadius: 20,
    borderWidth: 2,
  },
  cardAlternative: {
    borderColor: Teumta.border,
    borderRadius: 18,
    borderWidth: 1,
  },
  cardHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardHeaderSelected: {
    height: 104,
    justifyContent: 'space-between',
  },
  cardHeaderAlternative: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    height: 70,
    justifyContent: 'space-between',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: Teumta.surface,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  badgeLabel: {
    color: Teumta.greenDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  summaryPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: Teumta.greenLight,
    borderRadius: 12,
    height: 45,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  summaryText: {
    color: Teumta.greenDark,
    fontSize: 11,
    fontWeight: '700',
  },
  headerDuration: {
    color: Teumta.surface,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  cardBody: {
    backgroundColor: Teumta.surface,
    paddingHorizontal: 14,
  },
  cardBodySelected: {
    gap: 8,
    paddingVertical: 12,
  },
  cardBodyAlternative: {
    gap: 7,
    paddingVertical: 10,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardTexts: {
    gap: 2,
  },
  cardTextsAlternative: {
    gap: 1,
  },
  cardName: {
    color: Teumta.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  cardNameAlternative: {
    color: Teumta.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  cardDescription: {
    color: Teumta.textSecondary,
    fontSize: 10,
    lineHeight: 14,
  },
  cardDescriptionAlternative: {
    color: Teumta.textSecondary,
    fontSize: 10,
    lineHeight: 14,
  },
  reasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  reasonChip: {
    backgroundColor: Teumta.greenLight,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  reasonChipLabel: {
    color: Teumta.greenDark,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
  },
  radioOn: {
    backgroundColor: Teumta.green,
    borderColor: Teumta.surface,
    borderRadius: 9,
    borderWidth: 4,
    height: 18,
    width: 18,
  },
  radioOff: {
    borderColor: Teumta.border,
    borderRadius: 9,
    borderWidth: 2,
    height: 18,
    width: 18,
  },
  stopsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  stopName: {
    color: Teumta.textSecondary,
    fontSize: 10,
    fontWeight: '500',
    lineHeight: 14,
  },
  stopArrow: {
    color: Teumta.textTertiary,
    fontSize: 10,
    fontWeight: '500',
    lineHeight: 14,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  statTile: {
    backgroundColor: Teumta.greenLight,
    borderRadius: 10,
    flex: 1,
    gap: 1,
    paddingHorizontal: 8,
  },
  statTileSelected: {
    paddingVertical: 7,
  },
  statTileAlternative: {
    paddingVertical: 6,
  },
  statValue: {
    color: Teumta.greenDark,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  statValueAlternative: {
    color: Teumta.greenDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  statLabel: {
    color: Teumta.textSecondary,
    fontSize: 10,
    lineHeight: 13,
  },
  statLabelAlternative: {
    color: Teumta.textSecondary,
    fontSize: 9,
    lineHeight: 12,
  },
  infoBox: {
    backgroundColor: Teumta.greenLight,
    borderRadius: 14,
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  infoTitle: {
    color: Teumta.greenDark,
    fontSize: 10,
    fontWeight: '700',
  },
  infoBody: {
    color: Teumta.textSecondary,
    fontSize: 10,
  },
  stateBox: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  stateText: {
    color: Teumta.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: Teumta.greenLight,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryLabel: {
    color: Teumta.greenDark,
    fontSize: 12,
    fontWeight: '700',
  },
  attribution: {
    marginTop: 2,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: Teumta.surface,
    borderColor: Teumta.border,
    borderRadius: 16,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
  },
  secondaryButtonLabel: {
    color: Teumta.greenDark,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  ctaButton: {
    alignItems: 'center',
    backgroundColor: Teumta.green,
    borderRadius: 16,
    height: 50,
    justifyContent: 'center',
  },
  ctaLabel: {
    color: Teumta.surface,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
});
