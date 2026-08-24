/** GET /api/courses 응답 타입. 요청 시점 생성값이라 DB 미저장. */

import type { Coordinate } from './place';

export type CourseStop = {
  /** LOCAL_PLACE=상설 로컬, FESTIVAL=한시 행사·축제. 구버전 스냅샷은 undefined. */
  kind?: 'LOCAL_PLACE' | 'FESTIVAL';
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  /** 이전 지점(첫 정류지는 목적지)에서 여기까지 보행시간(분). */
  travelMinutesFromPrevious: number;
  distanceMetersFromPrevious: number;
  /**
   * 이전 지점 → 여기까지 TMAP 보행 경로 좌표.
   * 추정 구간은 null, 경로 미제공이면 빈 배열. 구버전 서버·기기 저장 스냅샷에는
   * 필드 자체가 없어서 optional — 없으면 지도는 직선으로 폴백한다.
   */
  pathFromPrevious?: Coordinate[] | null;
  stayMinutes: number;
  eventStartDate?: string | null;
  eventEndDate?: string | null;
};

export type GeneratedCourse = {
  /** 이동+체류+복귀 합산 예상 소요시간(분). */
  totalMinutes: number;
  returnTravelMinutes: number;
  returnDistanceMeters: number;
  /** 마지막 정류지 → 목적지 복귀 보행 경로. 규약은 pathFromPrevious와 동일. */
  returnPath?: Coordinate[] | null;
  /** 정류지 사이 구간이 TMAP 실측이면 true, 추정이면 false. */
  verified: boolean;
  /** 서버가 계산한 코스 추천 근거 태그. 구버전 저장 스냅샷은 undefined. */
  recommendationTags?: string[];
  stops: CourseStop[];
};

export type CourseDestination = {
  name: string;
  latitude: number;
  longitude: number;
};

export type CourseGenerationResult = {
  destination: CourseDestination;
  availableMinutes: number;
  courses: GeneratedCourse[];
};

/** 목적지 식별자. contentId(TourAPI) 또는 poiId(TMAP) 중 하나만. */
export type DestinationIdentifier = { contentId: string } | { poiId: string };

/** 코스 전체 보행거리(m) — 정류지 구간 + 복귀 구간. */
export function courseDistanceMeters(course: GeneratedCourse): number {
  const stopsDistance = course.stops.reduce(
    (total, stop) => total + stop.distanceMetersFromPrevious,
    0,
  );
  return stopsDistance + course.returnDistanceMeters;
}

/** 코스 전체 체류시간(분). */
export function courseStayMinutes(course: GeneratedCourse): number {
  return course.stops.reduce((total, stop) => total + stop.stayMinutes, 0);
}
