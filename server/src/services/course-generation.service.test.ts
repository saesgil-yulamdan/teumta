import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 우회 코스 실시간 생성 테스트. 외부 API는 전부 mock. */

const {
  resolveDestinationByContentIdMock,
  measureNearbyLocalPlacesMock,
  measureNearbyFestivalsMock,
  fetchPedestrianRouteMock,
} = vi.hoisted(() => ({
  resolveDestinationByContentIdMock: vi.fn(),
  measureNearbyLocalPlacesMock: vi.fn(),
  measureNearbyFestivalsMock: vi.fn(),
  fetchPedestrianRouteMock: vi.fn(),
}));

vi.mock('./nearby-local-place.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./nearby-local-place.service')>();
  return {
    ...actual,
    resolveDestinationByContentId: resolveDestinationByContentIdMock,
    measureNearbyLocalPlaces: measureNearbyLocalPlacesMock,
  };
});

vi.mock('../external/tmap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../external/tmap')>();
  return { ...actual, fetchPedestrianRoute: fetchPedestrianRouteMock };
});

vi.mock('./nearby-festival.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./nearby-festival.service')>();
  return { ...actual, measureNearbyFestivals: measureNearbyFestivalsMock };
});

import {
  MIN_STAY_MINUTES,
  estimateWalkMinutes,
  generateCourses,
  planCourses,
  stayMinutesFor,
} from './course-generation.service';

const DESTINATION = {
  latitude: 37.5796,
  longitude: 126.977,
  name: '경복궁',
  contentId: '126508',
};

/** 목적지에서 travelMinutes 걸리는 후보. 좌표는 서로 가깝게 둬서 구간 추정을 작게 만든다. */
function measured(
  name: string,
  travelMinutes: number,
  contentTypeId: string,
  offset = 0,
) {
  return {
    candidate: {
      tourApiContentId: name,
      contentTypeId,
      categoryCode: null,
      name,
      address: null,
      latitude: 37.58 + offset * 0.001,
      longitude: 126.97 + offset * 0.001,
      imageUrl: null,
      tourDistanceMeters: null,
    },
    distanceMeters: travelMinutes * 67,
    travelMinutes,
    path: [
      { latitude: DESTINATION.latitude, longitude: DESTINATION.longitude },
      {
        latitude: 37.58 + offset * 0.001,
        longitude: 126.97 + offset * 0.001,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveDestinationByContentIdMock.mockResolvedValue(DESTINATION);
  measureNearbyLocalPlacesMock.mockResolvedValue([]);
  measureNearbyFestivalsMock.mockResolvedValue([]);
  // 실측 검증 구간은 추정과 같은 값이 나오도록 기본값을 둔다.
  fetchPedestrianRouteMock.mockResolvedValue({
    features: [
      { properties: { totalDistance: 200, totalTime: 180 } },
      {
        geometry: {
          type: 'LineString',
          coordinates: [
            [126.97, 37.58],
            [126.971, 37.581],
          ],
        },
        properties: {},
      },
    ],
  });
});

describe('stayMinutesFor', () => {
  it('분류별 기본 체류시간을 쓰고, 모르는 분류는 공통 기본값', () => {
    expect(stayMinutesFor({ contentTypeId: '39' } as never)).toBe(40);
    expect(stayMinutesFor({ contentTypeId: '38' } as never)).toBe(30);
    expect(stayMinutesFor({ contentTypeId: null } as never)).toBe(30);
  });
});

describe('estimateWalkMinutes', () => {
  it('직선거리에 우회 계수를 적용해 분 단위로 올린다', () => {
    const minutes = estimateWalkMinutes(
      { latitude: 37.58, longitude: 126.97 },
      { latitude: 37.585, longitude: 126.97 },
    );
    // 약 556m × 1.3 ÷ 67 ≈ 11분
    expect(minutes).toBeGreaterThan(8);
    expect(minutes).toBeLessThan(14);
  });

  it('같은 위치라도 최소 1분', () => {
    const point = { latitude: 37.58, longitude: 126.97 };
    expect(estimateWalkMinutes(point, point)).toBe(1);
  });
});

describe('planCourses', () => {
  it('최소 체류시간조차 담지 못하는 조합은 제외한다', () => {
    // 왕복 20분 + 최소 체류 15분 = 35분 → 30분 안에는 불가능
    const plans = planCourses([measured('식당', 10, '39')], 30);
    expect(plans).toEqual([]);
    expect(MIN_STAY_MINUTES).toBe(15);
  });

  it('가용 시간 안에 드는 조합만 남긴다', () => {
    const plans = planCourses([measured('식당', 10, '39')], 60);
    expect(plans).toHaveLength(1);
    expect(plans[0].totalMinutes).toBe(60);
  });

  it('시간을 조금 남기더라도 같은 분류 반복보다 다양한 구성을 먼저 제안한다', () => {
    const plans = planCourses(
      [
        measured('식당1', 5, '39'),
        measured('식당2', 6, '39', 1),
        measured('쇼핑', 7, '38', 2),
        measured('미술관', 8, '14', 3),
      ],
      120,
    );

    const topCategories = plans[0].stops.map((stop) => stop.candidate.contentTypeId);
    expect(new Set(topCategories).size).toBe(topCategories.length);
    expect(topCategories).not.toEqual(['39', '39']);
  });

  it('가까운 같은 분류 후보가 많아도 다른 분류 후보를 풀에 남긴다', () => {
    const restaurants = Array.from({ length: 10 }, (_, index) =>
      measured(`식당${index + 1}`, 4 + index, '39', index),
    );
    const festival = {
      ...measured('동네축제', 14, '15', 11),
      candidate: {
        ...measured('동네축제', 14, '15', 11).candidate,
        kind: 'FESTIVAL' as const,
        eventStartDate: '20260801',
        eventEndDate: '20260831',
      },
    };

    const plans = planCourses([...restaurants, festival], 90);

    expect(
      plans.some((plan) => plan.stops.some((stop) => stop.candidate.kind === 'FESTIVAL')),
    ).toBe(true);
  });

  it('diversitySeed가 바뀌면 동점 후보 순위가 달라질 수 있다', () => {
    const candidates = [
      measured('카페1', 5, '39', 1),
      measured('카페2', 5, '39', 2),
      measured('카페3', 5, '39', 3),
      measured('카페4', 5, '39', 4),
    ];

    const first = planCourses(candidates, 60, { diversitySeed: 'variant:0' })[0]
      .stops[0].candidate.name;
    const second = planCourses(candidates, 60, { diversitySeed: 'variant:1' })[0]
      .stops[0].candidate.name;

    expect(first).not.toBe(second);
  });

  it('시간이 빠듯하면 체류시간을 줄여서라도 코스를 만든다', () => {
    // 문화시설 기본 40분 그대로면 왕복 14분 + 40분 = 54분이라 30분 코스가 아예 안 나온다.
    const plans = planCourses([measured('미술관', 7, '14')], 30);

    expect(plans).toHaveLength(1);
    expect(plans[0].stayMinutes).toEqual([16]);
    expect(plans[0].totalMinutes).toBeLessThanOrEqual(30);
  });

  it('최소 체류시간도 확보 못 하면 만들지 않는다', () => {
    // 왕복 24분 + 최소 체류 15분 = 39분 > 30분
    expect(planCourses([measured('미술관', 12, '14')], 30)).toEqual([]);
  });

  it('정류지가 1곳이면 추정 구간이 없어 verified=true', () => {
    expect(planCourses([measured('식당', 8, '39')], 60)[0].verified).toBe(true);
  });

  it('여러 곳을 묶을 때 목적지에서 가까운 순으로 방문 순서를 정한다', () => {
    const plans = planCourses(
      [measured('먼곳', 8, '38', 2), measured('가까운곳', 3, '38')],
      90,
    );
    const twoStop = plans.find((plan) => plan.stops.length === 2);
    expect(twoStop?.stops.map((stop) => stop.candidate.name)).toEqual(['가까운곳', '먼곳']);
  });
});

describe('generateCourses', () => {
  it('목적지를 해석하지 못하면 DESTINATION_NOT_FOUND', async () => {
    resolveDestinationByContentIdMock.mockResolvedValue(null);

    const result = await generateCourses({ contentId: '999', availableMinutes: 60 });

    expect(result.status).toBe('DESTINATION_NOT_FOUND');
    expect(measureNearbyLocalPlacesMock).not.toHaveBeenCalled();
    expect(measureNearbyFestivalsMock).not.toHaveBeenCalled();
  });

  it('주변 후보가 없으면 빈 코스 목록으로 성공한다', async () => {
    const result = await generateCourses({ contentId: '126508', availableMinutes: 60 });

    expect(result).toMatchObject({
      status: 'SUCCESS',
      result: { destination: { name: '경복궁' }, availableMinutes: 60, courses: [] },
    });
    expect(measureNearbyFestivalsMock).toHaveBeenCalled();
  });

  it('코스 구성과 복귀 구간을 함께 반환한다', async () => {
    measureNearbyLocalPlacesMock.mockResolvedValue([measured('통인시장', 10, '38')]);

    const result = await generateCourses({ contentId: '126508', availableMinutes: 60 });
    if (result.status !== 'SUCCESS') {
      throw new Error('expected success');
    }

    const [course] = result.result.courses;
    expect(course.stops).toHaveLength(1);
    expect(course.stops[0]).toMatchObject({
      kind: 'LOCAL_PLACE',
      name: '통인시장',
      travelMinutesFromPrevious: 10,
      stayMinutes: 30,
      pathFromPrevious: [
        { latitude: DESTINATION.latitude, longitude: DESTINATION.longitude },
        { latitude: 37.58, longitude: 126.97 },
      ],
    });
    expect(course.recommendationTags).toEqual(expect.arrayContaining(['혼잡 우회', '짧은 산책']));
    expect(course.returnTravelMinutes).toBe(10);
    expect(course.returnPath).toEqual([
      { latitude: 37.58, longitude: 126.97 },
      { latitude: DESTINATION.latitude, longitude: DESTINATION.longitude },
    ]);
    expect(course.totalMinutes).toBe(50);
    // 정류지가 1곳이면 TMAP 추가 호출이 필요 없다.
    expect(fetchPedestrianRouteMock).not.toHaveBeenCalled();
  });

  it('행사 후보도 코스 후보에 합쳐 반환한다', async () => {
    measureNearbyFestivalsMock.mockResolvedValue([
      {
        ...measured('궁중문화축전', 8, '15'),
        candidate: {
          ...measured('궁중문화축전', 8, '15').candidate,
          kind: 'FESTIVAL',
          eventStartDate: '20260801',
          eventEndDate: '20260831',
        },
      },
    ]);

    const result = await generateCourses({ contentId: '126508', availableMinutes: 60 });
    if (result.status !== 'SUCCESS') {
      throw new Error('expected success');
    }

    const festivalCourse = result.result.courses.find((course) =>
      course.stops.some((stop) => stop.kind === 'FESTIVAL'),
    );
    expect(festivalCourse?.stops[0]).toMatchObject({
      kind: 'FESTIVAL',
      name: '궁중문화축전',
      eventStartDate: '20260801',
      eventEndDate: '20260831',
    });
    expect(festivalCourse?.recommendationTags).toEqual(
      expect.arrayContaining(['혼잡 우회', '행사 포함']),
    );
  });

  it('음식점 후보가 있으면 식사 포함 태그를 반환한다', async () => {
    measureNearbyLocalPlacesMock.mockResolvedValue([measured('로컬식당', 8, '39')]);

    const result = await generateCourses({ contentId: '126508', availableMinutes: 60 });
    if (result.status !== 'SUCCESS') {
      throw new Error('expected success');
    }

    expect(result.result.courses[0].recommendationTags).toEqual(
      expect.arrayContaining(['혼잡 우회', '식사 포함', '짧은 산책']),
    );
  });

  it('정류지가 2곳 이상이면 사이 구간만 TMAP으로 실측한다', async () => {
    measureNearbyLocalPlacesMock.mockResolvedValue([
      measured('첫곳', 5, '38'),
      measured('둘째곳', 7, '38', 1),
    ]);

    const result = await generateCourses({ contentId: '126508', availableMinutes: 90 });
    if (result.status !== 'SUCCESS') {
      throw new Error('expected success');
    }

    const twoStop = result.result.courses.find((course) => course.stops.length === 2);
    expect(twoStop?.verified).toBe(true);
    // 구간 1개(첫곳 → 둘째곳)만 호출한다. 목적지↔정류지는 이미 실측값이 있다.
    expect(fetchPedestrianRouteMock).toHaveBeenCalledTimes(1);
    expect(twoStop?.stops[1].travelMinutesFromPrevious).toBe(3);
    expect(twoStop?.stops[1].pathFromPrevious).toEqual([
      { latitude: 37.58, longitude: 126.97 },
      { latitude: 37.581, longitude: 126.971 },
    ]);
  });

  it('실측 결과 가용 시간을 넘기면 해당 코스를 제외한다', async () => {
    measureNearbyLocalPlacesMock.mockResolvedValue([
      measured('첫곳', 5, '38'),
      measured('둘째곳', 6, '38', 1),
    ]);
    // 추정 3분이던 구간이 실제로는 40분 → 2정류지 코스는 가용 시간을 넘긴다.
    fetchPedestrianRouteMock.mockResolvedValue({
      features: [{ properties: { totalDistance: 3000, totalTime: 2400 } }],
    });

    const result = await generateCourses({ contentId: '126508', availableMinutes: 60 });
    if (result.status !== 'SUCCESS') {
      throw new Error('expected success');
    }

    expect(result.result.courses.every((course) => course.stops.length === 1)).toBe(true);
    expect(result.result.courses.every((course) => course.totalMinutes <= 60)).toBe(true);
  });
});
