import { Image } from 'expo-image';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getRealtimeCongestion } from '@/api/places';
import { REALTIME_LEVEL_LABEL, REALTIME_LEVEL_TO_CONGESTION_LEVEL } from '@/constants/congestion';
import { FEATURED_DESTINATIONS, type FeaturedDestination } from '@/constants/destinations';
import { Teumta } from '@/constants/theme';
import type { RealtimeCongestion } from '@/types/place';

/**
 * 홈 상단 "지금 어디가 여유로울까" — 실시간 혼잡도 한 줄.
 *
 * hasRealtimeCongestion은 조회 후보 선정에만 쓴다(destinations.ts 주석 참고).
 * 화면에 보이는 단계는 전부 실제 응답값이라 플래그가 낡아도 거짓말이 되지 않는다.
 * 서버가 장소별 5분 캐시를 두므로 홈 진입마다 조회해도 외부 호출은 거의 늘지 않는다.
 */
const REALTIME_CANDIDATES = FEATURED_DESTINATIONS.filter(
  (destination) => destination.hasRealtimeCongestion,
);
const QUIET_NOW_CANDIDATE_COUNT = 8;

/** 여유로운 곳이 먼저 보이도록 정렬. */
const LEVEL_ORDER: Record<RealtimeCongestion['level'], number> = {
  RELAXED: 0,
  NORMAL: 1,
  CROWDED: 2,
  VERY_CROWDED: 3,
};

type QuietNowEntry = {
  destination: FeaturedDestination;
  congestion: RealtimeCongestion;
};

/** 홈에 머물다 돌아왔을 때 이보다 오래됐으면 다시 조회 — 서버 캐시(5분)와 같은 주기. */
const REFRESH_AFTER_MS = 5 * 60 * 1000;

type QuietNowProps = {
  /** 값이 바뀌면 5분 게이트를 건너뛰고 즉시 재조회(홈 당겨서 새로고침). */
  refreshSignal?: number;
  /** 명시적 새로고침의 조회가 끝났을 때 — 홈이 스피너를 내리는 용도. */
  onRefreshed?: () => void;
};

export function QuietNow({ refreshSignal = 0, onRefreshed }: QuietNowProps) {
  // null = 첫 조회 중(이후 갱신 중에는 기존 카드를 그대로 보여준다)
  const [entries, setEntries] = useState<QuietNowEntry[] | null>(null);
  const lastLoadedAt = useRef(0);

  const load = useCallback((onDone?: () => void) => {
    let ignored = false;
    const candidates = selectQuietNowCandidates(refreshSignal);

    void Promise.allSettled(
      candidates.map((destination) =>
        getRealtimeCongestion({ contentId: destination.tourApiContentId }).then(
          (congestion): QuietNowEntry => ({ destination, congestion }),
        ),
      ),
    ).then((results) => {
      // 스피너는 결과 반영 여부와 무관하게 내린다 — 화면을 떠났어도 멈춘 스피너를 남기지 않는다.
      onDone?.();
      if (ignored) {
        return;
      }
      lastLoadedAt.current = Date.now();
      // 실패(SK 미커버·일시 오류)는 조용히 빼고 성공한 곳만 보여준다.
      const loaded = results
        .filter(
          (result): result is PromiseFulfilledResult<QuietNowEntry> =>
            result.status === 'fulfilled',
        )
        .map((result) => result.value)
        .sort(
          (first, second) =>
            LEVEL_ORDER[first.congestion.level] - LEVEL_ORDER[second.congestion.level],
        );
      // 갱신이 통째로 실패했을 때 이미 보여주던 카드를 지우지 않는다(첫 조회만 빈 결과 반영).
      setEntries((previous) => (loaded.length === 0 && previous ? previous : loaded));
    });

    return () => {
      ignored = true;
    };
  }, [refreshSignal]);

  useFocusEffect(
    useCallback(() => {
      // 상세를 다녀와 홈이 다시 보일 때마다 불린다 — 5분 안이면 그대로 둬서 폭주 방지.
      if (Date.now() - lastLoadedAt.current < REFRESH_AFTER_MS) {
        return;
      }
      return load();
    }, [load]),
  );

  // 당겨서 새로고침 — 사용자의 명시적 요청이라 5분 게이트를 건너뛴다.
  const isFirstSignal = useRef(true);
  useEffect(() => {
    if (isFirstSignal.current) {
      isFirstSignal.current = false;
      return;
    }
    return load(onRefreshed);
  }, [refreshSignal, load, onRefreshed]);

  // 전부 실패하면 섹션째 숨긴다 — 빈 껍데기가 남는 것보다 낫다.
  if (entries !== null && entries.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>지금 어디가 여유로울까</Text>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveLabel}>실시간</Text>
        </View>
      </View>

      {entries === null ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" />
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}>
          {entries.map(({ destination, congestion }) => {
            const palette = Teumta.congestion[REALTIME_LEVEL_TO_CONGESTION_LEVEL[congestion.level]];
            return (
              <Link
                key={destination.tourApiContentId}
                href={{
                  pathname: '/places/[id]',
                  params: {
                    id: destination.tourApiContentId,
                    source: 'TOUR',
                    name: destination.name,
                    address: destination.address,
                    ...(destination.imageUrl ? { imageUrl: destination.imageUrl } : {}),
                  },
                }}
                asChild>
                <Pressable style={styles.card}>
                  {destination.imageUrl ? (
                    <Image
                      source={{ uri: destination.imageUrl }}
                      style={styles.cardImage}
                      contentFit="cover"
                      recyclingKey={destination.tourApiContentId}
                    />
                  ) : (
                    <View style={styles.cardImage} />
                  )}
                  <View style={styles.cardBody}>
                    <Text style={styles.cardName} numberOfLines={1}>
                      {destination.name}
                    </Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {destination.areaLabel}
                    </Text>
                    <View style={[styles.levelChip, { backgroundColor: palette.background }]}>
                      <View style={[styles.levelDot, { backgroundColor: palette.dot }]} />
                      <Text style={[styles.levelLabel, { color: palette.text }]}>
                        {REALTIME_LEVEL_LABEL[congestion.level]}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              </Link>
            );
          })}
        </ScrollView>
      )}
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
  section: {
    gap: 8,
  },
  sectionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: Teumta.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  liveBadge: {
    alignItems: 'center',
    backgroundColor: Teumta.greenLight,
    borderRadius: 999,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  liveDot: {
    backgroundColor: Teumta.green,
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  liveLabel: {
    color: Teumta.greenDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    // 로딩 → 카드 전환 시 홈 전체가 출렁이지 않게 카드 높이와 맞춘다.
    height: 132,
  },
  rail: {
    flexDirection: 'row',
    gap: 10,
  },
  card: {
    backgroundColor: Teumta.surface,
    borderColor: Teumta.border,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    width: 148,
  },
  cardImage: {
    backgroundColor: Teumta.imagePlaceholder,
    height: 64,
  },
  cardBody: {
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  cardName: {
    color: Teumta.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  cardMeta: {
    color: Teumta.textSecondary,
    fontSize: 10,
    lineHeight: 14,
  },
  levelChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  levelDot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  levelLabel: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
});
