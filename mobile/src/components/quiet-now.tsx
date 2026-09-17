import { Image } from 'expo-image';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { getRealtimeCongestion } from '@/api/places';
import { REALTIME_LEVEL_LABEL, REALTIME_LEVEL_TO_CONGESTION_LEVEL } from '@/constants/congestion';
import { FEATURED_DESTINATIONS, type FeaturedDestination } from '@/constants/destinations';
import { TeumtaHybrid, TeumtaHybridCongestion } from '@/constants/theme';
import { resolveCongestionRefresh, type HomeCongestionEntry } from '@/utils/home-congestion';
import { realtimeBasisLabel } from '@/utils/realtime-status';

const REALTIME_CANDIDATES = FEATURED_DESTINATIONS.filter((destination) => destination.hasRealtimeCongestion);
// 홈 미리보기는 3곳만 확인한다. 전체 장소 조회는 상세 화면에서 사용자가 직접 연다.
const QUIET_NOW_CANDIDATE_COUNT = 3;
const REFRESH_AFTER_MS = 5 * 60 * 1000;

type QuietNowProps = { refreshSignal?: number; onRefreshed?: () => void };

export function QuietNow({ refreshSignal = 0, onRefreshed }: QuietNowProps) {
  const [snapshot, setSnapshot] = useState<{
    entries: HomeCongestionEntry[] | null; failed: boolean; partial: boolean;
  }>({ entries: null, failed: false, partial: false });
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [retrySignal, setRetrySignal] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const lastLoadedAt = useRef(0);
  const handledRefresh = useRef(-1);
  const handledRetry = useRef(-1);

  useFocusEffect(useCallback(() => {
    let ignored = false;
    let pending = false;
    const load = async (force = false) => {
      if (pending || (!force && Date.now() - lastLoadedAt.current < REFRESH_AFTER_MS)) return;
      pending = true;
      setLoading(true);
      const results = await Promise.allSettled(
        selectQuietNowCandidates(refreshSignal + retrySignal).map(async (destination) => ({
          destination,
          congestion: await getRealtimeCongestion({ contentId: destination.tourApiContentId }),
        })),
      );
      pending = false;
      if (ignored) return;
      // 실패 직후에도 자동 재시도 간격을 지키되, 버튼은 즉시 재시도한다.
      lastLoadedAt.current = Date.now();
      setSnapshot((previous) => resolveCongestionRefresh(previous.entries, results));
      setLoading(false);
      setNow(new Date());
      onRefreshed?.();
    };
    const force = handledRefresh.current !== refreshSignal || handledRetry.current !== retrySignal;
    handledRefresh.current = refreshSignal;
    handledRetry.current = retrySignal;
    // 진행 중 요청이 포커스를 잃어 취소된 경우에도 다시 조회한다.
    void load(force || lastLoadedAt.current === 0);
    const timer = setInterval(() => {
      setNow(new Date());
      if (AppState.currentState === 'active') void load();
    }, 30_000);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') { setNow(new Date()); void load(); }
    });
    return () => {
      ignored = true;
      listener.remove();
      clearInterval(timer);
      if (pending) { lastLoadedAt.current = 0; onRefreshed?.(); }
    };
  }, [refreshSignal, retrySignal, onRefreshed]));

  const { entries, failed, partial } = snapshot;
  return (
    <View style={styles.section}>
      <View style={styles.sectionRow}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>혼잡도</Text>
        <Text style={styles.liveLabel}>여유로운 순</Text>
      </View>
      {(failed || partial) && (
        <View style={styles.notice} accessibilityLiveRegion="polite">
          <Text style={styles.noticeText}>
            {failed
              ? entries?.length ? '갱신 실패 · 이전 정보입니다.' : '혼잡도를 불러오지 못했어요.'
              : '일부 장소만 확인됐어요.'}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="혼잡도 다시 확인"
            disabled={loading} onPress={() => setRetrySignal((value) => value + 1)} style={styles.retry}>
            <Text style={styles.retryText}>{loading ? '확인 중' : '다시 확인'}</Text>
          </Pressable>
        </View>
      )}
      {entries === null ? (
        <View style={styles.loadingBox} accessibilityLabel="혼잡도 불러오는 중">
          <ActivityIndicator color={TeumtaHybrid.navy} />
        </View>
      ) : entries.length > 0 ? (
        <View>
          {(expanded ? entries : entries.slice(0, 3)).map(({ destination, congestion }) => {
            const palette = TeumtaHybridCongestion[REALTIME_LEVEL_TO_CONGESTION_LEVEL[congestion.level]];
            return (
              <Link key={destination.tourApiContentId} href={{
                pathname: '/places/[id]',
                params: {
                  id: destination.tourApiContentId, source: 'TOUR', name: destination.name,
                  address: destination.address,
                  ...(destination.imageUrl ? { imageUrl: destination.imageUrl } : {}),
                },
              }} asChild>
                <Pressable accessibilityRole="button" style={styles.card}>
                  {destination.imageUrl ? (
                    <Image source={{ uri: destination.imageUrl }} style={styles.cardImage}
                      contentFit="cover" recyclingKey={destination.tourApiContentId} />
                  ) : <View style={styles.cardImage} />}
                  <View style={styles.cardBody}>
                    <Text style={styles.cardName} numberOfLines={1}>{destination.name}</Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>{destination.areaLabel}</Text>
                    <Text style={styles.timestamp}>
                      {realtimeBasisLabel(congestion.measuredAt, now).replace('실시간 · ', '')}
                    </Text>
                    {failed && <Text style={styles.timestamp}>
                      {realtimeBasisLabel(congestion.fetchedAt, now).replace('실시간 · ', '').replace(' 기준', ' 조회')}
                    </Text>}
                  </View>
                  <View style={[styles.levelChip, { backgroundColor: palette.background }]}>
                    <View style={[styles.levelDot, { backgroundColor: palette.dot }]} />
                    <Text style={[styles.levelLabel, { color: palette.text }]}>
                      {REALTIME_LEVEL_LABEL[congestion.level]}
                    </Text>
                  </View>
                </Pressable>
              </Link>
            );
          })}
          {entries.length > 3 && (
            <Pressable accessibilityRole="button" accessibilityState={{ expanded }}
              onPress={() => setExpanded((value) => !value)} style={styles.expandButton}>
              <Text style={styles.expandLabel}>{expanded ? '접기' : `전체 ${entries.length}곳 보기`}</Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

function selectQuietNowCandidates(refreshSignal: number): FeaturedDestination[] {
  if (REALTIME_CANDIDATES.length <= QUIET_NOW_CANDIDATE_COUNT) {
    return REALTIME_CANDIDATES;
  }

  const seed = `${todayKstDate()}:${refreshSignal}`;
  const start = stableModulo(seed, REALTIME_CANDIDATES.length);
  return Array.from({ length: QUIET_NOW_CANDIDATE_COUNT }, (_, index) => {
    const candidateIndex = (start + index) % REALTIME_CANDIDATES.length;
    return REALTIME_CANDIDATES[candidateIndex];
  });
}

function todayKstDate(): string {
  const now = new Date();
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function stableModulo(value: string, modulo: number): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % modulo;
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  sectionRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', paddingTop: 8 },
  sectionTitle: { color: TeumtaHybrid.ink, fontSize: 17, fontWeight: '700', lineHeight: 24 },
  liveLabel: { color: TeumtaHybrid.muted, fontSize: 12, lineHeight: 18 },
  notice: { backgroundColor: TeumtaHybrid.canvas, borderRadius: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticeText: { flex: 1, color: TeumtaHybrid.muted, fontSize: 12, lineHeight: 18, paddingVertical: 10 },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  retryText: { color: TeumtaHybrid.navy, fontSize: 12, fontWeight: '600' },
  loadingBox: { alignItems: 'center', justifyContent: 'center', height: 240 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: TeumtaHybrid.line },
  cardImage: { backgroundColor: TeumtaHybrid.canvas, borderRadius: 8, height: 48, width: 48 },
  cardBody: { flex: 1, gap: 2 },
  cardName: { color: TeumtaHybrid.ink, fontSize: 15, fontWeight: '600', lineHeight: 22 },
  cardMeta: { color: TeumtaHybrid.muted, fontSize: 12, lineHeight: 18 },
  timestamp: { color: TeumtaHybrid.muted, fontSize: 11, lineHeight: 16 },
  levelChip: { alignItems: 'center', borderRadius: 6, flexDirection: 'row', gap: 5, paddingHorizontal: 8, paddingVertical: 5 },
  levelDot: { borderRadius: 3, height: 6, width: 6 },
  levelLabel: { fontSize: 12, fontWeight: '600', lineHeight: 18 },
  expandButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  expandLabel: { color: TeumtaHybrid.muted, fontSize: 13, fontWeight: '600' },
});
