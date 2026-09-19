import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TeumtaHybrid } from '@/constants/theme';
import { useActiveTrip } from '@/hooks/use-active-trip';
import { timeLabelAt } from '@/utils/time';
import { summarizeTrip } from '@/utils/trip-summary';

export function ActiveTripCard({ showEmpty = false }: { showEmpty?: boolean }) {
  const { selected, progress, ready } = useActiveTrip();
  if (!ready) return <View accessibilityLabel="여행 불러오는 중" style={styles.placeholder} />;
  if (!selected) {
    return showEmpty ? (
      <Link href={{ pathname: '/', params: { search: '1' } }} asChild>
        <Pressable accessibilityRole="button" style={styles.card}>
          <View style={styles.heading}>
            <View style={styles.emptyCopy}>
              <Text style={styles.eyebrow}>내 여행</Text>
              <Text style={styles.title}>새 코스 만들기</Text>
            </View>
            <View style={styles.startButton}>
              <Text style={styles.startLabel}>시작</Text>
              <Text style={styles.startArrow}>→</Text>
            </View>
          </View>
        </Pressable>
      </Link>
    ) : null;
  }
  const summary = summarizeTrip(selected, progress);
  return (
    <Link href={summary.inProgress ? '/trip' : '/course-map'} asChild>
      <Pressable accessibilityRole="button" style={styles.card}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>{summary.inProgress ? '여행 중' : '출발 전'}</Text>
          <Text style={styles.action}>{summary.inProgress ? '이어가기' : '코스 보기'} →</Text>
        </View>
        <Text style={styles.title}>{selected.destination.name}</Text>
        {summary.currentPlace && <Text style={styles.meta}>머무는 곳 · {summary.currentPlace}</Text>}
        <Text style={styles.meta}>
          {summary.returning ? '복귀 장소' : '다음 장소'} · {summary.nextPlace}
        </Text>
        {summary.inProgress ? (
          <>
            <View accessibilityRole="progressbar" accessibilityLabel="방문 진행률"
              accessibilityValue={{ min: 0, max: Math.max(1, summary.total), now: summary.visited,
                text: `${summary.total}곳 중 ${summary.visited}곳 방문` }} style={styles.track}>
              <View style={[styles.fill, { width: `${summary.total ? summary.visited / summary.total * 100 : 0}%` }]} />
            </View>
            <View style={styles.footer}>
              <Text style={styles.meta}>{summary.visited}/{summary.total}곳 방문{summary.skipped ? ` · ${summary.skipped}곳 건너뜀` : ''}</Text>
              {summary.plannedReturnAt !== null && <Text style={styles.meta}>계획상 복귀 {timeLabelAt(summary.plannedReturnAt)}</Text>}
            </View>
          </>
        ) : <Text style={styles.meta}>약 {selected.course.totalMinutes}분 · {summary.total}곳 방문 예정</Text>}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: TeumtaHybrid.paper, borderColor: TeumtaHybrid.line, borderWidth: 1, borderRadius: 16, padding: 16, gap: 6 },
  placeholder: { backgroundColor: TeumtaHybrid.canvas, borderRadius: 16, height: 92 },
  heading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  eyebrow: { color: TeumtaHybrid.navy, fontSize: 12, fontWeight: '700', lineHeight: 18 },
  title: { color: TeumtaHybrid.ink, fontSize: 18, fontWeight: '700', lineHeight: 26 },
  emptyCopy: { flex: 1, gap: 2 },
  startButton: { alignItems: 'center', backgroundColor: TeumtaHybrid.navy, borderRadius: 10, flexDirection: 'row', gap: 5, minHeight: 40, paddingHorizontal: 12 },
  startLabel: { color: TeumtaHybrid.white, fontSize: 13, fontWeight: '700' },
  startArrow: { color: TeumtaHybrid.white, fontSize: 16 },
  meta: { color: TeumtaHybrid.muted, fontSize: 13, lineHeight: 20 },
  action: { color: TeumtaHybrid.navy, fontSize: 13, fontWeight: '800', lineHeight: 20 },
  track: { height: 5, backgroundColor: TeumtaHybrid.line, borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  fill: { height: '100%', backgroundColor: TeumtaHybrid.navy, borderRadius: 3 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 4 },
});
