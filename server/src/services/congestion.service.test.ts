import { CongestionLevel } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** 실시간 혼잡도 캐시 테스트. 외부 API는 mock. */

const { fetchRealtimeCongestionMock, resolveTmapPoiIdMock } = vi.hoisted(() => ({
  fetchRealtimeCongestionMock: vi.fn(),
  resolveTmapPoiIdMock: vi.fn(),
}));

vi.mock('./poi-matching.service', () => ({
  resolveTmapPoiId: resolveTmapPoiIdMock,
}));

vi.mock('../external/congestion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../external/congestion')>();
  return { ...actual, fetchRealtimeCongestion: fetchRealtimeCongestionMock };
});

vi.mock('../utils/prisma', () => ({ prisma: {} }));

import { ExternalApiNotFoundError } from '../external/common/external-api.error';
import {
  clearRealtimeCongestionCache,
  getRealtimeCongestion,
  getRealtimeCongestionByContentId,
  REALTIME_CONGESTION_CACHE_TTL_MS,
} from './congestion.service';

const rawResponse = {
  status: { code: '00', message: 'success', totalCount: 1 },
  contents: {
    poiId: '362105',
    poiName: '경복궁',
    rltm: [{ datetime: '20260806125000', congestion: 0.003, congestionLevel: 2, type: 1 }],
  },
};

function rawResponseWithLevel(level: number) {
  return {
    ...rawResponse,
    contents: {
      ...rawResponse.contents,
      rltm: [{ datetime: '20260806125000', congestion: 0.003, congestionLevel: level, type: 1 }],
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  clearRealtimeCongestionCache();
  fetchRealtimeCongestionMock.mockReset();
  fetchRealtimeCongestionMock.mockResolvedValue(rawResponse);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getRealtimeCongestion', () => {
  it('원본 응답을 실시간 혼잡도 뷰로 변환한다', async () => {
    const view = await getRealtimeCongestion('362105');
    expect(view).toMatchObject({
      poiId: '362105',
      poiName: '경복궁',
      level: CongestionLevel.NORMAL,
      source: 'SK_PUZZLE',
      isRealtime: true,
    });
    expect(view.detourPrompt).toBeNull();
  });

  it('CROWDED 이상이면 우회 제안 팝업 메타를 포함한다', async () => {
    fetchRealtimeCongestionMock.mockResolvedValue(rawResponseWithLevel(3));

    const view = await getRealtimeCongestion('362105');

    expect(view.level).toBe(CongestionLevel.CROWDED);
    expect(view.detourPrompt).toEqual({
      shouldPrompt: true,
      reason: 'REALTIME_CROWDED',
      title: '잠깐!',
      body: '붐비는 장소예요\n틈타 코스를 이용해보시겠어요?',
      actionLabel: '틈타 코스 보기',
    });
  });

  it('VERY_CROWDED도 우회 제안 팝업 메타를 포함한다', async () => {
    fetchRealtimeCongestionMock.mockResolvedValue(rawResponseWithLevel(4));

    const view = await getRealtimeCongestion('362105');

    expect(view.level).toBe(CongestionLevel.VERY_CROWDED);
    expect(view.detourPrompt?.shouldPrompt).toBe(true);
  });

  it('TTL 내 재호출은 캐시를 사용한다(외부 호출 1회)', async () => {
    await getRealtimeCongestion('362105');
    await getRealtimeCongestion('362105');
    expect(fetchRealtimeCongestionMock).toHaveBeenCalledTimes(1);
  });

  it('TTL이 지나면 다시 외부를 호출한다', async () => {
    await getRealtimeCongestion('362105');
    vi.advanceTimersByTime(REALTIME_CONGESTION_CACHE_TTL_MS + 1000);
    await getRealtimeCongestion('362105');
    expect(fetchRealtimeCongestionMock).toHaveBeenCalledTimes(2);
  });

  it('poiId별로 캐시가 분리된다', async () => {
    await getRealtimeCongestion('362105');
    await getRealtimeCongestion('10817049');
    expect(fetchRealtimeCongestionMock).toHaveBeenCalledTimes(2);
  });

  it('외부 오류는 캐시 없이 그대로 전파된다', async () => {
    fetchRealtimeCongestionMock.mockRejectedValue(new Error('boom'));
    await expect(getRealtimeCongestion('362105')).rejects.toThrow('boom');
    fetchRealtimeCongestionMock.mockResolvedValue(rawResponse);
    await getRealtimeCongestion('362105');
    expect(fetchRealtimeCongestionMock).toHaveBeenCalledTimes(2);
  });
});

describe('getRealtimeCongestionByContentId', () => {
  it('TourAPI 관광지를 TMAP POI로 매칭한 뒤 혼잡도를 조회한다', async () => {
    resolveTmapPoiIdMock.mockResolvedValue('362105');

    const view = await getRealtimeCongestionByContentId('126508');

    expect(resolveTmapPoiIdMock).toHaveBeenCalledWith('126508');
    expect(fetchRealtimeCongestionMock).toHaveBeenCalledWith('362105');
    expect(view.poiId).toBe('362105');
  });

  it('대응하는 POI가 없으면 404로 내려갈 NotFound 오류', async () => {
    resolveTmapPoiIdMock.mockResolvedValue(null);

    const caught = await getRealtimeCongestionByContentId('999').catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ExternalApiNotFoundError);
    expect((caught as ExternalApiNotFoundError).code).toBe('CONGESTION_DATA_NOT_FOUND');
    expect(fetchRealtimeCongestionMock).not.toHaveBeenCalled();
  });
});
