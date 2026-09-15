import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlaceThumbnail } from '@/components/place-thumbnail';
import { ReportModal } from '@/components/report-modal';
import { TeumtaHeader } from '@/components/teumta-header';
import { TeumtaTabBar } from '@/components/teumta-tab-bar';
import { TeumtaHybrid } from '@/constants/theme';
import { useBookmarks } from '@/hooks/use-bookmarks';
import { useCourseLog, type CourseLogEntry } from '@/hooks/use-course-log';
import { setSelectedCourse } from '@/stores/selected-course';
import { clearRecentSearchesStorage } from '@/utils/recent-searches';
import { dateLabel } from '@/utils/time';

/** 스토어 심사용 지원 페이지(web/README.md). FAQ·문의처·개인정보처리방침이 있다. */
const SUPPORT_URL = 'https://saesgil-yulamdan.github.io/teumta/';
const PRIVACY_URL = 'https://saesgil-yulamdan.github.io/teumta/privacy.html';

export default function MyScreen() {
  const router = useRouter();
  const { places: savedPlaces, clearBookmarks } = useBookmarks();
  const { completedEntries, clearCourseLog } = useCourseLog();
  const [showReport, setShowReport] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const confirmClear = () => {
    Alert.alert('저장 데이터 삭제', '저장한 장소, 코스 기록, 최근 검색어가 모두 삭제됩니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          clearBookmarks();
          clearCourseLog();
          clearRecentSearchesStorage();
        },
      },
    ]);
  };

  const openEntry = (entry: CourseLogEntry) => {
    // 코스 지도 화면은 메모리 스토어를 읽으므로 스냅샷을 복원해 두고 이동한다.
    setSelectedCourse(entry.selected);
    router.push('/course-map');
  };

  // 분산 참여 통계 — 전부 기기 안 기록의 집계라 서버 전송·수집 없음("측정하지 않는 설계" 유지).
  const now = new Date();
  const monthlyEntries = completedEntries.filter((entry) => {
    const at = new Date(entry.completedAt ?? '');
    return (
      !Number.isNaN(at.getTime()) &&
      at.getFullYear() === now.getFullYear() &&
      at.getMonth() === now.getMonth()
    );
  });
  // 월초에 0으로 비어 보이지 않게, 이번 달 기록이 없으면 누적으로 보여준다.
  const statsEntries = monthlyEntries.length > 0 ? monthlyEntries : completedEntries;
  const statsLabel = monthlyEntries.length > 0 ? '이번 달' : '지금까지';
  const statsLocalCount = new Set(
    statsEntries.flatMap((entry) => entry.selected.course.stops.map((stop) => stop.name)),
  ).size;
  const statsMinutes = statsEntries.reduce(
    (total, entry) => total + entry.selected.course.totalMinutes,
    0,
  );

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TeumtaHeader title="마이" subtitle="여행의 취향과 기록을 모아두세요." />

        <View style={styles.summary}>
          <Text style={styles.summaryCaption}>{statsLabel} 나의 여행</Text>
          <Text style={styles.summaryTitle}>차곡차곡 쌓이는 발걸음</Text>
          <View style={styles.statsRow}>
            {[
              { value: statsEntries.length, unit: '번', label: '다녀온 코스' },
              { value: statsLocalCount, unit: '곳', label: '들른 장소' },
              { value: statsMinutes, unit: '분', label: '여행한 시간' },
            ].map((stat) => (
              <View key={stat.label} style={styles.statsColumn}>
                <Text style={styles.statsValue}>{stat.value}<Text style={styles.statsUnit}> {stat.unit}</Text></Text>
                <Text style={styles.statsLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>저장한 장소</Text>
            <Text style={styles.sectionCount}>{savedPlaces.length}곳</Text>
          </View>
          {savedPlaces.length === 0 ? (
            <View style={styles.emptyBox}>
              <View style={styles.emptyIcon}>
                <Image source={require('@/assets/images/icons/bookmark.svg')} style={styles.icon} contentFit="contain" />
              </View>
              <Text style={styles.emptyTitle}>다음에 가고 싶은 곳을 모아보세요</Text>
              <Text style={styles.emptyText}>장소 상세에서 북마크를 누르면{ '\n' }여기에서 다시 찾을 수 있어요.</Text>
              <Link href="/search" asChild>
                <Pressable accessibilityRole="button" style={styles.discoverButton}>
                  <Text style={styles.discoverLabel}>장소 둘러보기</Text>
                </Pressable>
              </Link>
            </View>
          ) : (
            <View style={styles.list}>
              {savedPlaces.map((place) => (
                <Link
                  key={`${place.source}-${place.id}`}
                  href={{
                    pathname: '/places/[id]',
                    params: {
                      id: place.id, source: place.source, name: place.name,
                      ...(place.address ? { address: place.address } : {}),
                      ...(place.imageUrl ? { imageUrl: place.imageUrl } : {}),
                    },
                  }} asChild>
                  <Pressable accessibilityRole="button" style={styles.rowCard}>
                    <PlaceThumbnail imageUrl={place.imageUrl} variant="card" style={styles.rowThumb} />
                    <View style={styles.rowTexts}>
                      <Text style={styles.rowName}>{place.name}</Text>
                      <Text style={styles.rowMeta} numberOfLines={2}>{place.address ?? '주소 정보 없음'}</Text>
                    </View>
                    <Text style={styles.rowChevron}>›</Text>
                  </Pressable>
                </Link>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showCompleted }}
            onPress={() => setShowCompleted((value) => !value)} style={styles.historyButton}>
            <View style={styles.rowTexts}>
              <Text style={styles.sectionTitle}>다녀온 코스</Text>
              <Text style={styles.rowMeta}>완료한 여행 {completedEntries.length}개</Text>
            </View>
            <Text style={styles.historyAction}>{showCompleted ? '접기 −' : '기록 보기 +'}</Text>
          </Pressable>
          {showCompleted && (completedEntries.length === 0 ? (
            <Text style={styles.emptyText}>아직 완료한 코스가 없어요. 코스를 마치면 여기에 기록돼요.</Text>
          ) : (
            <View style={styles.list}>
              {completedEntries.map((entry) => (
                <Pressable key={entry.key} accessibilityRole="button" style={styles.rowCard} onPress={() => openEntry(entry)}>
                  <View style={styles.minutesTile}>
                    <Text style={styles.minutesValue}>{entry.selected.course.totalMinutes}</Text>
                    <Text style={styles.minutesUnit}>분 코스</Text>
                  </View>
                  <View style={styles.rowTexts}>
                    <Text style={styles.rowName} numberOfLines={2}>{entry.selected.course.stops.map((stop) => stop.name).join(' · ')}</Text>
                    <Text style={styles.rowMeta}>{entry.selected.destination.name} · {dateLabel(entry.completedAt ?? entry.viewedAt)}</Text>
                    <Text style={styles.completionLabel}>{entry.completedAll ? '완주' : '다녀옴'}</Text>
                  </View>
                  <Text style={styles.rowChevron}>›</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>설정과 도움</Text>
          <View style={styles.settingsGroup}>
            <Pressable accessibilityRole="button" style={styles.settingRow} onPress={() => setShowReport(true)}>
              <Text style={styles.settingLabel}>버그·의견 보내기</Text><Text style={styles.rowChevron}>›</Text>
            </Pressable>
            <Pressable accessibilityRole="link" style={styles.settingRow} onPress={() => void Linking.openURL(SUPPORT_URL)}>
              <Text style={styles.settingLabel}>지원·문의</Text><Text style={styles.rowChevron}>›</Text>
            </Pressable>
            <Pressable accessibilityRole="link" style={styles.settingRow} onPress={() => void Linking.openURL(PRIVACY_URL)}>
              <Text style={styles.settingLabel}>개인정보처리방침</Text><Text style={styles.rowChevron}>›</Text>
            </Pressable>
          </View>
          <View style={styles.privacyNote}>
            <Text style={styles.noteTitle}>내 기기에 보관되는 여행 기록</Text>
            <Text style={styles.noteText}>이동 경로, 저장 장소, 코스 기록을 서버로 보내지 않습니다.</Text>
            <Pressable accessibilityRole="button" onPress={confirmClear} style={styles.deleteButton}>
              <Text style={styles.dangerAction}>저장 데이터 전체 삭제</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.appInfo}>
          <Text style={styles.noteText}>틈타 · 버전 {Constants.expoConfig?.version ?? '1.0.0'}</Text>
          <Text style={styles.noteText}>한국관광공사 · SK open API · TMAP</Text>
        </View>
      </ScrollView>
      <ReportModal visible={showReport} onClose={() => setShowReport(false)} kind="app" />
      <TeumtaTabBar active="my" />
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
  summary: {
    backgroundColor: TeumtaHybrid.navy,
    borderRadius: 24,
    padding: 24,
    gap: 8,
  },
  summaryCaption: {
    color: TeumtaHybrid.white,
    fontSize: 13,
    lineHeight: 20,
  },
  summaryTitle: {
    color: TeumtaHybrid.white,
    fontSize: 21,
    fontWeight: '800',
    lineHeight: 30,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    flexWrap: 'wrap',
  },
  statsColumn: {
    flex: 1,
    minWidth: 70,
    gap: 6,
  },
  statsValue: {
    color: TeumtaHybrid.white,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 38,
  },
  statsUnit: {
    fontSize: 13,
    fontWeight: '500',
  },
  statsLabel: {
    color: TeumtaHybrid.white,
    fontSize: 12,
    lineHeight: 18,
  },
  section: {
    gap: 16,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: TeumtaHybrid.ink,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 28,
  },
  sectionCount: {
    color: TeumtaHybrid.navy,
    fontSize: 14,
    fontWeight: '700',
  },
  emptyBox: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.paper,
    borderRadius: 22,
    gap: 12,
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 52,
    height: 52,
    backgroundColor: TeumtaHybrid.navySoft,
    borderRadius: 26,
    marginBottom: 4,
  },
  icon: {
    height: 24,
    width: 24,
  },
  emptyTitle: {
    color: TeumtaHybrid.ink,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 24,
    textAlign: 'center',
  },
  emptyText: {
    color: TeumtaHybrid.muted,
    fontSize: 14,
    lineHeight: 23,
    textAlign: 'center',
  },
  discoverButton: {
    backgroundColor: TeumtaHybrid.navySoft,
    borderRadius: 14,
    paddingHorizontal: 22,
    paddingVertical: 13,
    marginTop: 4,
    minHeight: 48,
  },
  discoverLabel: {
    color: TeumtaHybrid.navy,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 22,
  },
  list: {
    gap: 16,
  },
  rowCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 4,
    minHeight: 80,
  },
  rowThumb: {
    backgroundColor: TeumtaHybrid.line,
    borderRadius: 4,
    height: 72,
    width: 72,
  },
  rowTexts: {
    flex: 1,
    gap: 5,
  },
  rowName: {
    color: TeumtaHybrid.ink,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 24,
  },
  rowMeta: {
    color: TeumtaHybrid.muted,
    fontSize: 13,
    lineHeight: 21,
  },
  rowChevron: {
    color: TeumtaHybrid.faint,
    fontSize: 24,
    lineHeight: 30,
  },
  historyButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 64,
  },
  historyAction: {
    color: TeumtaHybrid.navy,
    fontSize: 13,
    fontWeight: '700',
  },
  minutesTile: {
    backgroundColor: TeumtaHybrid.navySoft,
    borderRadius: 18,
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  minutesValue: {
    color: TeumtaHybrid.navy,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 30,
  },
  minutesUnit: {
    color: TeumtaHybrid.navy,
    fontSize: 12,
    lineHeight: 18,
  },
  completionLabel: {
    color: TeumtaHybrid.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  settingsGroup: {
    backgroundColor: TeumtaHybrid.paper,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  settingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 58,
    gap: 12,
  },
  settingLabel: {
    color: TeumtaHybrid.ink,
    fontSize: 15,
    lineHeight: 23,
  },
  privacyNote: {
    paddingHorizontal: 4,
    gap: 6,
  },
  noteTitle: {
    color: TeumtaHybrid.ink,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 22,
  },
  noteText: {
    color: TeumtaHybrid.muted,
    fontSize: 12,
    lineHeight: 20,
  },
  deleteButton: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: 44,
  },
  dangerAction: {
    color: TeumtaHybrid.terracotta,
    fontSize: 13,
    fontWeight: '600',
  },
  appInfo: {
    alignItems: 'center',
    gap: 4,
  },
});
