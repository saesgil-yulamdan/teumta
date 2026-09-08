import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlaceThumbnail } from '@/components/place-thumbnail';
import { TeumtaTabBar } from '@/components/teumta-tab-bar';
import { TeumtaHybrid } from '@/constants/theme';
import { useBookmarks } from '@/hooks/use-bookmarks';
import { useCourseLog, type CourseLogEntry } from '@/hooks/use-course-log';
import { setSelectedCourse } from '@/stores/selected-course';
import { dateLabel } from '@/utils/time';

/**
 * 내 여행 탭.
 *
 * 예전에는 탭이 코스 지도 화면으로 바로 갔는데, 코스는 메모리에만 있어서
 * 앱을 껐다 켜면 항상 "선택한 코스 정보가 없어요"만 나왔다. 이제 기기에 남긴
 * 코스 기록과 저장한 목적지를 모아, 언제 들어와도 이어갈 거리를 보여준다.
 */
export default function TripsScreen() {
  const router = useRouter();
  const { entries } = useCourseLog();
  const { places: savedPlaces } = useBookmarks();

  const openEntry = (entry: CourseLogEntry) => {
    // 코스 지도 화면은 메모리 스토어를 읽으므로 스냅샷을 복원해 두고 이동한다.
    setSelectedCourse(entry.selected);
    router.push('/course-map');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>내 여행</Text>
          <Text style={styles.headerSubtitle}>최근 코스와 저장한 목적지</Text>
        </View>

        <Text style={styles.sectionTitle}>최근 본 코스</Text>
        {entries.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              아직 본 코스가 없어요.{'\n'}목적지 상세에서 &apos;틈타 코스 보기&apos;를 누르면
              여기에 쌓여요.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {entries.map((entry) => (
              <Pressable key={entry.key} style={styles.rowCard} onPress={() => openEntry(entry)}>
                <View style={styles.minutesTile}>
                  <Text style={styles.minutesValue}>{entry.selected.course.totalMinutes}</Text>
                  <Text style={styles.minutesUnit}>분</Text>
                </View>
                <View style={styles.rowTexts}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {entry.selected.course.stops.map((stop) => stop.name).join(' · ')}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {entry.selected.destination.name} · {dateLabel(entry.viewedAt)}
                  </Text>
                </View>
                {entry.completedAt !== null && (
                  <View style={styles.doneBadge}>
                    <Text style={styles.doneBadgeLabel}>
                      {entry.completedAll ? '완주' : '다녀옴'}
                    </Text>
                  </View>
                )}
                <Text style={styles.rowChevron}>›</Text>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle}>저장한 목적지에서 시작</Text>
        {savedPlaces.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              목적지 상세에서 북마크해 두면{'\n'}여기서 바로 새 코스를 만들 수 있어요.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {savedPlaces.map((place) => (
              <Pressable
                key={`${place.source}-${place.id}`}
                style={styles.rowCard}
                onPress={() =>
                  router.push({
                    pathname: '/detours',
                    params: {
                      ...(place.source === 'TOUR' ? { contentId: place.id } : { poiId: place.id }),
                      name: place.name,
                    },
                  })
                }>
                <PlaceThumbnail imageUrl={place.imageUrl} variant="card" style={styles.rowThumb} />
                <View style={styles.rowTexts}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {place.name}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {place.address ?? '주소 정보 없음'}
                  </Text>
                </View>
                <View style={styles.startBadge}>
                  <Text style={styles.startBadgeLabel}>코스 만들기</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <TeumtaTabBar active="trips" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: TeumtaHybrid.paper,
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: 18,
    paddingBottom: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  header: {
    gap: 1,
    marginBottom: 2,
  },
  headerTitle: {
    color: TeumtaHybrid.ink,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 28,
  },
  headerSubtitle: {
    color: TeumtaHybrid.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  sectionTitle: {
    borderTopColor: TeumtaHybrid.ink,
    borderTopWidth: 1,
    color: TeumtaHybrid.ink,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 23,
    marginTop: 2,
    paddingTop: 12,
  },
  emptyBox: {
    backgroundColor: TeumtaHybrid.canvas,
    borderLeftColor: TeumtaHybrid.slate,
    borderLeftWidth: 4,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  emptyText: {
    color: TeumtaHybrid.muted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  list: {
    borderTopColor: TeumtaHybrid.line,
    borderTopWidth: 1,
  },
  rowCard: {
    alignItems: 'center',
    borderBottomColor: TeumtaHybrid.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingLeft: 8,
    paddingRight: 10,
    paddingVertical: 10,
  },
  minutesTile: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.signalSoft,
    borderRadius: TeumtaHybrid.radius.small,
    flexDirection: 'row',
    gap: 1,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  minutesValue: {
    color: TeumtaHybrid.navy,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
  },
  minutesUnit: {
    color: TeumtaHybrid.navy,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
    marginTop: 5,
  },
  rowThumb: {
    backgroundColor: TeumtaHybrid.canvas,
    borderRadius: TeumtaHybrid.radius.small,
    height: 52,
    width: 52,
  },
  rowTexts: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    color: TeumtaHybrid.ink,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  rowMeta: {
    color: TeumtaHybrid.muted,
    fontSize: 11,
    lineHeight: 15,
  },
  doneBadge: {
    backgroundColor: TeumtaHybrid.slateSoft,
    borderRadius: TeumtaHybrid.radius.small,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  doneBadgeLabel: {
    color: TeumtaHybrid.slate,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  startBadge: {
    backgroundColor: TeumtaHybrid.signalSoft,
    borderRadius: TeumtaHybrid.radius.small,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  startBadgeLabel: {
    color: TeumtaHybrid.navy,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  rowChevron: {
    color: TeumtaHybrid.faint,
    fontSize: 20,
    fontWeight: '500',
    lineHeight: 28,
  },
});
