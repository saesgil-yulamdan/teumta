import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TourApiAttribution } from '@/components/tour-api-attribution';
import { CourseRouteCard } from '@/components/course-route-card';
import { TeumtaHeader } from '@/components/teumta-header';
import { TeumtaHybrid, TeumtaLayout } from '@/constants/theme';
import { ScreenActionBar, screenActionStyles } from '@/components/screen-action-bar';
import { useCourseLog } from '@/hooks/use-course-log';
import { useGeneratedCourses } from '@/hooks/use-generated-courses';
import { setSelectedCourse } from '@/stores/selected-course';
import { type DestinationIdentifier } from '@/types/course';
import { courseTitle } from '@/utils/course-labels';

/** 서버 지원 가용 시간 선택지(api-spec 3.10). */
const DURATION_OPTIONS = [30, 60, 90] as const;

type DetoursParams = {
  /** 목적지 식별자 — tourApiContentId 또는 tmapPoiId 중 하나. */
  contentId?: string;
  poiId?: string;
  name?: string;
};

export default function DetoursScreen() {
  const { contentId, poiId, name } = useLocalSearchParams<DetoursParams>();
  const router = useRouter();
  const { logViewedCourse } = useCourseLog();

  const [availableMinutes, setAvailableMinutes] =
    useState<(typeof DURATION_OPTIONS)[number]>(60);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [variant, setVariant] = useState(0);

  const identifier = useMemo<DestinationIdentifier | null>(
    () => (contentId ? { contentId } : poiId ? { poiId } : null),
    [contentId, poiId],
  );

  const { destination, courses, status, retryAfterSeconds, reload } = useGeneratedCourses({
    identifier,
    availableMinutes,
    variant,
  });

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
    setSelectedIndex(0);
    setVariant(0);
  };

  const handleRefreshCourses = () => {
    if (status === 'loading') {
      return;
    }
    setSelectedIndex(0);
    setVariant((current) => current + 1);
  };

  const destinationName = destination?.name ?? name ?? '목적지';

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <TeumtaHeader showBack title="틈타 코스" subtitle={`출발·복귀 장소 · ${destinationName}`} />

        <View style={styles.durationBlock}>
          <Text style={styles.durationLabel}>왕복 이동과 머무는 시간을 합해 얼마나 둘러볼까요?</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="둘러볼 시간" style={styles.chipRow}>
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
            <ActivityIndicator color={TeumtaHybrid.navy} />
            <Text style={styles.stateText}>경로 계산 중…</Text>
          </View>
        )}

        {(status === 'error' || status === 'timeout' || status === 'rate-limited') && (
          <View style={styles.stateBox}>
            <Text style={styles.stateText}>
              {status === 'rate-limited'
                ? `코스 요청이 잠시 몰렸어요.${retryAfterSeconds ? ` ${retryAfterSeconds}초 후 다시 시도해 주세요.` : ' 잠시 후 다시 시도해 주세요.'
                }`
                : status === 'timeout'
                  ? '코스 계산이 오래 걸리고 있어요. 잠시 후 다시 시도해 주세요.'
                  : identifier
                    ? '코스를 불러오지 못했어요.'
                    : '목적지 정보가 없어요.'}
            </Text>
            {identifier && (
              <Pressable accessibilityRole="button" accessibilityLabel="코스 다시 시도" style={styles.retryButton} onPress={() => void reload()}>
                <Text style={styles.retryLabel}>다시 시도</Text>
              </Pressable>
            )}
          </View>
        )}

        {status === 'idle' && courses.length === 0 && (
          <View style={styles.stateBox}>
            <Text style={styles.stateText}>
              {availableMinutes < 90 ? `${availableMinutes}분 조건에 맞는 코스가 없어요. 시간을 늘리거나 출발지를 바꿔보세요.` : '90분 조건에도 맞는 코스가 없어요. 출발지를 바꾸거나 주변 장소를 개별로 살펴보세요.'}
            </Text>
          </View>
        )}

        {((status === 'idle' && courses.length === 0) || status === 'error' || status === 'timeout' || status === 'rate-limited') && <View style={styles.durationBlock}>
          <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={() => router.push('/search')}><Text style={styles.secondaryButtonLabel}>다른 출발지 찾기</Text></Pressable>
          {identifier && <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={() => router.push({ pathname: '/places/[id]', params: { id: contentId ?? poiId ?? '', source: contentId ? 'TOUR' : 'TMAP', name: destinationName } })}><Text style={styles.secondaryButtonLabel}>주변 장소 개별로 보기</Text></Pressable>}
        </View>}

        {status === 'idle' && destination && courses.length > 0 && (
          <View accessibilityRole="radiogroup" accessibilityLabel="코스 선택" style={styles.courseList}>
            {courses.map((course, index) => (
              <CourseRouteCard
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
                선택한 장소 주변의 공개 장소·운영정보와 시간 조건으로 구성합니다. 주변이 한적하거나 복귀 시 혼잡이 해소됨을 보장하지 않습니다.
                {'\n'}보행 경로(일부 추정)와 권장 체류시간을 반영한 예상치입니다.
              </Text>
            </View>

            <TourApiAttribution style={styles.attribution} />

            <Pressable style={styles.secondaryButton} onPress={handleRefreshCourses}>
              <Text style={styles.secondaryButtonLabel}>다른 코스 보기</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
      {status === 'idle' && destination && courses[selectedIndex] && (
        <ScreenActionBar>
          <Text style={styles.footerSummary}>선택한 코스 · 약 {courses[selectedIndex].totalMinutes}분</Text>
          <Pressable accessibilityRole="button" style={styles.ctaButton} onPress={handleStart}>
            <Text style={styles.ctaLabel}>선택한 코스 자세히 보기</Text>
            <Text style={styles.ctaArrow}>→</Text>
          </Pressable>
        </ScreenActionBar>
      )}
    </SafeAreaView>
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
    gap: TeumtaLayout.sectionGap,
    paddingBottom: TeumtaLayout.contentBottomPadding,
    paddingHorizontal: TeumtaLayout.screenGutter,
    paddingTop: 18,
  },
  durationBlock: {
    gap: 16,
  },
  courseList: {
    gap: 20,
  },
  durationLabel: {
    color: TeumtaHybrid.ink,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 28,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 10,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TeumtaHybrid.paper,
    borderRadius: 16,
    minHeight: 54,
  },
  chipSelected: {
    backgroundColor: TeumtaHybrid.navy,
  },
  chipLabel: {
    color: TeumtaHybrid.muted,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 24,
  },
  chipLabelSelected: {
    color: TeumtaHybrid.white,
  },
  infoBox: {
    gap: 8,
    paddingHorizontal: 4,
  },
  infoTitle: {
    color: TeumtaHybrid.ink,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 23,
  },
  infoBody: {
    color: TeumtaHybrid.muted,
    fontSize: 13,
    lineHeight: 22,
  },
  stateBox: {
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  stateText: {
    color: TeumtaHybrid.muted,
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: TeumtaHybrid.navy,
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
    minHeight: 48,
  },
  retryLabel: {
    color: TeumtaHybrid.white,
    fontSize: 14,
    fontWeight: '700',
  },
  attribution: {
    marginTop: 2,
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: 12,
  },
  secondaryButtonLabel: {
    color: TeumtaHybrid.navy,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 23,
  },
  ctaButton: {
    ...screenActionStyles.button,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  ctaLabel: { ...screenActionStyles.label },
  footerSummary: {
    color: TeumtaHybrid.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  ctaArrow: {
    color: TeumtaHybrid.white,
    fontSize: 22,
  },
});
