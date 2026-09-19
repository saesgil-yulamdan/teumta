import { describe, expect, it } from 'vitest';

import { realtimeBasisLabel } from './realtime-status';

describe('realtimeBasisLabel', () => {
  it('오늘 측정값은 KST 시각을 짧게 표시한다', () => {
    expect(
      realtimeBasisLabel(
        '2026-09-04T06:40:00.000Z',
        new Date('2026-09-04T09:00:00.000Z'),
      ),
    ).toBe('이전 관측 · 오늘 15:40 기준');
  });

  it('오늘 이전 측정값은 날짜도 표시해 오래된 값임을 숨기지 않는다', () => {
    expect(
      realtimeBasisLabel(
        '2026-09-03T06:40:00.000Z',
        new Date('2026-09-04T09:00:00.000Z'),
      ),
    ).toBe('이전 관측 · 9월 3일 15:40 기준');
  });

  it('측정 시각이 없거나 잘못되면 확인 불가를 명시한다', () => {
    expect(realtimeBasisLabel(null)).toBe('관측 시각 미제공');
    expect(realtimeBasisLabel('invalid')).toBe('관측 시각 미제공');
  });
});
