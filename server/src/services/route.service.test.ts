import { beforeEach, describe, expect, it, vi } from 'vitest';

const { routeFindManyMock, routeFindUniqueMock } = vi.hoisted(() => ({
  routeFindManyMock: vi.fn(),
  routeFindUniqueMock: vi.fn(),
}));

vi.mock('../utils/prisma', () => ({
  prisma: {
    route: {
      findMany: routeFindManyMock,
      findUnique: routeFindUniqueMock,
    },
  },
}));

import {
  getRouteById,
  getRoutesByPlaceId,
} from './route.service';

beforeEach(() => {
  routeFindManyMock.mockReset();
  routeFindUniqueMock.mockReset();

  routeFindManyMock.mockResolvedValue([]);
  routeFindUniqueMock.mockResolvedValue(null);
});

describe('getRoutesByPlaceId', () => {
  it('mainPlaceId가 일치하는 코스를 id 오름차순으로 조회한다', async () => {
    const routes = [
      {
        id: 1,
        name: '서촌 우회 코스',
        mainPlaceId: 10,
      },
    ];

    routeFindManyMock.mockResolvedValue(routes);

    const result = await getRoutesByPlaceId(10);

    expect(routeFindManyMock).toHaveBeenCalledWith({
      where: {
        mainPlaceId: 10,
      },
      orderBy: {
        id: 'asc',
      },
    });

    expect(result).toEqual(routes);
  });

  it('코스가 없으면 빈 배열을 반환한다', async () => {
    const result = await getRoutesByPlaceId(10);

    expect(result).toEqual([]);
  });
});

describe('getRouteById', () => {
  it('routeId로 코스를 조회하고 stops를 stopOrder 오름차순으로 포함한다', async () => {
    const route = {
      id: 1,
      name: '서촌 우회 코스',
      mainPlaceId: 10,
      stops: [
        {
          id: 1,
          stopOrder: 1,
        },
        {
          id: 2,
          stopOrder: 2,
        },
      ],
    };

    routeFindUniqueMock.mockResolvedValue(route);

    const result = await getRouteById(1);

    expect(routeFindUniqueMock).toHaveBeenCalledWith({
      where: {
        id: 1,
      },
      include: {
        stops: {
          orderBy: {
            stopOrder: 'asc',
          },
        },
      },
    });

    expect(result).toEqual(route);
  });

  it('존재하지 않는 코스는 null을 반환한다', async () => {
    const result = await getRouteById(999);

    expect(result).toBeNull();
  });
});