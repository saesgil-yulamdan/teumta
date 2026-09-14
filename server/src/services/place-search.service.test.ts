import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 목적지 검색 서비스 테스트. 외부 API는 전부 mock. */

const { fetchTourPlacesByKeywordMock, fetchPoiSearchMock } = vi.hoisted(() => ({
  fetchTourPlacesByKeywordMock: vi.fn(),
  fetchPoiSearchMock: vi.fn(),
}));

vi.mock('../external/tour', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../external/tour')>();
  return { ...actual, fetchTourPlacesByKeyword: fetchTourPlacesByKeywordMock };
});

vi.mock('../external/tmap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../external/tmap')>();
  return { ...actual, fetchPoiSearch: fetchPoiSearchMock };
});

import { searchDestinations } from './place-search.service';

function tourResponse(items: unknown[]) {
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

const tourItem = {
  contentid: '126508',
  contenttypeid: '12',
  title: '경복궁',
  addr1: '서울 종로구',
  mapx: '126.977',
  mapy: '37.5788',
};

const poiResponse = {
  searchPoiInfo: {
    pois: {
      poi: [
        {
          id: '10817049',
          name: '스타벅스 광화문점',
          noorLat: '37.57125916',
          noorLon: '126.97629887',
          upperAddrName: '서울',
          middleAddrName: '종로구',
          roadName: '세종대로',
          firstBuildNo: '167',
        },
      ],
    },
  },
};

beforeEach(() => {
  fetchTourPlacesByKeywordMock.mockReset();
  fetchPoiSearchMock.mockReset();
});

describe('searchDestinations', () => {
  it('TourAPI 결과가 있으면 그대로 반환하고 TMAP은 호출하지 않는다(쿼터 절약)', async () => {
    fetchTourPlacesByKeywordMock.mockResolvedValue(tourResponse([tourItem]));
    const results = await searchDestinations({ keyword: '경복궁' });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      source: 'TOUR',
      tourApiContentId: '126508',
      tmapPoiId: null,
      name: '경복궁',
    });
    expect(fetchPoiSearchMock).not.toHaveBeenCalled();
  });

  it('검색 결과를 DB와 매칭하지 않고 외부 식별자만 반환한다', async () => {
    fetchTourPlacesByKeywordMock.mockResolvedValue(
      tourResponse([tourItem, { ...tourItem, contentid: '999999', title: '미적재 관광지' }]),
    );
    const results = await searchDestinations({ keyword: '경복궁' });

    expect(results.map((result) => result.placeId)).toEqual([null, null]);
  });

  it('TourAPI 결과가 없으면 TMAP POI 검색으로 폴백한다', async () => {
    fetchTourPlacesByKeywordMock.mockResolvedValue(tourResponse([]));
    fetchPoiSearchMock.mockResolvedValue(poiResponse);

    const results = await searchDestinations({ keyword: '스타벅스 광화문' });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      source: 'TMAP',
      tourApiContentId: null,
      tmapPoiId: '10817049',
      name: '스타벅스 광화문점',
      latitude: 37.57125916,
      longitude: 126.97629887,
      address: '서울 종로구 세종대로 167',
      imageUrl: null,
      placeId: null,
    });
  });

  it('TMAP 폴백에서 좌표 없는 POI는 제외한다', async () => {
    fetchTourPlacesByKeywordMock.mockResolvedValue(tourResponse([]));
    fetchPoiSearchMock.mockResolvedValue({
      searchPoiInfo: { pois: { poi: [{ id: '1', name: '좌표없음' }] } },
    });
    expect(await searchDestinations({ keyword: 'x' })).toEqual([]);
  });
});
