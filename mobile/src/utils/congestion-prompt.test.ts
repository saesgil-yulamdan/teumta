import { describe, expect, it } from 'vitest';

import type { RealtimeCongestion } from '@/types/place';

import { shouldShowDetourPrompt } from './congestion-prompt';

function congestion(overrides: Partial<RealtimeCongestion> = {}): RealtimeCongestion {
  return {
    poiId: '362105',
    poiName: '경복궁',
    level: 'CROWDED',
    source: 'SK_PUZZLE',
    measuredAt: null,
    fetchedAt: '2026-08-24T00:00:00.000Z',
    isRealtime: true,
    ...overrides,
  };
}

describe('shouldShowDetourPrompt', () => {
  it('서버 detourPrompt가 있으면 그 판단을 우선한다', () => {
    expect(
      shouldShowDetourPrompt(
        congestion({
          detourPrompt: {
            shouldPrompt: true,
            reason: 'REALTIME_CROWDED',
            title: '잠깐!',
            body: '붐비는 장소예요\n틈타 코스를 이용해보시겠어요?',
            actionLabel: '틈타 코스 보기',
          },
        }),
        'medium',
      ),
    ).toBe(true);
  });

  it('구서버 응답은 CROWDED 이상으로 변환된 level에 폴백한다', () => {
    expect(shouldShowDetourPrompt(congestion({ detourPrompt: undefined }), 'high')).toBe(true);
    expect(shouldShowDetourPrompt(congestion({ detourPrompt: undefined }), 'veryHigh')).toBe(true);
    expect(shouldShowDetourPrompt(congestion({ detourPrompt: undefined }), 'medium')).toBe(false);
  });

  it('혼잡도 조회 결과가 없으면 표시하지 않는다', () => {
    expect(shouldShowDetourPrompt(null, null)).toBe(false);
  });
});
