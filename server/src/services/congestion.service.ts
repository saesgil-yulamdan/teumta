import { CongestionLevel, CongestionType } from '@prisma/client';

import { KTO_CONCENTRATION_FORECAST_SOURCE } from '../dtos';
import { ExternalApiNotFoundError } from '../external/common';
import { fetchRealtimeCongestion, mapSkCongestionToCongestionData } from '../external/congestion';
import { prisma } from '../utils/prisma';
import { TtlCache } from '../utils/ttl-cache';
import { resolveTmapPoiId } from './poi-matching.service';

/**
 * 혼잡도 조회 서비스.
 * - 집중률 예측: DB 조회(향후 30일 날짜별 — 실시간·시간대별 아님)
 * - 실시간 혼잡도: SK 퍼즐 API 실시간 조회 + 5분 캐시(무료 쿼터 절약, DB 미저장)
 */

export interface ConcentrationForecastView {
  /** 예측 대상 달력 날짜(KST), "YYYY-MM-DD". */
  forecastDate: string;
  /** 집중률(소수). */
  concentrationRate: number;
  source: string;
  /** 이 예측 로우의 마지막 적재·갱신 시각. */
  fetchedAt: Date;
  /** 실시간 데이터 아님. */
  isRealtime: false;
}

export type ConcentrationForecastLookup =
  | { status: 'NOT_FOUND' }
  | { status: 'SUCCESS'; forecasts: ConcentrationForecastView[] };

/** 특정 장소의 집중률 예측 목록(예측일 오름차순). 장소가 없으면 NOT_FOUND. */
export async function getConcentrationForecasts(
  placeId: number,
): Promise<ConcentrationForecastLookup> {
  const place = await prisma.place.findUnique({
    where: { id: placeId },
    select: { id: true },
  });
  if (!place) {
    return { status: 'NOT_FOUND' };
  }

  const rows = await prisma.congestion.findMany({
    where: {
      placeId,
      type: CongestionType.PREDICTED,
      source: KTO_CONCENTRATION_FORECAST_SOURCE,
      concentrationRate: { not: null },
      predictedFor: { not: null },
    },
    orderBy: { predictedFor: 'asc' },
    select: {
      concentrationRate: true,
      predictedFor: true,
      source: true,
      updatedAt: true,
    },
  });

  return {
    status: 'SUCCESS',
    forecasts: rows.map((row) => ({
      forecastDate: toKstDateString(row.predictedFor as Date),
      concentrationRate: Number(row.concentrationRate),
      source: row.source ?? KTO_CONCENTRATION_FORECAST_SOURCE,
      fetchedAt: row.updatedAt,
      isRealtime: false as const,
    })),
  };
}

/** predictedFor(KST 자정) → "YYYY-MM-DD". UTC 변환으로 하루 밀리지 않게 KST 기준. */
function toKstDateString(date: Date): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// 실시간 혼잡도(SK 퍼즐) + 인메모리 캐시
// ---------------------------------------------------------------------------

/** 캐시 TTL. 퍼즐이 준실시간(수 분 단위)이라 5분이면 신선도·쿼터 균형. */
export const REALTIME_CONGESTION_CACHE_TTL_MS = 5 * 60 * 1000;

export interface RealtimeCongestionView {
  poiId: string;
  poiName: string | null;
  /** RELAXED | NORMAL | CROWDED | VERY_CROWDED */
  level: CongestionLevel;
  source: string;
  /** 외부 API 기준 측정 시각(KST). */
  measuredAt: Date | null;
  /** 서버가 가져온 시각 — 캐시 히트면 과거 값. */
  fetchedAt: Date;
  isRealtime: true;
  /**
   * 실시간 혼잡도가 우회 트리거 단계(CROWDED 이상)일 때만 내려주는 제안 메타.
   * 프론트 팝업/CTA 문구가 서버 판단 기준과 어긋나지 않게 한다.
   */
  detourPrompt: RealtimeDetourPrompt | null;
}

export interface RealtimeDetourPrompt {
  shouldPrompt: true;
  reason: 'REALTIME_CROWDED';
  title: string;
  body: string;
  actionLabel: string;
}

/** 상한은 실시간 혼잡도를 실제로 조회할 만한 POI 수보다 넉넉하게. */
const REALTIME_CACHE_MAX_ENTRIES = 500;

const realtimeCache = new TtlCache<RealtimeCongestionView>(
  REALTIME_CONGESTION_CACHE_TTL_MS,
  REALTIME_CACHE_MAX_ENTRIES,
);

/** 테스트용 캐시 초기화. */
export function clearRealtimeCongestionCache(): void {
  realtimeCache.clear();
}

/**
 * POI 실시간 혼잡도(5분 캐시). 외부 오류는 그대로 전파 — 변환은 error.middleware.
 * 같은 POI 동시 미스는 외부 호출 1회를 공유한다(TtlCache.getOrCreate).
 */
export async function getRealtimeCongestion(poiId: string): Promise<RealtimeCongestionView> {
  const key = poiId.trim();
  return realtimeCache.getOrCreate(key, async () => {
    const raw = await fetchRealtimeCongestion(key);
    const data = mapSkCongestionToCongestionData(raw);
    return {
      poiId: key,
      poiName: raw.contents?.poiName ?? null,
      level: data.level,
      source: data.source ?? 'SK_PUZZLE',
      measuredAt: data.measuredAt,
      fetchedAt: new Date(),
      isRealtime: true,
      detourPrompt: detourPromptForLevel(data.level),
    };
  });
}

function detourPromptForLevel(level: CongestionLevel): RealtimeDetourPrompt | null {
  if (level !== CongestionLevel.CROWDED && level !== CongestionLevel.VERY_CROWDED) {
    return null;
  }

  return {
    shouldPrompt: true,
    reason: 'REALTIME_CROWDED',
    title: '잠깐!',
    body: '붐비는 장소예요\n틈타 코스를 이용해보시겠어요?',
    actionLabel: '틈타 코스 보기',
  };
}

/**
 * TourAPI 목적지(contentId)의 실시간 혼잡도.
 * SK는 TMAP poiId로만 조회 가능 → 관광지↔POI 매칭 선행(poi-matching.service, 캐시).
 * 대응 POI 없으면 "실시간 혼잡도 미제공" 상황이라 404.
 */
export async function getRealtimeCongestionByContentId(
  contentId: string,
): Promise<RealtimeCongestionView> {
  const poiId = await resolveTmapPoiId(contentId);

  if (poiId === null) {
    throw new ExternalApiNotFoundError(
      'congestion',
      'No TMAP POI matched for this TourAPI content',
      { code: 'CONGESTION_DATA_NOT_FOUND' },
    );
  }

  return getRealtimeCongestion(poiId);
}
