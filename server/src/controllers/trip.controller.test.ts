import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { TripEventType } from '@prisma/client';

const {
  createTripMock,
  createTripEventMock,
  getTripByIdMock,
} = vi.hoisted(() => ({
  createTripMock: vi.fn(),
  createTripEventMock: vi.fn(),
  getTripByIdMock: vi.fn(),
}));

vi.mock('../services/trip.service', () => ({
  createTrip: createTripMock,
  createTripEvent: createTripEventMock,
  getTripById: getTripByIdMock,
}));

import {
  createTripController,
  createTripEventController,
  getTripByIdController,
} from './trip.controller';

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

function makeReq(
  params: Record<string, string> = {},
  body: unknown = {},
): Request {
  return {
    params,
    body,
  } as unknown as Request;
}

async function runController(
  controller: (
    req: Request,
    res: Response,
    next: ReturnType<typeof vi.fn>,
  ) => unknown,
  req: Request,
) {
  const res = makeRes();
  const next = vi.fn();

  await controller(
    req,
    res as unknown as Response,
    next,
  );

  return { res, next };
}

beforeEach(() => {
  createTripMock.mockReset();
  createTripEventMock.mockReset();
  getTripByIdMock.mockReset();

  createTripMock.mockResolvedValue(null);
  createTripEventMock.mockResolvedValue(null);
  getTripByIdMock.mockResolvedValue(null);
});

describe('createTripController', () => {
  it('정상적인 routeId로 Trip을 생성하고 201을 반환한다', async () => {
    const trip = {
      id: 1,
      routeId: 10,
      status: 'PLANNED',
      startedAt: null,
      endedAt: null,
    };

    createTripMock.mockResolvedValue(trip);

    const { res } = await runController(
      createTripController,
      makeReq({}, { routeId: 10 }),
    );

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      success: true,
      data: trip,
      error: null,
    });

    expect(createTripMock).toHaveBeenCalledWith(10);
  });

  it('잘못된 routeId는 400 INVALID_ROUTE_ID', async () => {
    for (const routeId of [0, -1, 1.5, 'abc']) {
      const { res } = await runController(
        createTripController,
        makeReq({}, { routeId }),
      );

      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({
        success: false,
        data: null,
        error: {
          code: 'INVALID_ROUTE_ID',
        },
      });
    }

    expect(createTripMock).not.toHaveBeenCalled();
  });

  it('존재하지 않는 Route는 404 ROUTE_NOT_FOUND', async () => {
    createTripMock.mockResolvedValue(null);

    const { res } = await runController(
      createTripController,
      makeReq({}, { routeId: 999 }),
    );

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({
      error: {
        code: 'ROUTE_NOT_FOUND',
      },
    });
  });
});

describe('createTripEventController', () => {
  it('정상적인 이벤트를 생성하고 201을 반환한다', async () => {
    const event = {
      id: 1,
      tripId: 5,
      placeId: 3,
      eventType: TripEventType.PLACE_ARRIVED,
      metadata: {},
    };

    createTripEventMock.mockResolvedValue(event);

    const { res } = await runController(
      createTripEventController,
      makeReq(
        { tripId: '5' },
        {
          eventType: 'PLACE_ARRIVED',
          placeId: 3,
          metadata: {},
        },
      ),
    );

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      success: true,
      data: event,
      error: null,
    });

    expect(createTripEventMock).toHaveBeenCalledWith(5, {
      eventType: TripEventType.PLACE_ARRIVED,
      placeId: 3,
      metadata: {},
    });
  });

  it('잘못된 eventType은 400 INVALID_EVENT_TYPE', async () => {
    const { res } = await runController(
      createTripEventController,
      makeReq(
        { tripId: '5' },
        { eventType: 'WRONG_EVENT' },
      ),
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        code: 'INVALID_EVENT_TYPE',
      },
    });

    expect(createTripEventMock).not.toHaveBeenCalled();
  });

  it('존재하지 않는 Trip은 404 TRIP_NOT_FOUND', async () => {
    createTripEventMock.mockResolvedValue(null);

    const { res } = await runController(
      createTripEventController,
      makeReq(
        { tripId: '999' },
        { eventType: 'TRIP_STARTED' },
      ),
    );

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({
      error: {
        code: 'TRIP_NOT_FOUND',
      },
    });
  });

  it('잘못된 tripId는 400', async () => {
    const { res } = await runController(
      createTripEventController,
      makeReq(
        { tripId: 'abc' },
        { eventType: 'TRIP_STARTED' },
      ),
    );

    expect(res.statusCode).toBe(400);
    expect(createTripEventMock).not.toHaveBeenCalled();
  });

  it('잘못된 placeId는 400', async () => {
    const { res } = await runController(
      createTripEventController,
      makeReq(
        { tripId: '5' },
        {
          eventType: 'PLACE_ARRIVED',
          placeId: 0,
        },
      ),
    );

    expect(res.statusCode).toBe(400);
    expect(createTripEventMock).not.toHaveBeenCalled();
  });
});

describe('getTripByIdController', () => {
  it('events가 포함된 Trip 상세를 반환한다', async () => {
    const trip = {
      id: 5,
      routeId: 10,
      status: 'PLANNED',
      events: [
        {
          id: 1,
          tripId: 5,
          eventType: 'TRIP_STARTED',
        },
      ],
    };

    getTripByIdMock.mockResolvedValue(trip);

    const { res } = await runController(
      getTripByIdController,
      makeReq({ tripId: '5' }),
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: trip,
      error: null,
    });

    expect(getTripByIdMock).toHaveBeenCalledWith(5);
  });

  it('존재하지 않는 Trip은 404 TRIP_NOT_FOUND', async () => {
    const { res } = await runController(
      getTripByIdController,
      makeReq({ tripId: '999' }),
    );

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({
      error: {
        code: 'TRIP_NOT_FOUND',
      },
    });
  });

  it('잘못된 tripId는 400', async () => {
    const { res } = await runController(
      getTripByIdController,
      makeReq({ tripId: '0' }),
    );

    expect(res.statusCode).toBe(400);
    expect(getTripByIdMock).not.toHaveBeenCalled();
  });
});