import type { ConcentrationForecastEntry } from '@/types/place';

/**
 * 집중률 예측 해석.
 *
 * KTO는 혼잡 등급 임계값 미제공 → 원본 값(예: 91.9)에 "혼잡" 같은 등급을 붙이면 근거 없는 값이 된다.
 * 대신 **분포 안에서의 상대 위치**로 해석 — 중앙값 대비 차이, 앞으로 가장 한산한 날.
 * 둘 다 원본에서 그대로 나오는 사실.
 */

/** 중앙값 대비 이 비율(%) 이상 벗어나면 "붐빔·한산", 그 사이는 "비슷". */
const NOTABLE_DIFFERENCE_PERCENT = 15;

/** 관광지 집중률 API가 제공하는 공식 예측 기간. */
export const FORECAST_PERIOD_DAYS = 30;

export type ForecastTone = 'busy' | 'usual' | 'quiet';

export interface ForecastSummary {
  today: ConcentrationForecastEntry;
  /** 30일 중앙값. */
  median: number;
  /** 중앙값 대비 오늘 차이(%). 양수면 평소보다 붐빔. */
  differenceFromMedian: number;
  tone: ForecastTone;
  /** 향후 30일 예측. */
  upcoming: ConcentrationForecastEntry[];
  /** 향후 30일 중 가장 한산한 날(오늘 제외). 오늘보다 낮을 때만. */
  quietest: ConcentrationForecastEntry | null;
  /** quietest와 오늘의 차이(%). */
  quietestDropPercent: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/** 예측 목록(날짜 오름차순, 첫 항목이 오늘) → 화면용 요약. */
export function summarizeForecast(
  forecasts: ConcentrationForecastEntry[],
): ForecastSummary | null {
  if (forecasts.length === 0) {
    return null;
  }

  const upcoming = forecasts.slice(0, FORECAST_PERIOD_DAYS);
  const today = upcoming[0];
  const rates = upcoming.map((entry) => entry.concentrationRate);
  const middle = median(rates);

  const differenceFromMedian =
    middle === 0 ? 0 : Math.round(((today.concentrationRate - middle) / middle) * 100);

  const tone: ForecastTone =
    differenceFromMedian >= NOTABLE_DIFFERENCE_PERCENT
      ? 'busy'
      : differenceFromMedian <= -NOTABLE_DIFFERENCE_PERCENT
        ? 'quiet'
        : 'usual';

  const later = upcoming.slice(1);
  const lowest = later.reduce<ConcentrationForecastEntry | null>(
    (best, entry) => (best === null || entry.concentrationRate < best.concentrationRate ? entry : best),
    null,
  );

  const quietest =
    lowest && lowest.concentrationRate < today.concentrationRate ? lowest : null;
  const quietestDropPercent =
    quietest && today.concentrationRate > 0
      ? Math.round(((today.concentrationRate - quietest.concentrationRate) / today.concentrationRate) * 100)
      : 0;

  return {
    today,
    median: middle,
    differenceFromMedian,
    tone,
    upcoming,
    quietest,
    quietestDropPercent,
  };
}

/** 막대 높이 비율(0~1). 최저값도 보이게 바닥 확보. */
export function chartRatio(rate: number, entries: ConcentrationForecastEntry[]): number {
  const rates = entries.map((entry) => entry.concentrationRate);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  if (max === min) {
    return 1;
  }
  return 0.25 + ((rate - min) / (max - min)) * 0.75;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** "2026-08-25" → "8월 25일(화)". */
export function formatForecastDate(forecastDate: string): string {
  const [year, month, day] = forecastDate.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()];
  return `${month}월 ${day}일(${weekday})`;
}

/** "2026-08-25" → "25". 그래프 눈금용. */
export function forecastDayLabel(forecastDate: string): string {
  return String(Number(forecastDate.split('-')[2]));
}
