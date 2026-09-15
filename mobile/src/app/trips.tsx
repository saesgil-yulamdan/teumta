import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { PlaceThumbnail } from '@/components/place-thumbnail';
import { ScreenSection } from '@/components/screen-section';
import { TeumtaHeader } from '@/components/teumta-header';
import { TeumtaTabBar } from '@/components/teumta-tab-bar';
import { TeumtaHybrid } from '@/constants/theme';
import { useBookmarks } from '@/hooks/use-bookmarks';
import { useCourseLog, type CourseLogEntry } from '@/hooks/use-course-log';
import { loadSelectedCourse, setSelectedCourse, type SelectedCourse } from '@/stores/selected-course';
import { dateLabel } from '@/utils/time';

export default function TripsScreen() {
  const router = useRouter();
  const { entries } = useCourseLog();
  const { places: savedPlaces } = useBookmarks();
  const [activeCourse, setActiveCourse] = useState<SelectedCourse | null>(null);

  useFocusEffect(useCallback(() => {
    let ignored = false;
    void loadSelectedCourse().then((value) => { if (!ignored) setActiveCourse(value); });
    return () => { ignored = true; };
  }, []));

  const openEntry = (entry: CourseLogEntry) => {
    setSelectedCourse(entry.selected);
    router.push('/course-map');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TeumtaHeader title="내 여행" subtitle="다음 발걸음을 여기서 이어가세요." />

        {activeCourse && (
          <Pressable accessibilityRole="button" accessibilityLabel="선택한 코스 이어보기" style={styles.resume}
            onPress={() => router.push('/course-map')}>
            <Text style={styles.resumeEyebrow}>이어서 둘러보기</Text>
            <Text style={styles.resumeTitle}>{activeCourse.destination.name}</Text>
            <Text style={styles.resumeRoute} numberOfLines={2}>
              {activeCourse.course.stops.map((stop) => stop.name).join(' → ')}
            </Text>
            <View style={styles.resumeFooter}>
              <Text style={styles.resumeMeta}>{activeCourse.course.totalMinutes}분 · {activeCourse.course.stops.length}곳 방문</Text>
              <Text style={styles.resumeAction}>코스 이어보기 →</Text>
            </View>
          </Pressable>
        )}

        <ScreenSection title="최근 본 코스" meta={`${entries.length}개`}>
          {entries.length === 0 ? (
            <EmptyState title="여행의 첫 코스를 골라보세요" description="목적지를 고르고 잠깐 둘러볼 코스를 만들면 여기에 모아둘게요."
              actionLabel="목적지 찾기" onAction={() => router.push('/search')} />
          ) : (
            <View style={styles.list}>
              {entries.map((entry) => (
                <Pressable key={entry.key} accessibilityRole="button" style={styles.row} onPress={() => openEntry(entry)}>
                  <View style={styles.minutesTile}>
                    <Text style={styles.minutesValue}>{entry.selected.course.totalMinutes}</Text>
                    <Text style={styles.minutesUnit}>분 코스</Text>
                  </View>
                  <View style={styles.rowTexts}>
                    <Text style={styles.rowTitle}>{entry.selected.destination.name}</Text>
                    <Text style={styles.rowMeta} numberOfLines={2}>{entry.selected.course.stops.map((stop) => stop.name).join(' · ')}</Text>
                    <Text style={styles.rowCaption}>
                      {dateLabel(entry.viewedAt)}{entry.completedAt !== null ? ` · ${entry.completedAll ? '완주' : '다녀옴'}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
            </View>
          )}
        </ScreenSection>

        <ScreenSection title="저장한 곳에서 시작" meta={`${savedPlaces.length}곳`}>
          {savedPlaces.length === 0 ? (
            <EmptyState title="마음에 드는 장소를 저장하세요" description="장소 상세에서 북마크하면 다음 여행의 출발점으로 고를 수 있어요."
              actionLabel="장소 둘러보기" onAction={() => router.push('/search')} />
          ) : (
            <View style={styles.list}>
              {savedPlaces.map((place) => (
                <Pressable key={`${place.source}-${place.id}`} accessibilityRole="button" style={styles.row}
                  onPress={() => router.push({
                    pathname: '/detours',
                    params: { ...(place.source === 'TOUR' ? { contentId: place.id } : { poiId: place.id }), name: place.name },
                  })}>
                  <PlaceThumbnail imageUrl={place.imageUrl} variant="card" style={styles.thumb} />
                  <View style={styles.rowTexts}>
                    <Text style={styles.rowTitle}>{place.name}</Text>
                    <Text style={styles.rowMeta} numberOfLines={2}>{place.address ?? '주소 정보 없음'}</Text>
                    <Text style={styles.actionLabel}>이곳에서 코스 만들기</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
            </View>
          )}
        </ScreenSection>
      </ScrollView>
      <TeumtaTabBar active="trips" />
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
    gap: 32,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 32,
  },
  resume: {
    backgroundColor: TeumtaHybrid.navy,
    borderRadius: 24,
    padding: 24,
    gap: 10,
  },
  resumeEyebrow: {
    color: TeumtaHybrid.white,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 20,
  },
  resumeTitle: {
    color: TeumtaHybrid.white,
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 36,
  },
  resumeRoute: {
    color: TeumtaHybrid.white,
    fontSize: 14,
    lineHeight: 23,
  },
  resumeFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
  },
  resumeMeta: {
    color: TeumtaHybrid.white,
    fontSize: 13,
    lineHeight: 20,
  },
  resumeAction: {
    color: TeumtaHybrid.white,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 23,
  },
  list: {
    gap: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 84,
  },
  rowTexts: {
    flex: 1,
    gap: 5,
  },
  rowTitle: {
    color: TeumtaHybrid.ink,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 25,
  },
  rowMeta: {
    color: TeumtaHybrid.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  rowCaption: {
    color: TeumtaHybrid.faint,
    fontSize: 12,
    lineHeight: 19,
  },
  minutesTile: {
    backgroundColor: TeumtaHybrid.navySoft,
    borderRadius: 18,
    width: 72,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  minutesValue: {
    color: TeumtaHybrid.navy,
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 34,
  },
  minutesUnit: {
    color: TeumtaHybrid.navy,
    fontSize: 12,
    lineHeight: 18,
  },
  thumb: {
    width: 76,
    height: 76,
    backgroundColor: TeumtaHybrid.line,
    borderRadius: 4,
  },
  actionLabel: {
    color: TeumtaHybrid.navy,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 21,
  },
  chevron: {
    color: TeumtaHybrid.faint,
    fontSize: 24,
  },
});
