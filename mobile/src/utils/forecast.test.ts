import { describe, expect, it } from 'vitest';

import { chartRatio, formatForecastDate, summarizeForecast } from './forecast';
import type { ConcentrationForecastEntry } from '@/types/place';

/** 실제 경복궁 응답을 축약한 형태(오늘이 첫 항목, 날짜 오름차순). */
function entry(date: string, rate: number): ConcentrationForecastEntry {
  return {
    forecastDate: date,
    concentrationRate: rate,
    source: 'KTO_CONCENTRATION_FORECAST',
    isRealtime: false,
  };
}

const GYEONGBOKGUNG = [
  entry('2026-08-15', 91.9),
  entry('2026-08-16', 88.0),
  entry('2026-08-17', 67.0),
  entry('2026-08-18', 57.0),
  entry('2026-08-19', 67.0),
  entry('2026-08-20', 75.0),
  entry('2026-08-21', 78.0),
  entry('2026-08-22', 94.0),
  entry('2026-08-23', 75.0),
  entry('2026-08-24', 67.0),
  entry('2026-08-25', 50.1),
];

describe('summarizeForecast', () => {
  it('중앙값 대비 차이로 오늘을 해석한다(등급을 만들지 않는다)', () => {
    const summary = summarizeForecast(GYEONGBOKGUNG);
    if (!summary) {
      throw new Error('expected summary');
    }
    expect(summary.median).toBe(75);
    expect(summary.differenceFromMedian).toBe(23);
    expect(summary.tone).toBe('busy');
  });

  it('앞으로 가장 한산한 날과 오늘 대비 감소율을 준다', () => {
    const summary = summarizeForecast(GYEONGBOKGUNG);
    expect(summary?.quietest?.forecastDate).toBe('2026-08-25');
    // 91.9 → 50.1 은 약 45% 감소
    expect(summary?.quietestDropPercent).toBe(45);
  });

  it('공식 예측 기간인 향후 30일 전체에서 가장 한산한 날을 찾는다', () => {
    const forecasts = Array.from({ length: 31 }, (_, index) => {
      const day = index + 1;
      const rate = day === 30 ? 10 : day === 31 ? 1 : 100;
      return entry(`2026-10-${String(day).padStart(2, '0')}`, rate);
    });

    const summary = summarizeForecast(forecasts);

    expect(summary?.upcoming).toHaveLength(30);
    expect(summary?.median).toBe(100);
    expect(summary?.quietest?.forecastDate).toBe('2026-10-30');
  });

  it('오늘이 이미 가장 한산하면 대안 날짜를 제시하지 않는다', () => {
    const summary = summarizeForecast([entry('2026-08-15', 40), entry('2026-08-16', 80)]);
    expect(summary?.quietest).toBeNull();
    expect(summary?.tone).toBe('quiet');
  });

  it('중앙값과 큰 차이가 없으면 평소와 비슷으로 본다', () => {
    const summary = summarizeForecast([
      entry('2026-08-15', 70),
      entry('2026-08-16', 72),
      entry('2026-08-17', 68),
    ]);
    expect(summary?.tone).toBe('usual');
  });

  it('예측이 없으면 null', () => {
    expect(summarizeForecast([])).toBeNull();
  });
});

describe('chartRatio', () => {
  it('가장 낮은 값도 막대가 보이도록 바닥을 남긴다', () => {
    expect(chartRatio(50.1, GYEONGBOKGUNG)).toBeCloseTo(0.25, 2);
    expect(chartRatio(94, GYEONGBOKGUNG)).toBeCloseTo(1, 2);
  });

  it('값이 모두 같으면 최대 높이', () => {
    const flat = [entry('2026-08-15', 70), entry('2026-08-16', 70)];
    expect(chartRatio(70, flat)).toBe(1);
  });
});

describe('formatForecastDate', () => {
  it('요일까지 붙여 읽기 쉽게 만든다', () => {
    expect(formatForecastDate('2026-08-25')).toBe('8월 25일(화)');
  });
});
