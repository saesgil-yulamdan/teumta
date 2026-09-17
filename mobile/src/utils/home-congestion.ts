import type { FeaturedDestination } from '@/constants/destinations';
import type { RealtimeCongestion } from '@/types/place';

export type HomeCongestionEntry = {
  destination: FeaturedDestination;
  congestion: RealtimeCongestion;
};

const LEVEL_ORDER: Record<RealtimeCongestion['level'], number> = {
  RELAXED: 0, NORMAL: 1, CROWDED: 2, VERY_CROWDED: 3,
};

export function resolveCongestionRefresh(
  previous: HomeCongestionEntry[] | null,
  results: PromiseSettledResult<HomeCongestionEntry>[],
) {
  const loaded = results.flatMap((result) =>
    result.status === 'fulfilled' && result.value.congestion.isRealtime &&
    Object.hasOwn(LEVEL_ORDER, result.value.congestion.level) ? [result.value] : [],
  ).sort((a, b) => LEVEL_ORDER[a.congestion.level] - LEVEL_ORDER[b.congestion.level]);
  return {
    entries: loaded.length > 0 ? loaded : previous ?? [],
    failed: loaded.length === 0,
    partial: loaded.length > 0 && loaded.length < results.length,
  };
}
