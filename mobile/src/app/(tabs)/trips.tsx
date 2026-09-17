import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActiveTripCard } from '@/components/active-trip-card';
import { EmptyState } from '@/components/empty-state';
import { PlaceThumbnail } from '@/components/place-thumbnail';
import { ScreenSection } from '@/components/screen-section';
import { TeumtaHeader } from '@/components/teumta-header';
import { TeumtaHybrid, TeumtaLayout } from '@/constants/theme';
import { useBookmarks } from '@/hooks/use-bookmarks';
import { useCourseLog, type CourseLogEntry } from '@/hooks/use-course-log';
import { setSelectedCourse } from '@/stores/selected-course';
import { dateLabel } from '@/utils/time';

const SECTIONS = [
  { key: 'current', label: '진행·최근' },
  { key: 'saved', label: '저장한 장소' },
  { key: 'history', label: '다녀온 코스' },
] as const;

export default function TripsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const section = SECTIONS.find((item) => item.key === params.section)?.key ?? 'current';
  const { entries, completedEntries, ready: logReady } = useCourseLog();
  const { places: savedPlaces, ready: bookmarksReady } = useBookmarks();
  const recentEntries = entries.filter((entry) => entry.completedAt === null);

  const openEntry = (entry: CourseLogEntry) => {
    setSelectedCourse(entry.selected);
    router.push('/course-map');
  };
  const renderCourse = (entry: CourseLogEntry) => (
    <Pressable key={entry.key} accessibilityRole="button" style={styles.row} onPress={() => openEntry(entry)}>
      <View style={styles.minutesTile}>
        <Text style={styles.minutesValue}>{entry.selected.course.totalMinutes}</Text>
        <Text style={styles.minutesUnit}>분 코스</Text>
      </View>
      <View style={styles.rowTexts}>
        <Text style={styles.rowTitle}>{entry.selected.destination.name}</Text>
        <Text style={styles.rowMeta} numberOfLines={2}>{entry.selected.course.stops.map((stop) => stop.name).join(' · ')}</Text>
        <Text style={styles.rowCaption}>
          {dateLabel(entry.completedAt ?? entry.viewedAt)}
          {entry.completedAt !== null ? entry.completedAll ? ' · 완주' : ' · 다녀옴' : ' · 최근 열람'}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <TeumtaHeader title="내 여행" />
        <View style={styles.segments} accessibilityRole="tablist">
          {SECTIONS.map((item) => (
            <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: section === item.key }}
              onPress={() => router.setParams({ section: item.key })}
              style={[styles.segment, section === item.key && styles.segmentSelected]}>
              <Text style={[styles.segmentLabel, section === item.key && styles.segmentLabelSelected]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <ScrollView key={section} style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {section === 'current' && (
          <>
            <ActiveTripCard showEmpty />
            <ScreenSection title="최근 본 코스" meta={logReady ? `${recentEntries.length}개` : undefined}>
              {!logReady ? <Text style={styles.rowMeta}>코스를 불러오고 있어요.</Text> : recentEntries.length === 0 ? (
                <Text style={styles.rowMeta}>최근 본 코스가 없습니다.</Text>
              ) : <View style={styles.list}>{recentEntries.map(renderCourse)}</View>}
            </ScreenSection>
          </>
        )}
        {section === 'saved' && (
          <ScreenSection title="저장한 장소" meta={bookmarksReady ? `${savedPlaces.length}곳` : undefined}>
            {!bookmarksReady ? <Text style={styles.rowMeta}>저장한 장소를 불러오고 있어요.</Text> : savedPlaces.length === 0 ? (
              <EmptyState title="저장한 장소가 없습니다"
                description="장소 상세에서 북마크로 저장하세요."
                actionLabel="장소 둘러보기" onAction={() => router.navigate('/search')} />
            ) : (
              <View style={styles.list}>
                {savedPlaces.map((place) => (
                  <View key={`${place.source}-${place.id}`} style={styles.savedCard}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`${place.name} 상세 보기`} style={styles.savedRow}
                      onPress={() => router.push({
                        pathname: '/places/[id]',
                        params: {
                          id: place.id, source: place.source, name: place.name,
                          ...(place.address ? { address: place.address } : {}),
                          ...(place.imageUrl ? { imageUrl: place.imageUrl } : {}),
                        },
                      })}>
                      <PlaceThumbnail imageUrl={place.imageUrl} variant="card" style={styles.thumb} />
                      <View style={styles.rowTexts}>
                        <Text style={styles.rowTitle}>{place.name}</Text>
                        <Text style={styles.rowMeta} numberOfLines={2}>{place.address ?? '주소 정보 없음'}</Text>
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`${place.name}에서 코스 만들기`} style={styles.courseButton}
                      onPress={() => router.push({
                        pathname: '/detours',
                        params: { ...(place.source === 'TOUR' ? { contentId: place.id } : { poiId: place.id }), name: place.name },
                      })}>
                      <Text style={styles.actionLabel}>코스 만들기 →</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </ScreenSection>
        )}
        {section === 'history' && (
          <ScreenSection title="다녀온 코스" meta={logReady ? `${completedEntries.length}개` : undefined}>
            {!logReady ? <Text style={styles.rowMeta}>기록을 불러오고 있어요.</Text> : completedEntries.length === 0 ? (
              <EmptyState title="다녀온 코스가 없습니다" description="여행을 마치면 여기에 기록됩니다."
                actionLabel="목적지 찾기" onAction={() => router.navigate('/search')} />
            ) : <View style={styles.list}>{completedEntries.map(renderCourse)}</View>}
          </ScreenSection>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: TeumtaHybrid.paper },
  scroll: { flex: 1 },
  header: { paddingHorizontal: TeumtaLayout.screenGutter, paddingTop: 12, paddingBottom: 16, gap: 16 },
  content: { gap: 24, paddingHorizontal: TeumtaLayout.screenGutter, paddingBottom: TeumtaLayout.contentBottomPadding },
  segments: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: TeumtaHybrid.line },
  segment: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', padding: 6 },
  segmentSelected: { borderBottomColor: TeumtaHybrid.ink },
  segmentLabel: { color: TeumtaHybrid.muted, fontSize: 13, lineHeight: 20, fontWeight: '600', textAlign: 'center' },
  segmentLabelSelected: { color: TeumtaHybrid.ink, fontWeight: '700' },
  list: { gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: TeumtaHybrid.line },
  savedCard: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: TeumtaHybrid.line },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowTexts: { flex: 1, gap: 5 },
  rowTitle: { color: TeumtaHybrid.ink, fontSize: 16, fontWeight: '700', lineHeight: 24 },
  rowMeta: { color: TeumtaHybrid.muted, fontSize: 13, lineHeight: 20 },
  rowCaption: { color: TeumtaHybrid.muted, fontSize: 12, lineHeight: 18 },
  minutesTile: { backgroundColor: TeumtaHybrid.canvas, borderRadius: 8, width: 64, minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: 2 },
  minutesValue: { color: TeumtaHybrid.ink, fontSize: 24, fontWeight: '800', lineHeight: 32 },
  minutesUnit: { color: TeumtaHybrid.muted, fontSize: 11, lineHeight: 17 },
  thumb: { width: 64, height: 64, borderRadius: 8 },
  chevron: { color: TeumtaHybrid.faint, fontSize: 24 },
  courseButton: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: TeumtaHybrid.line, minHeight: 46, justifyContent: 'center', paddingHorizontal: 14 },
  actionLabel: { color: TeumtaHybrid.navy, fontSize: 13, fontWeight: '700', lineHeight: 20 },
});
