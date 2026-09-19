import type {
  CourseDestination,
  DestinationIdentifier,
  GeneratedCourse,
} from '@/types/course';

/** 코스 비교용 메모리 스냅샷. 현재 여행의 영속 저장소와 독립적입니다. */

export type SelectedCourse = {
  destination: CourseDestination;
  course: GeneratedCourse;
  availableMinutes: number;
  /** 목적지 식별자 — 진행 화면의 혼잡도 재조회용. */
  destinationParams: DestinationIdentifier;
};

let selected: SelectedCourse | null = null;


export function isSelectedCourse(value: unknown): value is SelectedCourse {
  type StoredCandidate = {
    destination?: Partial<CourseDestination>;
    course?: {
      totalMinutes?: number;
      returnTravelMinutes?: number;
      returnDistanceMeters?: number;
      returnPath?: unknown;
      stops?: Partial<GeneratedCourse['stops'][number]>[];
    };
    availableMinutes?: number;
    destinationParams?: { contentId?: unknown; poiId?: unknown };
  };
  const candidate = value as StoredCandidate | null;
  const params = candidate?.destinationParams;
  const validIdentifier =
    (typeof params?.contentId === 'string' && params.contentId.length > 0) ||
    (typeof params?.poiId === 'string' && params.poiId.length > 0);
  const nonnegative = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const nullableText = (v: unknown) => v == null || typeof v === 'string';
  const path = (v: unknown) => v == null || (Array.isArray(v) && v.every(point => point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)));
  const validStops = Array.isArray(candidate?.course?.stops) && candidate.course.stops.every(
    stop => stop && typeof stop.name === 'string' && Number.isFinite(stop.latitude) &&
      Number.isFinite(stop.longitude) && nullableText(stop.address) && nullableText(stop.imageUrl) && nullableText(stop.tourApiContentId) && path(stop.pathFromPrevious) && nonnegative(stop.stayMinutes) &&
      nonnegative(stop.travelMinutesFromPrevious) && nonnegative(stop.distanceMetersFromPrevious),
  );
  return (
    typeof candidate?.destination?.name === 'string' &&
    Number.isFinite(candidate.destination.latitude) &&
    Number.isFinite(candidate.destination.longitude) &&
    nonnegative(candidate.course?.totalMinutes) &&
    nonnegative(candidate.course?.returnTravelMinutes) && nonnegative(candidate.course?.returnDistanceMeters) &&
    Array.isArray(candidate.course?.stops) &&
    validStops === true && path(candidate.course?.returnPath) &&
    Number.isFinite(candidate.availableMinutes) &&
    Number(candidate.availableMinutes) > 0 &&
    validIdentifier
  );
}

export function selectedCourseKey(value: SelectedCourse): string {
  const identifier = 'contentId' in value.destinationParams
    ? `content:${value.destinationParams.contentId}`
    : `poi:${value.destinationParams.poiId}`;
  return [
    identifier,
    value.availableMinutes,
    ...value.course.stops.map((stop) => stop.tourApiContentId ?? stop.name),
  ].join('|');
}

/** Preview only. Never writes or restores an active journey. */
export function setSelectedCourse(next: SelectedCourse): void { selected = next; }
export function getSelectedCourse(): SelectedCourse | null { return selected; }
export async function loadSelectedCourse(): Promise<SelectedCourse | null> { return selected; }
export function clearSelectedCourse(): void { selected = null; }
