import Constants from 'expo-constants';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlaceThumbnail } from '@/components/place-thumbnail';
import { ReportModal } from '@/components/report-modal';
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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>마이</Text>
          <Text style={styles.headerSubtitle}>기록과 저장한 장소</Text>
        </View>

        <Text style={styles.sectionTitle}>다녀온 코스</Text>
        <Text style={styles.sectionCaption}>
          로컬을 다녀온 기록
        </Text>
        {completedEntries.length > 0 && (
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>{statsLabel} 분산 참여</Text>
            <View style={styles.statsRow}>
              <View style={styles.statsColumn}>
                <Text style={styles.statsValue}>{statsEntries.length}번</Text>
                <Text style={styles.statsLabel}>다녀온 코스</Text>
              </View>
              <View style={styles.statsColumn}>
                <Text style={styles.statsValue}>{statsLocalCount}곳</Text>
                <Text style={styles.statsLabel}>들른 로컬</Text>
              </View>
              <View style={styles.statsColumn}>
                <Text style={styles.statsValue}>{statsMinutes}분</Text>
                <Text style={styles.statsLabel}>비켜간 시간</Text>
              </View>
            </View>
          </View>
        )}
        {completedEntries.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              아직 다녀온 코스가 없어요.{'\n'}코스를 마치면 이 기기에만 기록돼요.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {completedEntries.map((entry) => (
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
                    {entry.selected.destination.name} ·{' '}
                    {dateLabel(entry.completedAt ?? entry.viewedAt)}
                  </Text>
                </View>
                <View style={styles.doneBadge}>
                  <Text style={styles.doneBadgeLabel}>
                    {entry.completedAll ? '완주' : '다녀옴'}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle}>저장한 장소</Text>
        {savedPlaces.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              아직 저장한 장소가 없어요.{'\n'}관광지 상세 화면의 북마크 버튼으로 저장할 수 있어요.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {savedPlaces.map((place) => (
              <Link
                key={`${place.source}-${place.id}`}
                href={{
                  pathname: '/places/[id]',
                  params: {
                    id: place.id,
                    source: place.source,
                    name: place.name,
                    ...(place.address ? { address: place.address } : {}),
                    ...(place.imageUrl ? { imageUrl: place.imageUrl } : {}),
                  },
                }}
                asChild>
                <Pressable style={styles.rowCard}>
                  {/* 저장 시점 이미지를 그대로 쓴다. 목적지는 분류가 없어 중립 배경으로 떨어진다. */}
                  <PlaceThumbnail
                    imageUrl={place.imageUrl}
                    variant="card"
                    style={styles.rowThumb}
                  />
                  <View style={styles.rowTexts}>
                    <Text style={styles.rowName}>{place.name}</Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {place.address ?? '주소 정보 없음'}
                    </Text>
                  </View>
                  <Text style={styles.rowChevron}>›</Text>
                </Pressable>
              </Link>
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle}>위치·개인정보</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>위치는 기기에서만 처리</Text>
          <Text style={styles.infoCardBody}>
            이동 경로, 저장 장소, 코스 기록을 서버로 보내지 않습니다.
          </Text>
          <Pressable onPress={confirmClear} hitSlop={8}>
            <Text style={styles.dangerAction}>저장 데이터 전체 삭제</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>앱 정보</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoRowLabel}>버전</Text>
            <Text style={styles.infoRowValue}>{Constants.expoConfig?.version ?? '1.0.0'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoRowLabel}>데이터 출처</Text>
            <Text style={styles.infoRowValue}>한국관광공사 · SK open API · TMAP</Text>
          </View>
          <Pressable style={styles.infoRow} onPress={() => setShowReport(true)} hitSlop={4}>
            <Text style={styles.infoRowLabel}>버그·의견 보내기</Text>
            <Text style={styles.infoRowLink}>제보하기 ›</Text>
          </Pressable>
          <Pressable
            style={styles.infoRow}
            onPress={() => void Linking.openURL(SUPPORT_URL)}
            hitSlop={4}>
            <Text style={styles.infoRowLabel}>지원·문의</Text>
            <Text style={styles.infoRowLink}>열기 ›</Text>
          </Pressable>
          <Pressable
            style={styles.infoRow}
            onPress={() => void Linking.openURL(PRIVACY_URL)}
            hitSlop={4}>
            <Text style={styles.infoRowLabel}>개인정보처리방침</Text>
            <Text style={styles.infoRowLink}>열기 ›</Text>
          </Pressable>
        </View>
      </ScrollView>

      <ReportModal
        visible={showReport}
        onClose={() => setShowReport(false)}
        kind="app"
      />
      <TeumtaTabBar active="my" />
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
  sectionCaption: {
    color: TeumtaHybrid.muted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: -8,
  },
  statsCard: {
    backgroundColor: TeumtaHybrid.canvas,
    borderLeftColor: TeumtaHybrid.signal,
    borderLeftWidth: 4,
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statsTitle: {
    color: TeumtaHybrid.navy,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  statsRow: {
    flexDirection: 'row',
  },
  statsColumn: {
    flex: 1,
    gap: 1,
  },
  statsValue: {
    color: TeumtaHybrid.ink,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
  },
  statsLabel: {
    color: TeumtaHybrid.muted,
    fontSize: 10,
    lineHeight: 14,
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
  doneBadge: {
    backgroundColor: TeumtaHybrid.slateSoft,
    borderRadius: TeumtaHybrid.radius.small,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  doneBadgeLabel: {
    color: TeumtaHybrid.navy,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
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
  rowChevron: {
    color: TeumtaHybrid.faint,
    fontSize: 20,
    fontWeight: '500',
    lineHeight: 28,
  },
  infoCard: {
    borderBottomColor: TeumtaHybrid.line,
    borderBottomWidth: 1,
    borderTopColor: TeumtaHybrid.line,
    borderTopWidth: 1,
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  infoCardTitle: {
    color: TeumtaHybrid.ink,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  infoCardBody: {
    color: TeumtaHybrid.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  dangerAction: {
    color: TeumtaHybrid.terracotta,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    marginTop: 2,
  },
  infoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoRowLabel: {
    color: TeumtaHybrid.muted,
    fontSize: 11,
    lineHeight: 15,
  },
  infoRowValue: {
    color: TeumtaHybrid.ink,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  infoRowLink: {
    color: TeumtaHybrid.slate,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
});
