import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReportModal } from '@/components/report-modal';
import { TeumtaHeader } from '@/components/teumta-header';
import { TeumtaHybrid, TeumtaLayout } from '@/constants/theme';
import { useBookmarks } from '@/hooks/use-bookmarks';
import { useCourseLog } from '@/hooks/use-course-log';
import { clearRecentSearchesStorage } from '@/utils/recent-searches';

/** 스토어 심사용 지원 페이지(web/README.md). FAQ·문의처·개인정보처리방침이 있다. */
const SUPPORT_URL = 'https://saesgil-yulamdan.github.io/teumta/';
const PRIVACY_URL = 'https://saesgil-yulamdan.github.io/teumta/privacy.html';

export default function MyScreen() {
  const router = useRouter();
  const { clearBookmarks } = useBookmarks();
  const { completedEntries, clearCourseLog } = useCourseLog();
  const [showReport, setShowReport] = useState(false);

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
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TeumtaHeader title="마이" />

        <View style={styles.summary}>
          <Text style={styles.summaryCaption}>{statsLabel} 나의 여행</Text>
          <View style={styles.statsRow}>
            {[
              { value: statsEntries.length, unit: '번', label: '다녀온 코스' },
              { value: statsLocalCount, unit: '곳', label: '들른 장소' },
              { value: statsMinutes, unit: '분', label: '코스 예상 시간' },
            ].map((stat) => (
              <View key={stat.label} style={styles.statsColumn}>
                <Text style={styles.statsValue}>{stat.value}<Text style={styles.statsUnit}> {stat.unit}</Text></Text>
                <Text style={styles.statsLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="내 여행에서 다녀온 코스 보기"
          style={styles.historyButton}
          onPress={() => router.navigate({ pathname: '/trips', params: { section: 'history' } })}>
          <View style={styles.rowTexts}>
            <Text style={styles.sectionTitle}>여행 기록</Text>
            <Text style={styles.rowMeta}>다녀온 코스 {completedEntries.length}개</Text>
          </View>
          <Text style={styles.rowChevron}>›</Text>
        </Pressable>

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
            <Text style={styles.noteText}>여행 기록은 이 기기에만 저장됩니다.</Text>
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
    gap: 24,
    paddingHorizontal: TeumtaLayout.screenGutter,
    paddingTop: 12,
    paddingBottom: TeumtaLayout.contentBottomPadding,
  },
  summary: {
    borderBottomColor: TeumtaHybrid.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 16,
    gap: 8,
  },
  summaryCaption: {
    color: TeumtaHybrid.ink,
    fontSize: 13,
    lineHeight: 20,
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
    color: TeumtaHybrid.ink,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 38,
  },
  statsUnit: {
    fontSize: 13,
    fontWeight: '500',
  },
  statsLabel: {
    color: TeumtaHybrid.ink,
    fontSize: 12,
    lineHeight: 18,
  },
  section: {
    gap: 16,
  },
  sectionTitle: {
    color: TeumtaHybrid.ink,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
  },
  rowTexts: {
    flex: 1,
    gap: 5,
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
  settingsGroup: {
    backgroundColor: TeumtaHybrid.paper,
    borderTopColor: TeumtaHybrid.line,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  settingRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: TeumtaHybrid.line,
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
    alignItems: 'flex-start',
    gap: 4,
  },
});
