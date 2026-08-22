import type { TmapRouteResponse } from '../external/tmap/tmap.dto';
import type {
  TourApiDetailResponse,
  TourApiListResponse,
  TourApiPlaceItem,
} from '../external/tour/tour.dto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchTourFestivalsMock,
  fetchTourPlaceDetailMock,
  fetchPedestrianRouteMock,
} = vi.hoisted(() => ({
  fetchTourFestivalsMock: vi.fn(),
  fetchTourPlaceDetailMock: vi.fn(),
  fetchPedestrianRouteMock: vi.fn(),
}));

vi.mock('../external/tour', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../external/tour')>();
  return {
    ...actual,
    fetchTourFestivals: fetchTourFestivalsMock,
    fetchTourPlaceDetail: fetchTourPlaceDetailMock,
  };
});

vi.mock('../external/tmap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../external/tmap')>();
  return {
    ...actual,
    fetchPedestrianRoute: fetchPedestrianRouteMock,
  };
});

import { measureNearbyFestivals } from './nearby-festival.service';
import type { DestinationBase } from './nearby-local-place.service';

const BASE: DestinationBase = {
  contentId: '126508',
  name: '경복궁',
  latitude: 37.5788,
  longitude: 126.977,
};

function festivalItem(id: string, title: string, offset = 0): TourApiPlaceItem {
  return {
    contentid: id,
    contenttypeid: '15',
    title,
    addr1: '서울 종로구',
    mapx: String(126.977 + offset * 0.001),
    mapy: String(37.5788 + offset * 0.001),
    eventstartdate: '20260801',
    eventenddate: '20991231',
  };
}

function listResponse(
  items: TourApiPlaceItem[],
  pageNo: number,
  totalCount = items.length,
): TourApiListResponse {
  return {
    response: {
      header: { resultCode: '0000', resultMsg: 'OK' },
      body: {
        items: items.length === 0 ? '' : { item: items },
        numOfRows: 100,
        pageNo,
        totalCount,
      },
    },
  };
}

function detailResponse(): TourApiDetailResponse {
  return {
    response: {
      header: { resultCode: '0000', resultMsg: 'OK' },
      body: {
        items: { item: { contentid: BASE.contentId, lDongRegnCd: '11', lDongSignguCd: '110' } },
        numOfRows: 1,
        pageNo: 1,
        totalCount: 1,
      },
    },
  };
}

function routeResponse(distanceMeters: number): TmapRouteResponse {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [126.977, 37.5788] },
        properties: { totalDistance: distanceMeters, totalTime: distanceMeters },
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchTourPlaceDetailMock.mockResolvedValue(detailResponse());
  fetchPedestrianRouteMock.mockResolvedValue(routeResponse(600));
});

describe('measureNearbyFestivals', () => {
  it('searchFestival2를 최대 3페이지까지 얕게 조회해 후보 누락을 줄인다', async () => {
    fetchTourFestivalsMock.mockImplementation(({ pageNo }: { pageNo?: number }) => {
      const page = pageNo ?? 1;
      return Promise.resolve(
        listResponse([festivalItem(String(page), `행사${page}`, page)], page, 350),
      );
    });

    await measureNearbyFestivals(BASE, 5000);

    expect(fetchTourFestivalsMock).toHaveBeenCalledTimes(3);
    expect(fetchTourFestivalsMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ pageNo: 1 }));
    expect(fetchTourFestivalsMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ pageNo: 2 }));
    expect(fetchTourFestivalsMock).toHaveBeenNthCalledWith(3, expect.objectContaining({ pageNo: 3 }));
  });

  it('totalCount가 1페이지 분량이면 추가 페이지를 호출하지 않는다', async () => {
    fetchTourFestivalsMock.mockResolvedValue(listResponse([festivalItem('1', '행사1')], 1, 1));

    await measureNearbyFestivals(BASE, 5000);

    expect(fetchTourFestivalsMock).toHaveBeenCalledTimes(1);
  });
});
