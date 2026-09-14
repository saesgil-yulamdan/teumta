import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TourApiAttribution } from '@/components/tour-api-attribution';
import { CourseRouteCard } from '@/components/course-route-card';
import { Fonts, TeumtaHybrid } from '@/constants/theme';
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
  const insets = useSafeAreaInsets();
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

        {(status === 'error' || status === 'timeout' || status === 'rate-limited') && (
          <View style={styles.stateBox}>
            <Text style={styles.stateText}>
              {status === 'rate-limited'
                ? `코스 요청이 잠시 몰렸어요.${
                    retryAfterSeconds ? ` ${retryAfterSeconds}초 후 다시 시도해 주세요.` : ' 잠시 후 다시 시도해 주세요.'
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
              {availableMinutes}분 코스가 없어요. 시간을 늘려보세요.
            </Text>
          </View>
        )}

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
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 14,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.paper,
    borderRadius: 12,
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
    backgroundColor: TeumtaHybrid.paper,
    borderColor: TeumtaHybrid.line,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  courseList: {
    gap: 16,
  },
  durationLabel: {
    color: TeumtaHybrid.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    lineHeight: 15,
  },
  chipRow: {
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.paper,
    borderColor: TeumtaHybrid.line,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
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
    borderRadius: 16,
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
    borderRadius: 10,
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
    borderRadius: 12,
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
    borderRadius: 12,
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
