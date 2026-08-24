import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CongestionLevel } from '@prisma/client';

const {
  getConcentrationForecastByContentIdMock,
  getConcentrationForecastsMock,
  getRealtimeCongestionByContentIdMock,
  getRealtimeCongestionMock,
} = vi.hoisted(() => ({
  getConcentrationForecastByContentIdMock: vi.fn(),
  getConcentrationForecastsMock: vi.fn(),
  getRealtimeCongestionByContentIdMock: vi.fn(),
  getRealtimeCongestionMock: vi.fn(),
}));

vi.mock('../services/concentration-forecast.service', () => ({
  getConcentrationForecastByContentId: getConcentrationForecastByContentIdMock,
}));

vi.mock('../services/congestion.service', () => ({
  getConcentrationForecasts: getConcentrationForecastsMock,
  getRealtimeCongestion: getRealtimeCongestionMock,
  getRealtimeCongestionByContentId: getRealtimeCongestionByContentIdMock,
}));

import { ExternalApiError } from '../external/common';
import { getRealtimeCongestionController } from './congestion.controller';

interface FakeResponse {
  statusCode: number;
  body: unknown;
  status: (code: number) => FakeResponse;
  json: (payload: unknown) => FakeResponse;
}

function makeReq(query: Record<string, string> = {}): Request {
  return { params: {}, query } as unknown as Request;
}

function makeRes(): FakeResponse {
  const res: FakeResponse = {
    statusCode: 0,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

async function run(query: Record<string, string>) {
  const res = makeRes();
  const next = vi.fn();
  await getRealtimeCongestionController(makeReq(query), res as unknown as Response, next);
  return { res, next };
}

const crowdedRealtimeView = {
  poiId: '362105',
  poiName: '경복궁',
  level: CongestionLevel.CROWDED,
  source: 'SK_PUZZLE',
  measuredAt: null,
  fetchedAt: new Date('2026-08-24T00:00:00.000Z'),
  isRealtime: true,
  detourPrompt: {
    shouldPrompt: true,
    reason: 'REALTIME_CROWDED',
    title: '잠깐!',
    body: '붐비는 장소예요\n틈타 코스를 이용해보시겠어요?',
    actionLabel: '틈타 코스 보기',
  },
};

beforeEach(() => {
  getConcentrationForecastByContentIdMock.mockReset();
  getConcentrationForecastsMock.mockReset();
  getRealtimeCongestionByContentIdMock.mockReset();
  getRealtimeCongestionByContentIdMock.mockResolvedValue(crowdedRealtimeView);
  getRealtimeCongestionMock.mockReset();
  getRealtimeCongestionMock.mockResolvedValue(crowdedRealtimeView);
});

describe('getRealtimeCongestionController', () => {
  it('poiId/contentId 둘 다 없거나 둘 다 있으면 400', async () => {
    const invalidQueries: Record<string, string>[] = [
      {},
      { poiId: '362105', contentId: '126508' },
    ];

    for (const query of invalidQueries) {
      const { res } = await run(query);
      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({
        success: false,
        data: null,
        error: { code: 'INVALID_IDENTIFIER' },
      });
    }
    expect(getRealtimeCongestionMock).not.toHaveBeenCalled();
    expect(getRealtimeCongestionByContentIdMock).not.toHaveBeenCalled();
  });

  it('poiId 전달 시 실시간 혼잡도와 우회 제안 메타를 기존 응답 봉투에 담아 반환한다', async () => {
    const { res } = await run({ poiId: '362105' });

    expect(res.statusCode).toBe(200);
    expect(getRealtimeCongestionMock).toHaveBeenCalledWith('362105');
    expect(getRealtimeCongestionByContentIdMock).not.toHaveBeenCalled();
    expect(res.body).toEqual({ success: true, data: crowdedRealtimeView, error: null });
  });

  it('contentId 전달 시 목적지 매칭 서비스에 위임한다', async () => {
    const { res } = await run({ contentId: '126508' });

    expect(res.statusCode).toBe(200);
    expect(getRealtimeCongestionByContentIdMock).toHaveBeenCalledWith('126508');
    expect(getRealtimeCongestionMock).not.toHaveBeenCalled();
  });

  it('외부 API 오류는 next(error)로 위임한다', async () => {
    const error = new ExternalApiError('sk-puzzle', 'SK API unavailable');
    getRealtimeCongestionMock.mockRejectedValue(error);

    const { res, next } = await run({ poiId: '362105' });

    expect(next).toHaveBeenCalledWith(error);
    expect(res.statusCode).toBe(0);
  });
});
