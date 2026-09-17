import { describe, expect, it } from 'vitest';

import { FEATURED_DESTINATIONS } from '@/constants/destinations';
import { resolveCongestionRefresh, type HomeCongestionEntry } from './home-congestion';

const entry = (level: HomeCongestionEntry['congestion']['level'], isRealtime = true): HomeCongestionEntry => ({
  destination: FEATURED_DESTINATIONS[0],
  congestion: { poiId: '1', poiName: '장소', level, source: 'SK', measuredAt: null, fetchedAt: '2026-09-16T00:00:00Z', isRealtime },
});
const success = (value: HomeCongestionEntry): PromiseFulfilledResult<HomeCongestionEntry> => ({ status: 'fulfilled', value });
const failure: PromiseRejectedResult = { status: 'rejected', reason: new Error('offline') };

describe('home congestion refresh', () => {
  it('확인된 실시간 값만 여유로운 순으로 정렬한다', () => {
    const result = resolveCongestionRefresh(null, [success(entry('CROWDED')), success(entry('RELAXED')), success(entry('NORMAL'))]);
    expect(result.entries.map((item) => item.congestion.level)).toEqual(['RELAXED', 'NORMAL', 'CROWDED']);
    expect(result.failed).toBe(false);
  });
  it('모두 실패하면 이전 값을 보존하면서 실패 상태를 명시한다', () => {
    const previous = [entry('NORMAL')];
    expect(resolveCongestionRefresh(previous, [failure])).toEqual({ entries: previous, failed: true, partial: false });
  });
  it('첫 조회 실패를 빈 성공 결과로 처리하지 않는다', () => {
    expect(resolveCongestionRefresh(null, [failure])).toEqual({ entries: [], failed: true, partial: false });
  });
  it('일부 실패하면 성공한 값만 표시하고 부분 실패를 알린다', () => {
    const current = entry('CROWDED');
    expect(resolveCongestionRefresh([entry('RELAXED')], [success(current), failure]))
      .toEqual({ entries: [current], failed: false, partial: true });
  });
  it('예측값을 현재 혼잡도로 표시하지 않고 재조회 성공 시 실패 상태를 해제한다', () => {
    expect(resolveCongestionRefresh(null, [success(entry('RELAXED', false))]).failed).toBe(true);
    expect(resolveCongestionRefresh([entry('CROWDED')], [success(entry('NORMAL'))]))
      .toEqual({ entries: [entry('NORMAL')], failed: false, partial: false });
  });
});
