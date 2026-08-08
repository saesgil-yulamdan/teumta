import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const {
  getRoutesByPlaceIdMock,
  getRouteByIdMock,
} = vi.hoisted(() => ({
  getRoutesByPlaceIdMock: vi.fn(),
  getRouteByIdMock: vi.fn(),
}));

vi.mock('../services/route.service', () => ({
  getRoutesByPlaceId: getRoutesByPlaceIdMock,
  getRouteById: getRouteByIdMock,
}));

import {
  getRouteByIdController,
  getRoutesByPlaceIdController,
} from './route.controller';

interface FakeResponse {
  statusCode: number;
  body: unknown;
  status: (code: number) => FakeResponse;
  json: (payload: unknown) => FakeResponse;
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

function makeReq(params: Record<string, string>): Request {
  return {
    params,
  } as unknown as Request;
}

async function runRoutesByPlaceId(placeId: string) {
  const req = makeReq({ placeId });
  const res = makeRes();
  const next = vi.fn();

  await getRoutesByPlaceIdController(
    req,
    res as unknown as Response,
    next,
  );

  return { res, next };
}

async function runRouteById(routeId: string) {
  const req = makeReq({ routeId });
  const res = makeRes();
  const next = vi.fn();

  await getRouteByIdController(
    req,
    res as unknown as Response,
    next,
  );

  return { res, next };
}

beforeEach(() => {
  getRoutesByPlaceIdMock.mockReset();
  getRouteByIdMock.mockReset();

  getRoutesByPlaceIdMock.mockResolvedValue([]);
  getRouteByIdMock.mockResolvedValue(null);
});

describe('getRoutesByPlaceIdController', () => {
  it('장소의 코스 목록을 반환한다', async () => {
    const routes = [
      {
        id: 1,
        name: '서촌 우회 코스',
        mainPlaceId: 10,
        description: null,
        estimatedTotalDurationMinutes: 60,
        estimatedTotalDistanceMeters: 2500,
      },
    ];

    getRoutesByPlaceIdMock.mockResolvedValue(routes);

    const { res } = await runRoutesByPlaceId('10');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: routes,
      error: null,
    });

    expect(getRoutesByPlaceIdMock).toHaveBeenCalledWith(10);
  });

  it('코스가 없으면 빈 배열을 반환한다', async () => {
    const { res } = await runRoutesByPlaceId('10');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: [],
      error: null,
    });
  });

  it('잘못된 placeId는 400을 반환한다', async () => {
    for (const placeId of ['abc', '0', '-1', '1.5']) {
      const { res } = await runRoutesByPlaceId(placeId);

      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({
        success: false,
        data: null,
        error: {
          code: 'INVALID_PLACE_ID',
        },
      });
    }

    expect(getRoutesByPlaceIdMock).not.toHaveBeenCalled();
  });
});

describe('getRouteByIdController', () => {
  it('stops가 포함된 코스 상세를 반환한다', async () => {
    const route = {
      id: 1,
      name: '서촌 우회 코스',
      mainPlaceId: 10,
      description: '경복궁 주변 코스',
      estimatedTotalDurationMinutes: 90,
      estimatedTotalDistanceMeters: 3200,
      stops: [
        {
          id: 1,
          routeId: 1,
          placeId: 20,
          stopOrder: 1,
          stayMinutes: 30,
          estimatedTravelMinutesFromPrevious: 10,
          estimatedDistanceMetersFromPrevious: 700,
          pathFromPrevious: [],
        },
      ],
    };

    getRouteByIdMock.mockResolvedValue(route);

    const { res } = await runRouteById('1');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: route,
      error: null,
    });

    expect(getRouteByIdMock).toHaveBeenCalledWith(1);
  });

  it('존재하지 않는 코스는 404 ROUTE_NOT_FOUND를 반환한다', async () => {
    getRouteByIdMock.mockResolvedValue(null);

    const { res } = await runRouteById('999');

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: 'ROUTE_NOT_FOUND',
      },
    });
  });

  it('잘못된 routeId는 400을 반환한다', async () => {
    for (const routeId of ['abc', '0', '-1', '1.5']) {
      const { res } = await runRouteById(routeId);

      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({
        success: false,
        data: null,
        error: {
          code: 'INVALID_ROUTE_ID',
        },
      });
    }

    expect(getRouteByIdMock).not.toHaveBeenCalled();
  });
});