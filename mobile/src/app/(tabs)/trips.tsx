import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActiveTripCard } from '@/components/active-trip-card';
import { EmptyState } from '@/components/empty-state';
import { PlaceThumbnail } from '@/components/place-thumbnail';
import { TeumtaHybrid, TeumtaLayout } from '@/constants/theme';
import { travel, useTravel, storageError } from '@/stores/travel';
import { setSelectedCourse } from '@/stores/selected-course';

export default function TripsScreen() {
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const tab = section === 'history' ? 'history' : 'saved';
  const { bookmarks, records, recent, ready, error } = useTravel();
  const [expanded, setExpanded] = useState(false);
  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
    <View style={styles.header}>
      <View style={styles.savedRow}><Text style={[styles.rowTitle, { flex: 1, fontSize: 24 }]}>내 여행</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/settings')} style={styles.courseButton}><Text style={styles.actionLabel}>설정·도움</Text></Pressable></View>
    </View>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {error && <Pressable onPress={() => void travel.retry().catch(storageError)}><Text style={styles.rowMeta}>{error} · 다시 시도</Text></Pressable>}
      <ActiveTripCard />
      <View style={styles.segments} accessibilityRole="tablist">
        {(['saved', 'history'] as const).map(key => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} style={[styles.segment, tab === key && styles.segmentSelected]} onPress={() => router.setParams({ section: key })}>
          <Text style={[styles.segmentLabel, tab === key && styles.segmentLabelSelected]}>{key === 'saved' ? '저장한 장소' : '여행 기록'}</Text>
        </Pressable>)}
      </View>
      {!ready ? <Text style={styles.rowMeta}>기기 기록을 불러오고 있어요.</Text> : tab === 'saved' ?
        bookmarks.length === 0 ? <EmptyState title="다시 찾고 싶은 장소를 저장하세요" description="장소 상세에서 저장한 곳을 여기서 다시 열 수 있어요." actionLabel="둘러보기" onAction={() => router.navigate('/')} /> :
        <View>{bookmarks.map(place => <View key={place.source + place.id} style={styles.savedCard}>
          <Pressable accessibilityRole="button" accessibilityLabel={place.name + ' 상세 보기'} style={styles.savedRow} onPress={() => router.push(place.local ? { pathname: '/local-places/[id]', params: { id: place.id, contentId: place.id, name: place.name, address: place.address ?? '', imageUrl: place.imageUrl ?? '', ...place.local } } : { pathname: '/places/[id]', params: { id: place.id, source: place.source, name: place.name, address: place.address ?? '', imageUrl: place.imageUrl ?? '' } })}>
            <PlaceThumbnail imageUrl={place.imageUrl} variant="card" style={styles.thumb} />
            <View style={styles.rowTexts}><Text style={styles.rowTitle}>{place.name}</Text><Text style={styles.rowMeta}>{place.address ?? '주소 미제공'}</Text></View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <View style={styles.savedRow}>
            <Pressable accessibilityRole="button" style={[styles.courseButton, { flex: 1 }]} onPress={() => router.push({ pathname: '/detours', params: { ...(place.source === 'TOUR' ? { contentId: place.id } : { poiId: place.id }), name: place.name } })}><Text style={styles.actionLabel}>주변 코스 만들기 →</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={place.name + ' 저장 해제'} style={styles.courseButton} onPress={() => void travel.toggleBookmark(place).catch(storageError)}><Text style={styles.rowMeta}>저장 해제</Text></Pressable>
          </View>
        </View>)}</View> :
        records.length === 0 ? <EmptyState title="여행을 마치면 여기에 남아요" description="완료하거나 중간 종료한 여행 회차별 결과를 확인할 수 있어요." /> :
        <View>{records.map(record => <Pressable key={record.id} accessibilityRole="button" style={styles.row} onPress={() => router.push({ pathname: '/history/[id]', params: { id: record.id } })}>
          <View style={styles.rowTexts}><Text style={styles.rowTitle}>{record.selected.destination.name}</Text>
            <Text style={styles.rowMeta}>{record.endedAt === null ? '날짜 정보 없음' : new Date(record.endedAt).toLocaleDateString('ko-KR')} · {record.status === 'legacy' ? '이전 버전 기록' : record.status === 'interrupted' ? '중간 종료' : record.completedAll ? '모든 장소 방문 · 복귀 완료' : '복귀 완료'}</Text></View><Text style={styles.chevron}>›</Text>
        </Pressable>)}</View>}
      {recent.length > 0 && <View>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded }} style={styles.row} onPress={() => setExpanded(v => !v)}>
          <View style={styles.rowTexts}><Text style={styles.rowTitle}>최근 본 코스 · {recent.length}</Text><Text style={styles.rowCaption}>자동 열람 기록 · 최근 20개 · 여행 기록과 별도</Text></View><Text style={styles.chevron}>{expanded ? '−' : '+'}</Text>
        </Pressable>
        {expanded && recent.map(entry => <Pressable key={entry.key} accessibilityRole="button" style={styles.row} onPress={() => { setSelectedCourse(entry.selected); router.push({ pathname: '/course-map', params: { historical: '1' } }); }}>
          <View style={styles.rowTexts}><Text style={styles.rowTitle}>{entry.selected.destination.name}</Text><Text style={styles.rowMeta}>예상 {entry.selected.course.totalMinutes}분 · 미리보기</Text></View><Text style={styles.chevron}>›</Text>
        </Pressable>)}
      </View>}
    </ScrollView>
  </SafeAreaView>;
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
