import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CourseMapView } from '@/components/course-map-view';
import { TourApiAttribution } from '@/components/tour-api-attribution';
import { Teumta } from '@/constants/theme';
import { getSelectedCourse } from '@/stores/selected-course';
import { courseDistanceMeters, courseStayMinutes } from '@/types/course';
import { buildCourseRoutePath } from '@/utils/course-path';
import { withRoJosa } from '@/utils/text';
import { timeLabelAfter } from '@/utils/time';

const SHEET_OVERLAP = 26;
const DOT_START = '#FF9175';

export default function CourseMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const selected = getSelectedCourse();

  if (!selected) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>선택한 코스 정보가 없어요.</Text>
        <Pressable style={styles.emptyButton} onPress={() => router.back()}>
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
      dot: Teumta.greenDark,
      // 지도 마커와 같은 번호 — 목록과 지도 대조용
      order: index + 1,
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
        <Pressable style={styles.shareButton} onPress={handleShare}>
          <Text style={styles.shareLabel}>공유</Text>
        </Pressable>
      </View>

      <View style={styles.mapArea}>
        <CourseMapView detour={mapDetour} routePath={buildCourseRoutePath(destination, course)} />
      </View>

      <ScrollView
        style={styles.sheet}
        contentContainerStyle={[styles.sheetContent, { paddingBottom: 18 + insets.bottom }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.sheetHandle} />

        <View style={styles.sheetHeader}>
          <View style={styles.sheetTitleTexts}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {courseName}
            </Text>
            <Text style={styles.sheetSubtitle}>
              총 약 {course.totalMinutes}분 · 도보 약 {distanceLabel}
            </Text>
          </View>
          <View style={styles.returnPill}>
            <Text style={styles.returnPillLabel}>예상 복귀</Text>
            <Text style={styles.returnPillTime}>{returnTimeLabel}</Text>
          </View>
        </View>

        <View style={styles.timeline}>
          {timeline.map((entry) => (
            <View key={entry.key} style={styles.timelineRow}>
              <View style={[styles.timelineDot, { backgroundColor: entry.dot }]}>
                {entry.order !== undefined && (
                  <Text style={styles.timelineDotLabel}>{entry.order}</Text>
                )}
              </View>
              <View style={styles.timelineTexts}>
                <Text style={styles.timelineTitle}>{entry.title}</Text>
                <Text style={styles.timelineSubtitle} numberOfLines={1}>
                  {entry.subtitle}
                </Text>
              </View>
              <Text style={styles.timelineTime}>{entry.time}</Text>
            </View>
          ))}
        </View>

        <View style={styles.statusStrip}>
          <View style={styles.statusColumn}>
            <Text style={styles.statusLabel}>들르는 곳</Text>
            <Text style={styles.statusNow}>{course.stops.length}곳</Text>
          </View>
          <Text style={styles.statusArrow}>·</Text>
          <View style={[styles.statusColumn, styles.statusColumnEnd]}>
            <Text style={styles.statusLabel}>머무는 시간</Text>
            <Text style={styles.statusRecheck}>{courseStayMinutes(course)}분</Text>
          </View>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>복귀 안내</Text>
          <Text style={styles.infoBody}>
            {returnTimeLabel} 복귀를 기준으로 코스를 구성했어요. 걷는 시간은 실제 보행 경로로
            계산했고, 체류시간은 장소 유형을 기준으로 한 예상값이에요.
          </Text>
        </View>

        <TourApiAttribution style={styles.attribution} />

        <Pressable style={styles.ctaButton} onPress={() => router.push('/trip')}>
          <Text style={styles.ctaLabel}>이 코스로 출발하기</Text>
        </Pressable>
      </ScrollView>
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
  attribution: {
    marginTop: 2,
  },
  topBar: {
    alignItems: 'center',
    backgroundColor: Teumta.surface,
    flexDirection: 'row',
    height: 50,
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
  topButtonSaved: {
    backgroundColor: Teumta.greenLight,
    borderColor: Teumta.green,
  },
  topButtonIcon: {
    height: 19,
    width: 19,
  },
  shareButton: {
    alignItems: 'center',
    backgroundColor: Teumta.surface,
    borderColor: Teumta.border,
    borderRadius: 13,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  shareLabel: {
    color: Teumta.greenDark,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  mapArea: {
    height: 256 + SHEET_OVERLAP,
  },
  sheet: {
    backgroundColor: Teumta.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    flex: 1,
    marginTop: -SHEET_OVERLAP,
  },
  sheetContent: {
    gap: 12,
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
  sheetHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  sheetTitleTexts: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  sheetTitle: {
    color: Teumta.textPrimary,
    fontSize: 19,
    fontWeight: '900',
    lineHeight: 27,
  },
  sheetSubtitle: {
    color: Teumta.textSecondary,
    fontSize: 10,
    lineHeight: 14,
  },
  returnPill: {
    alignItems: 'flex-end',
    backgroundColor: Teumta.greenLight,
    borderRadius: 11,
    flexShrink: 0,
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  returnPillLabel: {
    color: Teumta.textSecondary,
    fontSize: 10,
    lineHeight: 13,
  },
  returnPillTime: {
    color: Teumta.greenDark,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  timeline: {
    gap: 6,
  },
  timelineRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  timelineDot: {
    alignItems: 'center',
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  timelineDotLabel: {
    color: Teumta.surface,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 13,
  },
  timelineTexts: {
    flex: 1,
    gap: 1,
  },
  timelineTitle: {
    color: Teumta.textPrimary,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  timelineSubtitle: {
    color: Teumta.textSecondary,
    fontSize: 10,
    lineHeight: 13,
  },
  timelineTime: {
    color: Teumta.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  statusStrip: {
    alignItems: 'center',
    backgroundColor: '#F7FAF7',
    borderRadius: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  statusColumn: {
    gap: 1,
  },
  statusColumnEnd: {
    alignItems: 'flex-end',
  },
  statusLabel: {
    color: Teumta.textTertiary,
    fontSize: 10,
    lineHeight: 13,
  },
  statusNow: {
    color: Teumta.greenDark,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
  },
  statusArrow: {
    color: Teumta.textTertiary,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 21,
  },
  statusRecheck: {
    color: Teumta.greenDark,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  infoBox: {
    backgroundColor: Teumta.greenLight,
    borderRadius: 14,
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  infoTitle: {
    color: Teumta.greenDark,
    fontSize: 11,
    fontWeight: '700',
  },
  infoBody: {
    color: Teumta.textSecondary,
    fontSize: 10,
    lineHeight: 15,
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
