import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TripEventType } from '@prisma/client';

const {
  routeFindUniqueMock,
  tripFindUniqueMock,
  tripCreateMock,
  tripEventCreateMock,
} = vi.hoisted(() => ({
  routeFindUniqueMock: vi.fn(),
  tripFindUniqueMock: vi.fn(),
  tripCreateMock: vi.fn(),
  tripEventCreateMock: vi.fn(),
}));

vi.mock('../utils/prisma', () => ({
  prisma: {
    route: {
      findUnique: routeFindUniqueMock,
    },
    trip: {
      findUnique: tripFindUniqueMock,
      create: tripCreateMock,
    },
    tripEvent: {
      create: tripEventCreateMock,
    },
  },
}));

import {
  createTrip,
  createTripEvent,
  getTripById,
} from './trip.service';

beforeEach(() => {
  routeFindUniqueMock.mockReset();
  tripFindUniqueMock.mockReset();
  tripCreateMock.mockReset();
  tripEventCreateMock.mockReset();

  routeFindUniqueMock.mockResolvedValue(null);
  tripFindUniqueMock.mockResolvedValue(null);
});

describe('createTrip', () => {
  it('존재하는 Route이면 Trip을 생성한다', async () => {
    const trip = {
      id: 1,
      routeId: 10,
      status: 'PLANNED',
    };

    routeFindUniqueMock.mockResolvedValue({ id: 10 });
    tripCreateMock.mockResolvedValue(trip);

    const result = await createTrip(10);

    expect(routeFindUniqueMock).toHaveBeenCalledWith({
      where: {
        id: 10,
      },
      select: {
        id: true,
      },
    });

    expect(tripCreateMock).toHaveBeenCalledWith({
      data: {
        routeId: 10,
      },
    });

    expect(result).toEqual(trip);
  });

  it('Route가 없으면 null을 반환하고 Trip을 생성하지 않는다', async () => {
    const result = await createTrip(999);

    expect(result).toBeNull();
    expect(tripCreateMock).not.toHaveBeenCalled();
  });
});

describe('createTripEvent', () => {
  it('존재하는 Trip이면 이벤트를 생성한다', async () => {
    const event = {
      id: 1,
      tripId: 5,
      placeId: 3,
      eventType: TripEventType.PLACE_ARRIVED,
      metadata: {},
    };

    tripFindUniqueMock.mockResolvedValue({ id: 5 });
    tripEventCreateMock.mockResolvedValue(event);

    const result = await createTripEvent(5, {
      eventType: TripEventType.PLACE_ARRIVED,
      placeId: 3,
      metadata: {},
    });

    expect(tripFindUniqueMock).toHaveBeenCalledWith({
      where: {
        id: 5,
      },
      select: {
        id: true,
      },
    });

    expect(tripEventCreateMock).toHaveBeenCalledWith({
      data: {
        tripId: 5,
        eventType: TripEventType.PLACE_ARRIVED,
        placeId: 3,
        metadata: {},
      },
    });

    expect(result).toEqual(event);
  });

  it('optional 값이 없으면 placeId와 metadata를 저장 요청에 넣지 않는다', async () => {
    tripFindUniqueMock.mockResolvedValue({ id: 5 });
    tripEventCreateMock.mockResolvedValue({
      id: 2,
      tripId: 5,
      placeId: null,
      eventType: TripEventType.TRIP_STARTED,
      metadata: null,
    });

    await createTripEvent(5, {
      eventType: TripEventType.TRIP_STARTED,
    });

    expect(tripEventCreateMock).toHaveBeenCalledWith({
      data: {
        tripId: 5,
        eventType: TripEventType.TRIP_STARTED,
      },
    });
  });

  it('Trip이 없으면 null을 반환하고 이벤트를 생성하지 않는다', async () => {
    const result = await createTripEvent(999, {
      eventType: TripEventType.TRIP_STARTED,
    });

    expect(result).toBeNull();
    expect(tripEventCreateMock).not.toHaveBeenCalled();
  });
});

describe('getTripById', () => {
  it('Trip을 events 포함, occurredAt 오름차순으로 조회한다', async () => {
    const trip = {
      id: 5,
      routeId: 10,
      status: 'PLANNED',
      events: [],
    };

    tripFindUniqueMock.mockResolvedValue(trip);

    const result = await getTripById(5);

    expect(tripFindUniqueMock).toHaveBeenCalledWith({
      where: {
        id: 5,
      },
      include: {
        events: {
          orderBy: {
            occurredAt: 'asc',
          },
        },
      },
    });

    expect(result).toEqual(trip);
  });

  it('존재하지 않는 Trip은 null을 반환한다', async () => {
    const result = await getTripById(999);

    expect(result).toBeNull();
  });
});