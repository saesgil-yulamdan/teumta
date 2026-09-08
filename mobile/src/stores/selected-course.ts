import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  CourseDestination,
  DestinationIdentifier,
  GeneratedCourse,
} from '@/types/course';

/**
 * 선택한 우회 코스를 화면 사이로 전달.
 *
 * 코스는 요청 시점 생성값이라 조회할 id가 없음. 라우트 파라미터로 넘기기엔 정류지·좌표까지
 * 담아야 해서 과대 → 메모리와 AsyncStorage에 보관(코스 목록 → 지도 → 진행).
 * 앱 재시작 시 저장본을 검증해 복구하고, 완료·종료 시 삭제한다.
 */

export type SelectedCourse = {
  destination: CourseDestination;
  course: GeneratedCourse;
  availableMinutes: number;
  /** 목적지 식별자 — 진행 화면의 혼잡도 재조회용. */
  destinationParams: DestinationIdentifier;
};

let selected: SelectedCourse | null = null;
const STORAGE_KEY = 'teumta:active-course:v1';

function isSelectedCourse(value: unknown): value is SelectedCourse {
  type StoredCandidate = {
    destination?: Partial<CourseDestination>;
    course?: {
      totalMinutes?: number;
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
  const validStops = candidate?.course?.stops?.every(
    (stop) =>
      typeof stop.name === 'string' &&
      Number.isFinite(stop.latitude) &&
      Number.isFinite(stop.longitude),
  );
  return (
    typeof candidate?.destination?.name === 'string' &&
    Number.isFinite(candidate.destination.latitude) &&
    Number.isFinite(candidate.destination.longitude) &&
    Number.isFinite(candidate.course?.totalMinutes) &&
    Array.isArray(candidate.course?.stops) &&
    validStops === true &&
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

export function setSelectedCourse(next: SelectedCourse): void {
  selected = next;
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
}

export function getSelectedCourse(): SelectedCourse | null {
  return selected;
}

/** 앱 프로세스가 종료된 뒤에도 진행 중 코스를 복구한다. */
export async function loadSelectedCourse(): Promise<SelectedCourse | null> {
  if (selected) return selected;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isSelectedCourse(parsed)) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return null;
    }
    selected = parsed;
    return selected;
  } catch {
    return null;
  }
}

export function clearSelectedCourse(): void {
  selected = null;
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}
