import { PlaceType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TourApiListResponse, TourApiPlaceItem } from '../external/tour/tour.dto';
import type { TmapRouteResponse } from '../external/tmap/tmap.dto';

/**
 * 주변 로컬 장소 실시간 조회 서비스 테스트.
 * 실제 TourAPI/TMAP 네트워크는 호출하지 않는다(전부 mock).
 * 매퍼(mapNearbyCandidateList/extractRouteTotals 등)는 실제 구현을 사용해 통합 검증한다.
 */

const {
  prismaMock,
  fetchTourPlaceDetailMock,
  fetchTourPlaceIntroMock,
  fetchTourPlacesByLocationMock,
  fetchPedestrianRouteMock,
  fetchPoiDetailMock,
} = vi.hoisted(() => ({
  prismaMock: {
    place: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  },
  fetchTourPlaceDetailMock: vi.fn(),
  fetchTourPlaceIntroMock: vi.fn(),
  fetchTourPlacesByLocationMock: vi.fn(),
  fetchPedestrianRouteMock: vi.fn(),
  fetchPoiDetailMock: vi.fn(),
}));

vi.mock('../utils/prisma', () => ({ prisma: prismaMock }));

vi.mock('../external/tour', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../external/tour')>();
  return {
    ...actual,
    fetchTourPlaceDetail: fetchTourPlaceDetailMock,
    fetchTourPlaceIntro: fetchTourPlaceIntroMock,
    fetchTourPlacesByLocation: fetchTourPlacesByLocationMock,
  };
});

vi.mock('../external/tmap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../external/tmap')>();
  return {
    ...actual,
    fetchPedestrianRoute: fetchPedestrianRouteMock,
    fetchPoiDetail: fetchPoiDetailMock,
  };
});

import { ExternalApiError } from '../external/common/external-api.error';
import { resolveErrorResponse } from '../middlewares/error.middleware';
import {
  clearNearbyMeasurementCache,
  getLocalPlaceDetail,
  getNearbyLocalPlacesByContentId,
  getNearbyLocalPlacesByPoiId,
  getNearbyLocalPlacesRealtime,
  mapWithConcurrency,
  selectClosestCandidates,
} from './nearby-local-place.service';

const BASE_PLACE = {
  id: 1,
  name: '경복궁',
  type: PlaceType.TOURIST_SPOT,
  latitude: 37.5788,
  longitude: 126.977,
  tourApiContentId: '999',
};

function listItem(overrides: Partial<TourApiPlaceItem> = {}): TourApiPlaceItem {
  return {
    contentid: '100',
    contenttypeid: '39',
    title: '통인시장',
    addr1: '서울 종로구',
    mapx: '126.9700',
    mapy: '37.5800',
    dist: '300',
    ...overrides,
  };
}

function listResponse(items: TourApiPlaceItem[]): TourApiListResponse {
  return {
    response: {
      header: { resultCode: '0000', resultMsg: 'OK' },
      body: {
        items: items.length === 0 ? '' : { item: items },
        numOfRows: items.length,
        pageNo: 1,
        totalCount: items.length,
      },
    },
  };
}

function detailResponse(mapx: string, mapy: string, extraItemFields: Record<string, unknown> = {}) {
  return {
    response: {
      header: { resultCode: '0000', resultMsg: 'OK' },
      body: {
        items: { item: { contentid: '999', title: '경복궁', mapx, mapy, ...extraItemFields } },
        numOfRows: 1,
        pageNo: 1,
        totalCount: 1,
      },
    },
  };
}

function introResponse(fields: Record<string, unknown>) {
  return {
    response: {
      header: { resultCode: '0000', resultMsg: 'OK' },
      body: {
        items: { item: { contentid: '999', ...fields } },
        numOfRows: 1,
        pageNo: 1,
        totalCount: 1,
      },
    },
  };
}

function tmapResponse(totalDistance: number, totalTime: number): TmapRouteResponse {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [126.97, 37.58] },
        properties: { totalDistance, totalTime, pointType: 'SP' },
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearNearbyMeasurementCache();
  prismaMock.place.findUnique.mockResolvedValue(BASE_PLACE);
  fetchTourPlaceDetailMock.mockResolvedValue(detailResponse('126.9770', '37.5788'));
  fetchTourPlaceIntroMock.mockResolvedValue(introResponse({}));
  fetchTourPlacesByLocationMock.mockResolvedValue(listResponse([]));
  fetchPedestrianRouteMock.mockResolvedValue(tmapResponse(500, 400));
});

describe('getNearbyLocalPlacesRealtime — 기준 관광지 검증', () => {
  it('존재하지 않는 장소는 NOT_FOUND', async () => {
    prismaMock.place.findUnique.mockResolvedValue(null);
    expect((await getNearbyLocalPlacesRealtime(1)).status).toBe('NOT_FOUND');
  });

  it('LOCAL_PLACE 기준은 NOT_TOURIST_SPOT', async () => {
    prismaMock.place.findUnique.mockResolvedValue({ ...BASE_PLACE, type: PlaceType.LOCAL_PLACE });
    expect((await getNearbyLocalPlacesRealtime(1)).status).toBe('NOT_TOURIST_SPOT');
  });

  it('tourApiContentId가 없으면 NO_TOUR_CONTENT_ID (외부 API 미호출)', async () => {
    prismaMock.place.findUnique.mockResolvedValue({ ...BASE_PLACE, tourApiContentId: null });
    expect((await getNearbyLocalPlacesRealtime(1)).status).toBe('NO_TOUR_CONTENT_ID');
    expect(fetchTourPlaceDetailMock).not.toHaveBeenCalled();
    expect(fetchTourPlacesByLocationMock).not.toHaveBeenCalled();
  });
});

describe('getNearbyLocalPlacesRealtime — TourAPI 호출', () => {
  it('같은 목적지의 연속 요청은 후보·TMAP 실측 결과를 공유한다', async () => {
    fetchTourPlacesByLocationMock.mockResolvedValue(listResponse([listItem()]));

    await getNearbyLocalPlacesByContentId('999');
    await getNearbyLocalPlacesByContentId('999');

    // 목적지 상세는 두 번 해석하지만, 3개 분류 목록과 보행 실측은 한 번만 수행한다.
    expect(fetchTourPlaceDetailMock).toHaveBeenCalledTimes(2);
    expect(fetchTourPlacesByLocationMock).toHaveBeenCalledTimes(3);
    expect(fetchPedestrianRouteMock).toHaveBeenCalledTimes(1);
  });

  it('radius 미지정 시 기본 2000을 TourAPI에 전달한다', async () => {
    await getNearbyLocalPlacesRealtime(1);
    expect(fetchTourPlacesByLocationMock).toHaveBeenCalledWith(
      expect.objectContaining({ radius: 2000, arrange: 'E' }),
    );
  });

  it('contentTypeId 14/38/39를 각각 호출한다', async () => {
    await getNearbyLocalPlacesRealtime(1, 3000);
    const calledTypes = fetchTourPlacesByLocationMock.mock.calls.map(
      (call) => (call[0] as { contentTypeId: string }).contentTypeId,
    );
    expect(calledTypes.sort()).toEqual(['14', '38', '39']);
  });

  it('detailCommon2의 실시간 좌표를 기준으로 사용한다(DB 좌표 아님)', async () => {
    fetchTourPlaceDetailMock.mockResolvedValue(detailResponse('127.0000', '37.6000'));
    await getNearbyLocalPlacesRealtime(1);
    expect(fetchTourPlacesByLocationMock).toHaveBeenCalledWith(
      expect.objectContaining({ mapX: 127.0, mapY: 37.6 }),
    );
  });

  it('detailCommon2 실패 시 DB 좌표로 fallback 한다(부분 성공)', async () => {
    fetchTourPlaceDetailMock.mockRejectedValue(new ExternalApiError('tour', 'boom'));
    const result = await getNearbyLocalPlacesRealtime(1);
    expect(result.status).toBe('SUCCESS');
    expect(fetchTourPlacesByLocationMock).toHaveBeenCalledWith(
      expect.objectContaining({ mapX: 126.977, mapY: 37.5788 }),
    );
  });

  it('TourAPI 목록 호출이 전부 실패하면 오류를 던지고 502로 매핑된다', async () => {
    fetchTourPlacesByLocationMock.mockRejectedValue(
      new ExternalApiError('tour', 'TourAPI unavailable'),
    );
    await expect(getNearbyLocalPlacesRealtime(1)).rejects.toBeInstanceOf(ExternalApiError);

    try {
      await getNearbyLocalPlacesRealtime(1);
    } catch (error) {
      expect(resolveErrorResponse(error).status).toBe(502);
    }
  });

  it('일부 contentTypeId 호출만 실패하면 성공분으로 진행한다', async () => {
    fetchTourPlacesByLocationMock
      .mockRejectedValueOnce(new ExternalApiError('tour', 'boom'))
      .mockResolvedValue(listResponse([listItem()]));
    const result = await getNearbyLocalPlacesRealtime(1);
    expect(result.status).toBe('SUCCESS');
    if (result.status === 'SUCCESS') {
      expect(result.places).toHaveLength(1);
    }
  });
});

describe('getNearbyLocalPlacesRealtime — 후보 정제', () => {
  it('TourAPI 결과를 정상 매핑한다(name/address/좌표/이미지)', async () => {
    fetchTourPlacesByLocationMock.mockResolvedValue(
      listResponse([listItem({ firstimage: 'a.jpg' })]),
    );
    fetchPedestrianRouteMock.mockResolvedValue(tmapResponse(850, 780));

    const result = await getNearbyLocalPlacesRealtime(1);
    expect(result.status).toBe('SUCCESS');
    if (result.status === 'SUCCESS') {
      expect(result.places[0]).toEqual({
        tourApiContentId: '100',
        name: '통인시장',
        address: '서울 종로구',
        latitude: 37.58,
        longitude: 126.97,
        imageUrl: 'a.jpg',
        category: '음식점', // contenttypeid 39
        distanceMeters: 850,
        travelTimeMinutes: 13, // Math.ceil(780/60)
      });
      // 내부 DB id는 노출하지 않는다(tourApiContentId는 공공데이터 식별자라 3.3c 조회용으로 노출).
      expect(result.places[0]).not.toHaveProperty('id');
    }
  });

  it('cat3로 세부 분류 라벨을 만든다(A05020900 → 카페·찻집)', async () => {
    fetchTourPlacesByLocationMock.mockResolvedValue(
      listResponse([listItem({ contenttypeid: '39', cat3: 'A05020900' })]),
    );
    fetchPedestrianRouteMock.mockResolvedValue(tmapResponse(850, 780));

    const result = await getNearbyLocalPlacesRealtime(1);
    if (result.status === 'SUCCESS') {
      expect(result.places[0].category).toBe('카페·찻집');
    }
  });

  it('표에 없는 cat3는 대분류로 떨어뜨린다', async () => {
    fetchTourPlacesByLocationMock.mockResolvedValue(
      listResponse([listItem({ contenttypeid: '38', cat3: 'A04019999' })]),
    );
    fetchPedestrianRouteMock.mockResolvedValue(tmapResponse(850, 780));

    const result = await getNearbyLocalPlacesRealtime(1);
    if (result.status === 'SUCCESS') {
      expect(result.places[0].category).toBe('쇼핑');
    }
  });

  it('분류를 전혀 모르면 임의 라벨을 만들지 않고 null', async () => {
    fetchTourPlacesByLocationMock.mockResolvedValue(
      listResponse([listItem({ contenttypeid: '25', cat3: undefined })]),
    );
    fetchPedestrianRouteMock.mockResolvedValue(tmapResponse(850, 780));

    const result = await getNearbyLocalPlacesRealtime(1);
    if (result.status === 'SUCCESS') {
      expect(result.places[0].category).toBeNull();
    }
  });

  it('contentId 기준으로 중복을 제거한다(타입별 호출 결과가 겹쳐도 1개)', async () => {
    fetchTourPlacesByLocationMock.mockResolvedValue(listResponse([listItem({ contentid: '100' })]));
    await getNearbyLocalPlacesRealtime(1);
    // 3개 타입 호출 모두 같은 contentid를 반환해도 TMAP은 1번만 호출된다.
    expect(fetchPedestrianRouteMock).toHaveBeenCalledTimes(1);
  });

  it('좌표 없는 후보는 제외한다', async () => {
    fetchTourPlacesByLocationMock
      .mockResolvedValueOnce(
        listResponse([listItem({ contentid: '100' }), listItem({ contentid: '101', mapx: '' })]),
      )
      .mockResolvedValue(listResponse([]));
    await getNearbyLocalPlacesRealtime(1);
    expect(fetchPedestrianRouteMock).toHaveBeenCalledTimes(1);
  });

  it('기준 관광지 자신(contentid 동일)은 제외한다', async () => {
    fetchTourPlacesByLocationMock
      .mockResolvedValueOnce(listResponse([listItem({ contentid: '999' })]))
      .mockResolvedValue(listResponse([]));
    const result = await getNearbyLocalPlacesRealtime(1);
    expect(fetchPedestrianRouteMock).not.toHaveBeenCalled();
    if (result.status === 'SUCCESS') {
      expect(result.places).toEqual([]);
    }
  });

  it('TMAP 호출은 가까운 후보 최대 10개로 제한한다', async () => {
    const many = Array.from({ length: 15 }, (_, index) =>
      listItem({ contentid: String(100 + index), dist: String(100 + index) }),
    );
    fetchTourPlacesByLocationMock
      .mockResolvedValueOnce(listResponse(many))
      .mockResolvedValue(listResponse([]));
    await getNearbyLocalPlacesRealtime(1);
    expect(fetchPedestrianRouteMock).toHaveBeenCalledTimes(10);
  });
});

describe('getNearbyLocalPlacesRealtime — TMAP 거리/정렬', () => {
  it('TMAP totalDistance가 distanceMeters, totalTime이 travelTimeMinutes(ceil)로 들어간다', async () => {
    fetchTourPlacesByLocationMock
      .mockResolvedValueOnce(listResponse([listItem()]))
      .mockResolvedValue(listResponse([]));
    fetchPedestrianRouteMock.mockResolvedValue(tmapResponse(1234, 61));

    const result = await getNearbyLocalPlacesRealtime(1);
    if (result.status === 'SUCCESS') {
      expect(result.places[0].distanceMeters).toBe(1234);
      expect(result.places[0].travelTimeMinutes).toBe(2); // ceil(61/60)
    }
  });

  it('최종 결과는 TMAP distanceMeters 오름차순이다(하버사인/dist 아님)', async () => {
    fetchTourPlacesByLocationMock
      .mockResolvedValueOnce(
        listResponse([
          listItem({ contentid: '100', title: 'A', dist: '100' }),
          listItem({ contentid: '101', title: 'B', dist: '200' }),
        ]),
      )
      .mockResolvedValue(listResponse([]));
    // TourAPI dist 순서(A→B)와 반대로 TMAP 보행거리를 준다.
    fetchPedestrianRouteMock
      .mockResolvedValueOnce(tmapResponse(1500, 900))
      .mockResolvedValueOnce(tmapResponse(700, 500));

    const result = await getNearbyLocalPlacesRealtime(1);
    if (result.status === 'SUCCESS') {
      expect(result.places.map((place) => place.name)).toEqual(['B', 'A']);
      expect(result.places.map((place) => place.distanceMeters)).toEqual([700, 1500]);
    }
  });

  it('TMAP 보행거리가 radius를 넘는 후보는 제외한다', async () => {
    fetchTourPlacesByLocationMock
      .mockResolvedValueOnce(listResponse([listItem()]))
      .mockResolvedValue(listResponse([]));
    fetchPedestrianRouteMock.mockResolvedValue(tmapResponse(2500, 1800));

    const result = await getNearbyLocalPlacesRealtime(1, 2000);
    if (result.status === 'SUCCESS') {
      expect(result.places).toEqual([]);
    }
  });

  it('일부 TMAP 호출 실패 시 해당 후보만 제외하고 부분 성공한다', async () => {
    fetchTourPlacesByLocationMock
      .mockResolvedValueOnce(
        listResponse([
          listItem({ contentid: '100', title: 'A' }),
          listItem({ contentid: '101', title: 'B' }),
        ]),
      )
      .mockResolvedValue(listResponse([]));
    fetchPedestrianRouteMock
      .mockRejectedValueOnce(new ExternalApiError('tmap', 'boom'))
      .mockResolvedValueOnce(tmapResponse(500, 300));

    const result = await getNearbyLocalPlacesRealtime(1);
    expect(result.status).toBe('SUCCESS');
    if (result.status === 'SUCCESS') {
      expect(result.places.map((place) => place.name)).toEqual(['B']);
    }
  });

  it('모든 TMAP 호출이 실패하면 EXTERNAL_API_UNAVAILABLE 오류를 던진다', async () => {
    fetchTourPlacesByLocationMock
      .mockResolvedValueOnce(listResponse([listItem()]))
      .mockResolvedValue(listResponse([]));
    fetchPedestrianRouteMock.mockRejectedValue(new ExternalApiError('tmap', 'boom'));

    await expect(getNearbyLocalPlacesRealtime(1)).rejects.toMatchObject({
      code: 'EXTERNAL_API_UNAVAILABLE',
    });
  });
});

describe('getNearbyLocalPlacesByContentId — 검색으로 고른 목적지 기준', () => {
  it('detailCommon2 실시간 좌표를 기준으로 후보를 찾는다(DB 미사용)', async () => {
    fetchTourPlaceDetailMock.mockResolvedValue(detailResponse('127.1000', '37.6100'));
    fetchTourPlacesByLocationMock
      .mockResolvedValueOnce(listResponse([listItem()]))
      .mockResolvedValue(listResponse([]));

    const result = await getNearbyLocalPlacesByContentId('126508');
    expect(result.status).toBe('SUCCESS');
    expect(fetchTourPlacesByLocationMock).toHaveBeenCalledWith(
      expect.objectContaining({ mapX: 127.1, mapY: 37.61 }),
    );
    expect(prismaMock.place.findUnique).not.toHaveBeenCalled();
  });

  it('상세 좌표가 없으면 NOT_FOUND', async () => {
    fetchTourPlaceDetailMock.mockResolvedValue(detailResponse('', ''));
    expect((await getNearbyLocalPlacesByContentId('999999')).status).toBe('NOT_FOUND');
    expect(fetchTourPlacesByLocationMock).not.toHaveBeenCalled();
  });

  it('상세 조회 실패는 오류로 전파된다(fallback 좌표 없음)', async () => {
    fetchTourPlaceDetailMock.mockRejectedValue(new ExternalApiError('tour', 'boom'));
    await expect(getNearbyLocalPlacesByContentId('126508')).rejects.toBeInstanceOf(
      ExternalApiError,
    );
  });

  it('기준 목적지 자신(contentid 동일)은 결과에서 제외한다', async () => {
    fetchTourPlaceDetailMock.mockResolvedValue(detailResponse('126.9770', '37.5788'));
    fetchTourPlacesByLocationMock
      .mockResolvedValueOnce(listResponse([listItem({ contentid: '126508' })]))
      .mockResolvedValue(listResponse([]));

    const result = await getNearbyLocalPlacesByContentId('126508');
    if (result.status === 'SUCCESS') {
      expect(result.places).toEqual([]);
    }
    expect(fetchPedestrianRouteMock).not.toHaveBeenCalled();
  });
});

describe('getNearbyLocalPlacesByPoiId — TMAP POI 목적지 기준', () => {
  const poiDetail = (lat: string, lon: string) => ({
    poiDetailInfo: { id: '10817049', name: '스타벅스 광화문점', lat, lon },
  });

  it('POI 상세 좌표를 기준으로 후보를 찾는다(DB 미사용)', async () => {
    fetchPoiDetailMock.mockResolvedValue(poiDetail('37.57125916', '126.97629887'));
    fetchTourPlacesByLocationMock
      .mockResolvedValueOnce(listResponse([listItem()]))
      .mockResolvedValue(listResponse([]));

    const result = await getNearbyLocalPlacesByPoiId('10817049');
    expect(result.status).toBe('SUCCESS');
    expect(fetchTourPlacesByLocationMock).toHaveBeenCalledWith(
      expect.objectContaining({ mapX: 126.97629887, mapY: 37.57125916 }),
    );
    expect(prismaMock.place.findUnique).not.toHaveBeenCalled();
  });

  it('POI 좌표가 없으면 NOT_FOUND', async () => {
    fetchPoiDetailMock.mockResolvedValue({ poiDetailInfo: { id: 'x', name: 'x' } });
    expect((await getNearbyLocalPlacesByPoiId('x')).status).toBe('NOT_FOUND');
    expect(fetchTourPlacesByLocationMock).not.toHaveBeenCalled();
  });
});

describe('getNearbyLocalPlacesRealtime — DB 저장 금지 보장', () => {
  it('조회 과정에서 prisma.place.create/update/upsert 를 호출하지 않는다', async () => {
    fetchTourPlacesByLocationMock.mockResolvedValue(listResponse([listItem()]));
    await getNearbyLocalPlacesRealtime(1);

    expect(prismaMock.place.create).not.toHaveBeenCalled();
    expect(prismaMock.place.update).not.toHaveBeenCalled();
    expect(prismaMock.place.upsert).not.toHaveBeenCalled();
    // 읽기는 기준 관광지 1건 조회(findUnique)만 허용된다.
    expect(prismaMock.place.findMany).not.toHaveBeenCalled();
    expect(prismaMock.place.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('selectClosestCandidates', () => {
  const base = { latitude: 37.5788, longitude: 126.977 };
  const candidate = (id: string, dist: number | null, latitude = 37.58) => ({
    tourApiContentId: id,
    contentTypeId: '39',
    categoryCode: null,
    name: id,
    address: null,
    latitude,
    longitude: 126.97,
    imageUrl: null,
    tourDistanceMeters: dist,
  });

  it('TourAPI dist 기준으로 가까운 순 상위 N개만 남긴다', () => {
    const selected = selectClosestCandidates(
      [candidate('a', 300), candidate('b', 100), candidate('c', 200)],
      base,
      2,
    );
    expect(selected.map((entry) => entry.tourApiContentId)).toEqual(['b', 'c']);
  });

  it('dist가 없으면 하버사인으로 선별한다(선별용 전용)', () => {
    const near = candidate('near', null, 37.579);
    const far = candidate('far', null, 37.7);
    expect(selectClosestCandidates([far, near], base, 1)[0].tourApiContentId).toBe('near');
  });
});

describe('mapWithConcurrency', () => {
  it('동시 실행 개수를 제한한다', async () => {
    let running = 0;
    let peak = 0;
    const items = Array.from({ length: 9 }, (_, index) => index);

    await mapWithConcurrency(items, 3, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return null;
    });

    expect(peak).toBeLessThanOrEqual(3);
  });

  it('실패한 항목은 null로 대체하고 나머지는 유지한다', async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async (value) => {
      if (value === 2) {
        throw new Error('boom');
      }
      return value * 10;
    });
    expect(results).toEqual([10, null, 30]);
  });
});

describe('getLocalPlaceDetail', () => {
  it('detailIntro2의 운영시간·휴무일을 병합해 내려준다(음식점 필드명)', async () => {
    fetchTourPlaceDetailMock.mockResolvedValue(
      detailResponse('126.9700', '37.5800', {
        contentid: '100',
        title: '통인시장',
        contenttypeid: '39',
        overview: '재래시장',
      }),
    );
    fetchTourPlaceIntroMock.mockResolvedValue(
      introResponse({ opentimefood: '10:00 ~ 22:00', restdatefood: '매주 월요일' }),
    );

    const detail = await getLocalPlaceDetail('100');

    expect(fetchTourPlaceIntroMock).toHaveBeenCalledWith('100', '39');
    expect(detail).toMatchObject({
      overview: '재래시장',
      openHours: '10:00 ~ 22:00',
      restDays: '매주 월요일',
    });
  });

  it('detailIntro2 실패 시 소개만 내려준다(운영 정보는 부가)', async () => {
    fetchTourPlaceDetailMock.mockResolvedValue(
      detailResponse('126.9700', '37.5800', { contenttypeid: '39' }),
    );
    fetchTourPlaceIntroMock.mockRejectedValue(new ExternalApiError('tour', 'boom'));

    const detail = await getLocalPlaceDetail('999');

    expect(detail).not.toBeNull();
    expect(detail).toMatchObject({ openHours: null, restDays: null });
  });

  it('contentTypeId가 없으면 intro를 호출하지 않는다', async () => {
    fetchTourPlaceDetailMock.mockResolvedValue(detailResponse('126.9700', '37.5800'));

    const detail = await getLocalPlaceDetail('999');

    expect(fetchTourPlaceIntroMock).not.toHaveBeenCalled();
    expect(detail).toMatchObject({ openHours: null, restDays: null });
  });
});
