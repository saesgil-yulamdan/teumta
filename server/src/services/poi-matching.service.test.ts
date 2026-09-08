import { beforeEach, describe, expect, it, vi } from 'vitest';

/** TourAPI 관광지 ↔ TMAP POI 매칭 테스트. 외부 API는 전부 mock. */

const {
  fetchTourPlaceDetailMock,
  fetchPoiSearchMock,
  fetchPoiDetailMock,
  fetchRealtimeCongestionMock,
  getSkPoiIndexMock,
} = vi.hoisted(() => ({
  fetchTourPlaceDetailMock: vi.fn(),
  fetchPoiSearchMock: vi.fn(),
  fetchPoiDetailMock: vi.fn(),
  fetchRealtimeCongestionMock: vi.fn(),
  getSkPoiIndexMock: vi.fn(),
}));

vi.mock('../external/tour', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../external/tour')>();
  return { ...actual, fetchTourPlaceDetail: fetchTourPlaceDetailMock };
});

vi.mock('../external/tmap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../external/tmap')>();
  return {
    ...actual,
    fetchPoiSearch: fetchPoiSearchMock,
    fetchPoiDetail: fetchPoiDetailMock,
  };
});

vi.mock('../external/congestion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../external/congestion')>();
  return { ...actual, fetchRealtimeCongestion: fetchRealtimeCongestionMock };
});

vi.mock('./sk-poi-index.service', () => ({
  getSkPoiIndex: getSkPoiIndexMock,
}));

import { ExternalApiNotFoundError } from '../external/common';

import {
  clearPoiMatchCache,
  pickBestPoiMatch,
  resolveTmapPoiId,
} from './poi-matching.service';

/** 경복궁 실제 좌표. */
const GYEONGBOKGUNG = { latitude: 37.5760307, longitude: 126.9767218 };

function tourDetail(item: Record<string, unknown> | null) {
  return {
    response: {
      header: { resultCode: '0000', resultMsg: 'OK' },
      body: { items: item === null ? '' : { item }, numOfRows: 1, pageNo: 1, totalCount: 1 },
    },
  };
}

function poiSearch(pois: Record<string, unknown>[]) {
  return { searchPoiInfo: { pois: { poi: pois } } };
}

/** 테스트용 SK 제공 장소 인덱스. */
function skIndex(poiIds: string[], byName: Record<string, string[]> = {}) {
  const ids = new Set(poiIds);
  return {
    hasPoi: (poiId: string) => ids.has(poiId),
    findPoiIdsByName: (name: string) => byName[name.replace(/\s+/g, '')] ?? [],
    findPoiIdsContainedInName: (name: string) => {
      const target = name.replace(/\s+/g, '');
      return Object.entries(byName)
        .filter(([key]) => key !== target && key.length >= 3 && target.includes(key))
        .sort(([a], [b]) => b.length - a.length)
        .flatMap(([, list]) => list);
    },
    size: ids.size,
  };
}

beforeEach(() => {
  clearPoiMatchCache();
  fetchTourPlaceDetailMock.mockReset();
  fetchPoiSearchMock.mockReset();
  fetchPoiDetailMock.mockReset();
  fetchRealtimeCongestionMock.mockReset();
  getSkPoiIndexMock.mockReset();
  // 기본은 인덱스 없음 — 기존 TMAP 매칭 동작이 그대로인지 먼저 보장한다.
  getSkPoiIndexMock.mockResolvedValue(null);
  // 기본은 실시간 조회 성공 — 검증 단계가 매칭을 바꾸지 않는 상태.
  fetchRealtimeCongestionMock.mockResolvedValue({
    status: { code: '00', message: 'success' },
    contents: { poiId: 'any', rltm: [] },
  });

  fetchTourPlaceDetailMock.mockResolvedValue(
    tourDetail({
      contentid: '126508',
      title: '경복궁',
      mapy: String(GYEONGBOKGUNG.latitude),
      mapx: String(GYEONGBOKGUNG.longitude),
    }),
  );
  fetchPoiSearchMock.mockResolvedValue(
    poiSearch([
      { id: '362105', name: '경복궁', noorLat: '37.5765', noorLon: '126.9770' },
    ]),
  );
});

describe('pickBestPoiMatch', () => {
  const target = { name: '경복궁', coordinate: GYEONGBOKGUNG };

  it('부속 시설이 더 가까워도 이름이 정확히 맞는 본 시설을 고른다', () => {
    // 실제 TMAP 응답: "경복궁 주차장"(id 10051350)이 "경복궁"(id 362105)보다 근소하게 가깝다.
    // SK 혼잡도는 본 시설만 커버해서 거리만 보면 "데이터 없음"이 된다.
    const picked = pickBestPoiMatch(
      [
        { tmapPoiId: '10051350', name: '경복궁 주차장', latitude: 37.57714741, longitude: 126.97885402 },
        { tmapPoiId: '362105', name: '경복궁', latitude: 37.57806394, longitude: 126.97688195 },
      ],
      target,
    );
    expect(picked).toBe('362105');
  });

  it('TourAPI가 지역 접두사·대괄호 표기를 붙여도 본 시설을 고른다', () => {
    // 실제 사례: TourAPI "전북 전주 한옥마을 [슬로시티]" ↔ TMAP "전주한옥마을"(130m).
    // 관광안내소가 7m로 훨씬 가깝지만 SK 혼잡도는 본 시설만 커버한다.
    const picked = pickBestPoiMatch(
      [
        { tmapPoiId: '1555653', name: '전주한옥마을 관광안내소', latitude: 35.81821389, longitude: 127.15363618 },
        { tmapPoiId: '8846569', name: '전주한옥마을 1공영주차장', latitude: 35.81860274, longitude: 127.1539417 },
        { tmapPoiId: '737851', name: '전주한옥마을', latitude: 35.81724177, longitude: 127.15294182 },
      ],
      { name: '전북 전주 한옥마을 [슬로시티]', coordinate: { latitude: 35.8182727649, longitude: 127.1536126138 } },
    );
    expect(picked).toBe('737851');
  });

  it('정확히 맞는 이름이 없으면 포함 관계를 우선한다', () => {
    const picked = pickBestPoiMatch(
      [
        { tmapPoiId: 'parking', name: '경복궁 주차장', latitude: 37.5761, longitude: 126.9767 },
        { tmapPoiId: 'main', name: '경복궁', latitude: 37.5765, longitude: 126.977 },
      ],
      { name: '경복궁(사적)', coordinate: GYEONGBOKGUNG },
    );
    expect(picked).toBe('main');
  });

  it('이름 등급이 같으면 가까운 쪽을 고른다', () => {
    const picked = pickBestPoiMatch(
      [
        { tmapPoiId: 'far', name: '경복궁', latitude: 37.5785, longitude: 126.9767 },
        { tmapPoiId: 'near', name: '경복궁', latitude: 37.5762, longitude: 126.9767 },
      ],
      target,
    );
    expect(picked).toBe('near');
  });

  it('반경 밖만 있으면 억지로 잇지 않는다', () => {
    // 부산의 동명 상호 — 이름만 같다고 매칭하면 엉뚱한 혼잡도를 보여주게 된다.
    const picked = pickBestPoiMatch(
      [{ tmapPoiId: 'busan', name: '경복궁', latitude: 35.1796, longitude: 129.0756 }],
      target,
    );
    expect(picked).toBeNull();
  });

  it('좌표가 없는 후보는 건너뛴다', () => {
    expect(
      pickBestPoiMatch(
        [{ tmapPoiId: 'no-coord', name: '경복궁', latitude: null, longitude: null }],
        target,
      ),
    ).toBeNull();
  });
});

describe('resolveTmapPoiId', () => {
  it('이름+좌표가 맞는 POI의 id를 반환한다', async () => {
    await expect(resolveTmapPoiId('126508')).resolves.toBe('362105');
    expect(fetchPoiSearchMock).toHaveBeenCalledWith('경복궁', { count: 5 });
    expect(getSkPoiIndexMock).not.toHaveBeenCalled();
  });

  it('두 번째 호출은 캐시로 답하고 외부 API를 다시 부르지 않는다', async () => {
    await resolveTmapPoiId('126508');
    await resolveTmapPoiId('126508');

    expect(fetchTourPlaceDetailMock).toHaveBeenCalledTimes(1);
    expect(fetchPoiSearchMock).toHaveBeenCalledTimes(1);
  });

  it('매칭 실패도 캐시한다(같은 장소로 쿼터를 반복 소모하지 않도록)', async () => {
    fetchPoiSearchMock.mockResolvedValue(
      poiSearch([{ id: '999', name: '경복궁', noorLat: '35.1796', noorLon: '129.0756' }]),
    );

    await expect(resolveTmapPoiId('126508')).resolves.toBeNull();
    await expect(resolveTmapPoiId('126508')).resolves.toBeNull();
    expect(fetchTourPlaceDetailMock).toHaveBeenCalledTimes(1);
  });

  it('상세에 좌표가 없으면 이름만으로 잇지 않고 null', async () => {
    fetchTourPlaceDetailMock.mockResolvedValue(
      tourDetail({ contentid: '126508', title: '경복궁', mapx: '', mapy: '' }),
    );

    await expect(resolveTmapPoiId('126508')).resolves.toBeNull();
    expect(fetchPoiSearchMock).not.toHaveBeenCalled();
  });

  it('상세 항목이 없으면 null', async () => {
    fetchTourPlaceDetailMock.mockResolvedValue(tourDetail(null));

    await expect(resolveTmapPoiId('126508')).resolves.toBeNull();
    expect(fetchPoiSearchMock).not.toHaveBeenCalled();
  });
});

describe('SK 제공 장소 인덱스 연동', () => {
  it('반경 안 후보 중 SK가 커버하는 쪽을 우선한다(이름 랭크보다 먼저)', () => {
    const picked = pickBestPoiMatch(
      [
        { tmapPoiId: '100', name: '경복궁', latitude: 37.5761, longitude: 126.9768 },
        { tmapPoiId: '200', name: '경복궁 안내소', latitude: 37.5762, longitude: 126.9769 },
      ],
      { name: '경복궁', coordinate: { latitude: 37.5760307, longitude: 126.9767218 } },
      { hasPoi: (poiId: string) => poiId === '200' },
    );
    expect(picked).toBe('200');
  });

  it('TMAP 최적 후보가 실시간 미제공이면 이름 역매칭 후보로 확정한다', async () => {
    // 실제 케이스: 에버랜드 — TMAP 검색은 주차장류 id만 주지만 목록에는 "에버랜드"(387701)가 있고
    // rltm도 387701만 성공한다. 최종 판정은 실시간 조회 검증.
    getSkPoiIndexMock.mockResolvedValue(
      skIndex(['387701'], { 에버랜드: ['387701'] }),
    );
    fetchTourPlaceDetailMock.mockResolvedValue(
      tourDetail({ contentid: '127797', title: '에버랜드', mapy: '37.2940', mapx: '127.2020' }),
    );
    fetchPoiSearchMock.mockResolvedValue(
      poiSearch([{ id: '999999', name: '에버랜드 주차장', noorLat: '37.2941', noorLon: '127.2021' }]),
    );
    fetchPoiDetailMock.mockResolvedValue({
      poiDetailInfo: { id: '387701', name: '에버랜드', lat: '37.2939', lon: '127.2019' },
    });
    fetchRealtimeCongestionMock.mockImplementation((poiId: string | number) => {
      if (String(poiId) === '387701') {
        return Promise.resolve({ status: { code: '00', message: 'success' }, contents: {} });
      }
      return Promise.reject(
        new ExternalApiNotFoundError('congestion', 'no data', {
          code: 'CONGESTION_DATA_NOT_FOUND',
        }),
      );
    });

    await expect(resolveTmapPoiId('127797')).resolves.toBe('387701');
    expect(fetchPoiDetailMock).toHaveBeenCalledWith('387701');
  });

  it('목록에 있어도 전 후보가 실시간 미제공(통계 전용)이면 기존 최적 후보를 유지한다', async () => {
    // 실측: 불국사·남이섬은 "데이터 제공 가능 장소" 목록에는 있지만 rltm은 404다.
    getSkPoiIndexMock.mockResolvedValue(skIndex(['318106'], { 불국사: ['318106'] }));
    fetchTourPlaceDetailMock.mockResolvedValue(
      tourDetail({ contentid: '126166', title: '불국사', mapy: '35.7900', mapx: '129.3320' }),
    );
    fetchPoiSearchMock.mockResolvedValue(
      poiSearch([{ id: '318106', name: '불국사', noorLat: '35.7901', noorLon: '129.3321' }]),
    );
    fetchRealtimeCongestionMock.mockRejectedValue(
      new ExternalApiNotFoundError('congestion', 'no data', {
        code: 'CONGESTION_DATA_NOT_FOUND',
      }),
    );

    await expect(resolveTmapPoiId('126166')).resolves.toBe('318106');
  });

  it('검증 중 일시 장애(5xx류)는 미커버로 오판하지 않고 기존 후보를 유지한다', async () => {
    fetchRealtimeCongestionMock.mockRejectedValue(new Error('upstream down'));

    await expect(resolveTmapPoiId('126508')).resolves.toBe('362105');
  });

  it('이름이 같아도 좌표가 반경 밖이면 역매칭하지 않는다(동명이소 차단)', async () => {
    getSkPoiIndexMock.mockResolvedValue(skIndex(['555'], { 경복궁: ['555'] }));
    // TMAP 검색 결과 없음 → 기존 매칭 실패 상황
    fetchPoiSearchMock.mockResolvedValue(poiSearch([]));
    // 동명이지만 부산 좌표
    fetchPoiDetailMock.mockResolvedValue({
      poiDetailInfo: { id: '555', name: '경복궁', lat: '35.1796', lon: '129.0756' },
    });

    await expect(resolveTmapPoiId('126508')).resolves.toBeNull();
  });

  it('인덱스 로드 실패(null)면 기존 TMAP 매칭 결과를 그대로 쓴다', async () => {
    getSkPoiIndexMock.mockResolvedValue(null);
    await expect(resolveTmapPoiId('126508')).resolves.toBe('362105');
    expect(fetchPoiDetailMock).not.toHaveBeenCalled();
  });
});

describe('이름 포함 방향 폴백', () => {
  it('TourAPI가 부가 표기를 붙이면 목록의 더 짧은 본시설명으로 잇는다(수원화성)', async () => {
    getSkPoiIndexMock.mockResolvedValue(
      skIndex(['205065', '10289502'], {
        수원화성: ['205065'],
        수원화성관광특구: ['10289502'],
      }),
    );
    fetchTourPlaceDetailMock.mockResolvedValue(
      tourDetail({ contentid: '2480899', title: '수원화성 관광특구', mapy: '37.2776', mapx: '127.0168' }),
    );
    fetchPoiSearchMock.mockResolvedValue(poiSearch([]));
    fetchPoiDetailMock.mockImplementation((poiId: string | number) =>
      Promise.resolve({
        poiDetailInfo:
          String(poiId) === '205065'
            ? { id: '205065', name: '수원화성', lat: '37.2814', lon: '127.0098' }
            : { id: '10289502', name: '수원화성 관광특구', lat: '37.2776', lon: '127.0168' },
      }),
    );
    // 정확 일치(관광특구)는 실시간 미제공, 본시설(수원화성)만 제공 — 실측 재현
    fetchRealtimeCongestionMock.mockImplementation((poiId: string | number) => {
      if (String(poiId) === '205065') {
        return Promise.resolve({ status: { code: '00', message: 'success' }, contents: {} });
      }
      return Promise.reject(
        new ExternalApiNotFoundError('congestion', 'no data', {
          code: 'CONGESTION_DATA_NOT_FOUND',
        }),
      );
    });

    await expect(resolveTmapPoiId('2480899')).resolves.toBe('205065');
  });

  it('반대 방향(목록명이 target을 포함 — "청계천"→"청계천박물관")은 후보로 잡지 않는다', async () => {
    getSkPoiIndexMock.mockResolvedValue(
      skIndex(['1157887'], { 청계천박물관: ['1157887'] }),
    );
    fetchTourPlaceDetailMock.mockResolvedValue(
      tourDetail({ contentid: '129507', title: '청계천', mapy: '37.5696', mapx: '127.0056' }),
    );
    fetchPoiSearchMock.mockResolvedValue(poiSearch([]));

    await expect(resolveTmapPoiId('129507')).resolves.toBeNull();
    expect(fetchPoiDetailMock).not.toHaveBeenCalled();
  });
});

describe('수동 확정 매핑', () => {
  it('자동 규칙로 못 잇는 표기 차이는 확정 매핑으로 최우선 검증한다(태화강)', async () => {
    fetchTourPlaceDetailMock.mockResolvedValue(
      tourDetail({ contentid: '128201', title: '태화강', mapy: '35.5470', mapx: '129.3160' }),
    );
    // TMAP 검색·SK 인덱스가 아무것도 못 줘도 확정 매핑이 후보에 들어간다
    fetchPoiSearchMock.mockResolvedValue(poiSearch([]));

    await expect(resolveTmapPoiId('128201')).resolves.toBe('1129510');
    expect(fetchRealtimeCongestionMock).toHaveBeenCalledWith('1129510');
  });

  it('확정 매핑도 실조회 검증을 통과해야 한다 — 낡은 값은 폴백', async () => {
    fetchTourPlaceDetailMock.mockResolvedValue(
      tourDetail({ contentid: '128201', title: '태화강', mapy: '35.5470', mapx: '129.3160' }),
    );
    fetchPoiSearchMock.mockResolvedValue(poiSearch([]));
    fetchRealtimeCongestionMock.mockRejectedValue(
      new ExternalApiNotFoundError('congestion', 'no data', {
        code: 'CONGESTION_DATA_NOT_FOUND',
      }),
    );

    await expect(resolveTmapPoiId('128201')).resolves.toBeNull();
  });
});
