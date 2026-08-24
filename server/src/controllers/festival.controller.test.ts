import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getNearbyFestivalsByContentIdMock, getNearbyFestivalsByPoiIdMock } = vi.hoisted(() => ({
  getNearbyFestivalsByContentIdMock: vi.fn(),
  getNearbyFestivalsByPoiIdMock: vi.fn(),
}));

vi.mock('../services/nearby-festival.service', () => ({
  DEFAULT_FESTIVAL_RADIUS_METERS: 2000,
  MAX_FESTIVAL_RADIUS_METERS: 20_000,
  getNearbyFestivalsByContentId: getNearbyFestivalsByContentIdMock,
  getNearbyFestivalsByPoiId: getNearbyFestivalsByPoiIdMock,
}));

import { ExternalApiError } from '../external/common';
import { getNearbyFestivalsController } from './festival.controller';

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

async function run(req: Request) {
  const res = makeRes();
  const next = vi.fn();
  await getNearbyFestivalsController(req, res as unknown as Response, next);
  return { res, next };
}

beforeEach(() => {
  getNearbyFestivalsByContentIdMock.mockReset();
  getNearbyFestivalsByContentIdMock.mockResolvedValue({ status: 'SUCCESS', festivals: [] });
  getNearbyFestivalsByPoiIdMock.mockReset();
  getNearbyFestivalsByPoiIdMock.mockResolvedValue({ status: 'SUCCESS', festivals: [] });
});

describe('getNearbyFestivalsController', () => {
  it('contentId/poiId 둘 다 없거나 둘 다 있으면 400', async () => {
    const invalidQueries: Record<string, string>[] = [
      {},
      { contentId: '126508', poiId: '10817049' },
    ];
    for (const query of invalidQueries) {
      const { res } = await run(makeReq(query));
      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({
        success: false,
        data: null,
        error: { code: 'INVALID_IDENTIFIER' },
      });
    }
    expect(getNearbyFestivalsByContentIdMock).not.toHaveBeenCalled();
    expect(getNearbyFestivalsByPoiIdMock).not.toHaveBeenCalled();
  });

  it('contentId 전달 시 기본 반경으로 서비스에 위임한다', async () => {
    const { res } = await run(makeReq({ contentId: '126508' }));
    expect(res.statusCode).toBe(200);
    expect(getNearbyFestivalsByContentIdMock).toHaveBeenCalledWith('126508', 2000);
    expect(getNearbyFestivalsByPoiIdMock).not.toHaveBeenCalled();
  });

  it('poiId 전달 시 POI 기반 서비스에 위임한다', async () => {
    const { res } = await run(makeReq({ poiId: '10817049', radius: '5000' }));
    expect(res.statusCode).toBe(200);
    expect(getNearbyFestivalsByPoiIdMock).toHaveBeenCalledWith('10817049', 5000);
    expect(getNearbyFestivalsByContentIdMock).not.toHaveBeenCalled();
  });

  it('radius 0/음수/소수/문자열/최대 초과는 400', async () => {
    for (const radius of ['0', '-100', '2.5', 'abc', '20001']) {
      const { res } = await run(makeReq({ contentId: '126508', radius }));
      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({
        success: false,
        data: null,
        error: { code: 'INVALID_RADIUS' },
      });
    }
    expect(getNearbyFestivalsByContentIdMock).not.toHaveBeenCalled();
  });

  it('목적지를 찾지 못하면 404', async () => {
    getNearbyFestivalsByContentIdMock.mockResolvedValue({ status: 'NOT_FOUND' });
    const { res } = await run(makeReq({ contentId: 'missing' }));
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({
      success: false,
      data: null,
      error: { code: 'DESTINATION_NOT_FOUND' },
    });
  });

  it('성공 시 행사 목록을 기존 응답 봉투에 담아 반환한다', async () => {
    const festival = {
      kind: 'FESTIVAL',
      tourApiContentId: '3001',
      name: '서울빛초롱축제',
      address: '서울 종로구',
      latitude: 37.57,
      longitude: 126.98,
      imageUrl: null,
      category: '행사·축제',
      distanceMeters: 620,
      travelTimeMinutes: 10,
      eventStartDate: '20261101',
      eventEndDate: '20261115',
    };
    getNearbyFestivalsByContentIdMock.mockResolvedValue({
      status: 'SUCCESS',
      festivals: [festival],
    });

    const { res } = await run(makeReq({ contentId: '126508', radius: '20000' }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, data: [festival], error: null });
    expect(getNearbyFestivalsByContentIdMock).toHaveBeenCalledWith('126508', 20_000);
  });

  it('외부 API 오류는 next(error)로 위임한다', async () => {
    const error = new ExternalApiError('tour', 'TourAPI unavailable');
    getNearbyFestivalsByContentIdMock.mockRejectedValue(error);

    const { res, next } = await run(makeReq({ contentId: '126508' }));

    expect(next).toHaveBeenCalledWith(error);
    expect(res.statusCode).toBe(0);
  });
});
