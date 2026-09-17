import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CourseMapView } from '@/components/course-map-view';
import { TourApiAttribution } from '@/components/tour-api-attribution';
import { TeumtaHybrid, TeumtaLayout } from '@/constants/theme';
import { ScreenActionBar, screenActionStyles } from '@/components/screen-action-bar';
import { getSelectedCourse, loadSelectedCourse } from '@/stores/selected-course';
import { courseDistanceMeters, courseStayMinutes } from '@/types/course';
import { buildCourseRoutePath } from '@/utils/course-path';
import { withRoJosa } from '@/utils/text';
import { timeLabelAfter } from '@/utils/time';

const DOT_START = TeumtaHybrid.ink;

export default function CourseMapScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState(getSelectedCourse);
  const [loading, setLoading] = useState(!selected);

  useEffect(() => {
    let cancelled = false;
    void loadSelectedCourse().then((value) => {
      if (!cancelled) {
        setSelected(value);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <View style={styles.emptyContainer}><ActivityIndicator color={TeumtaHybrid.navy} accessibilityLabel="코스 불러오는 중" /></View>;
  }

  if (!selected) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>선택한 코스 정보가 없어요.</Text>
        <Pressable style={styles.emptyButton} onPress={() => router.canGoBack() ? router.back() : router.replace('/search')}>
          <Text style={styles.emptyButtonLabel}>코스 다시 고르기</Text>
        </Pressable>
      </View>
    );
  }

  const { course, destination } = selected;
  const distanceLabel = `${(courseDistanceMeters(course) / 1000).toFixed(1)}km`;
  const returnTimeLabel = timeLabelAfter(course.totalMinutes);
  const courseName = course.stops.map((stop) => stop.name).join(' · ');

  // 같이 갈 사람에게 보내는 텍스트 요약. 코스는 서버에 없어 링크가 불가능하다 — 내용 전체를 담는다.
  const handleShare = () => {
    const stopNames = course.stops.map((stop) => stop.name).join(' → ');
    void Share.share({
      message: [
        `${destination.name} 틈타 코스`,
        `${stopNames} → ${destination.name} 복귀`,
        `총 약 ${course.totalMinutes}분 · 도보 약 ${distanceLabel}`,
        '',
        '붐비는 시간은 비켜가고, 여행은 그대로 — 틈타',
      ].join('\n'),
    }).catch(() => {
      // 공유 시트를 못 열어도 화면은 그대로
    });
  };

  // 지도용 경로: 목적지 → 정류지들 → 목적지(복귀)
  const mapDetour = {
    id: 'generated',
    name: courseName,
    durationMinutes: course.totalMinutes,
    distanceKm: courseDistanceMeters(course) / 1000,
    description: '',
    coordinates: [
      { latitude: destination.latitude, longitude: destination.longitude },
      ...course.stops.map((stop) => ({ latitude: stop.latitude, longitude: stop.longitude })),
      { latitude: destination.latitude, longitude: destination.longitude },
    ],
    stops: [
      destination.name,
      ...course.stops.map((stop) => stop.name),
      `${destination.name} 복귀`,
    ],
  };

  // 정류지 도착 시각 = 앞선 정류지들의 (이동+체류) + 이번 구간 이동
  const arrivalMinutes = course.stops.map(
    (stop, index) =>
      course.stops
        .slice(0, index)
        .reduce(
          (total, previous) => total + previous.travelMinutesFromPrevious + previous.stayMinutes,
          0,
        ) + stop.travelMinutesFromPrevious,
  );

  const timeline: {
    key: string;
    dot: string;
    order?: number;
    title: string;
    subtitle: string;
    time: string;
    imageUrl?: string | null;
  }[] = [
    {
      key: 'start',
      dot: DOT_START,
      title: `${destination.name} 앞 출발`,
      subtitle: course.stops[0]
        ? `${course.stops[0].name}까지 도보 ${course.stops[0].travelMinutesFromPrevious}분`
        : '코스를 따라 이동',
      time: timeLabelAfter(0),
    },
    ...course.stops.map((stop, index) => ({
      key: `${stop.name}-${stop.latitude}`,
      dot: TeumtaHybrid.navy,
      // 지도 마커와 같은 번호 — 목록과 지도 대조용
      order: index + 1,
      imageUrl: stop.imageUrl,
      title: stop.name,
      subtitle: `권장 체류 ${stop.stayMinutes}분${stop.address ? ` · ${stop.address}` : ''}`,
      time: timeLabelAfter(arrivalMinutes[index]),
    })),
    {
      key: 'return',
      dot: DOT_START,
      title: `${withRoJosa(destination.name)} 복귀`,
      subtitle: `도보 ${course.returnTravelMinutes}분 · 복귀 전 최신 혼잡도 확인`,
      time: returnTimeLabel,
    },
  ];

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로 가기" style={styles.topButton}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/search')}>
          <Image source={require('@/assets/images/icons/back.svg')} style={styles.topButtonIcon} contentFit="contain" />
        </Pressable>
        <Text style={styles.navigationTitle}>코스 상세</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="코스 공유" style={styles.shareButton} onPress={handleShare}>
          <Text style={styles.shareLabel}>공유</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.mapArea}>
          <CourseMapView detour={mapDetour} routePath={buildCourseRoutePath(destination, course)} />
        </View>
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>{destination.name} 주변</Text>
          <Text style={styles.courseTitle}>{courseName || '주변을 걷는 코스'}</Text>
          <Text style={styles.description}>잠깐 들렀다, 다시 목적지로 돌아오는 여행</Text>
          <View style={styles.metrics}>
            {[
              { value: `${course.totalMinutes}분`, label: '총 소요 시간' },
              { value: distanceLabel, label: '걷는 거리' },
              { value: `${courseStayMinutes(course)}분`, label: '추천 체류' },
            ].map((metric) => (
              <View key={metric.label} style={styles.metric}>
                <Text style={styles.metricValue}>{metric.value}</Text>
                <Text style={styles.metricLabel}>{metric.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.itinerary}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>이렇게 걸어요</Text>
            <Text style={styles.sectionMeta}>{course.stops.length}곳 방문</Text>
          </View>
          <View>
            {timeline.map((entry, index) => (
              <View key={entry.key} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View style={[styles.timelineDot, { backgroundColor: entry.dot }]}>
                    <Text style={styles.timelineDotLabel}>{entry.order ?? (index === 0 ? '출' : '도')}</Text>
                  </View>
                  {index < timeline.length - 1 && <View style={styles.timelineLine} />}
                </View>
                <View style={styles.timelineTexts}>
                  <Text style={styles.timelineTime}>{entry.time} {index === 0 ? '출발' : '도착 예정'}</Text>
                  <Text style={styles.timelineTitle}>{entry.title}</Text>
                  <Text style={styles.timelineSubtitle}>{entry.subtitle}</Text>
                </View>
                {entry.imageUrl && (
                  <Image source={{ uri: entry.imageUrl }} recyclingKey={entry.imageUrl} contentFit="cover" style={styles.stopPhoto} />
                )}
              </View>
            ))}
          </View>
          <Text style={styles.infoBody}>
            {course.verified
              ? '실제 보행 경로와 추천 체류시간을 반영했어요. 현장 상황에 따라 소요시간이 달라질 수 있어요.'
              : '일부 이동 구간은 추정한 시간이에요. 출발 전 현장 경로를 확인해 주세요.'}
          </Text>
          <TourApiAttribution />
        </View>
      </ScrollView>

      <ScreenActionBar>
        <Text style={styles.returnText}>지금 출발하면 <Text style={styles.returnTime}>{returnTimeLabel}</Text> 복귀 예상</Text>
        <Pressable accessibilityRole="button" style={styles.ctaButton} onPress={() => router.push('/trip')}>
          <Text style={styles.ctaLabel}>이 코스로 출발하기</Text>
          <Text style={styles.ctaArrow}>→</Text>
        </Pressable>
      </ScreenActionBar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: TeumtaHybrid.canvas,
    flex: 1,
  },
  emptyContainer: {
    backgroundColor: TeumtaHybrid.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    padding: 24,
  },
  emptyText: {
    color: TeumtaHybrid.muted,
    fontSize: 16,
    lineHeight: 24,
  },
  emptyButton: {
    backgroundColor: TeumtaHybrid.navy,
    borderRadius: 16,
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  emptyButtonLabel: {
    color: TeumtaHybrid.white,
    fontSize: 15,
    fontWeight: '700',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: TeumtaLayout.screenGutter,
    paddingVertical: 10,
    gap: 12,
  },
  topButton: {
    backgroundColor: TeumtaHybrid.canvas,
    borderRadius: 22,
    height: 44,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topButtonIcon: {
    height: 20,
    width: 20,
  },
  navigationTitle: {
    color: TeumtaHybrid.ink,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 26,
  },
  shareButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareLabel: {
    color: TeumtaHybrid.navy,
    fontSize: 14,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingTop: 8,
    paddingBottom: TeumtaLayout.contentBottomPadding,
    gap: TeumtaLayout.sectionGap,
  },
  mapArea: {
    height: 248,
    marginHorizontal: TeumtaLayout.screenGutter,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: TeumtaHybrid.canvas,
  },
  intro: {
    paddingHorizontal: TeumtaLayout.screenGutter,
    gap: 8,
  },
  eyebrow: {
    color: TeumtaHybrid.navy,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  courseTitle: {
    color: TeumtaHybrid.ink,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.7,
    lineHeight: 38,
  },
  description: {
    color: TeumtaHybrid.muted,
    fontSize: 14,
    lineHeight: 23,
  },
  metrics: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  metric: {
    flex: 1,
    gap: 5,
  },
  metricValue: {
    color: TeumtaHybrid.ink,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 30,
  },
  metricLabel: {
    color: TeumtaHybrid.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  itinerary: {
    paddingHorizontal: TeumtaLayout.screenGutter,
    gap: 20,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: {
    color: TeumtaHybrid.ink,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 28,
  },
  sectionMeta: {
    color: TeumtaHybrid.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  timelineRail: {
    alignItems: 'center',
    width: 30,
  },
  timelineDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotLabel: {
    color: TeumtaHybrid.white,
    fontSize: 12,
    fontWeight: '700',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: TeumtaHybrid.line,
    marginVertical: 5,
  },
  timelineTexts: {
    flex: 1,
    gap: 5,
    paddingBottom: 28,
  },
  timelineTime: {
    color: TeumtaHybrid.navy,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  timelineTitle: {
    color: TeumtaHybrid.ink,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 25,
  },
  timelineSubtitle: {
    color: TeumtaHybrid.muted,
    fontSize: 13,
    lineHeight: 21,
  },
  stopPhoto: {
    width: 60,
    height: 60,
    borderRadius: 4,
  },
  infoBody: {
    color: TeumtaHybrid.muted,
    fontSize: 13,
    lineHeight: 22,
  },
  returnText: {
    color: TeumtaHybrid.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  returnTime: {
    color: TeumtaHybrid.ink,
    fontWeight: '800',
  },
  ctaButton: {
    ...screenActionStyles.button,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  ctaLabel: { ...screenActionStyles.label },
  ctaArrow: {
    color: TeumtaHybrid.white,
    fontSize: 22,
  },
});
