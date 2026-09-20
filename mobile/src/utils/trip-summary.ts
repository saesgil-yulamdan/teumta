import type { SelectedCourse } from '@/stores/selected-course';
import type { CourseStop, ProgressState } from '@/utils/course-progress-state';

export function courseStopId(stop: SelectedCourse['course']['stops'][number], index: number) {
  return `stop-${stop.tourApiContentId ?? `${index}-${stop.name}`}`;
}

export function courseProgressStops(selected: SelectedCourse): CourseStop[] {
  return [
    ...selected.course.stops.map((stop, index) => ({
      id: courseStopId(stop, index), name: stop.name,
      latitude: stop.latitude, longitude: stop.longitude,
    })),
    { id: 'return', ...selected.destination },
  ];
}

/** 홈에서는 진행 훅을 실행하지 않고 저장본만 검증해서 읽는다. */
export function validRestoredProgress(value: unknown, stops: CourseStop[], knownStops: CourseStop[] = stops): value is ProgressState {
  const state = value as Partial<ProgressState> | null;
  if (!state || typeof state !== 'object') return false;
  const validTime = (time: unknown) => time === null || (typeof time === 'number' && Number.isFinite(time) && time >= 0);
  const current = stops[Number(state.currentIndex)];
  return (
    ['not_started', 'in_progress', 'completed'].includes(String(state.phase)) &&
    Number.isInteger(state.currentIndex) && Number(state.currentIndex) >= 0 &&
    Number(state.currentIndex) <= stops.length &&
    (state.phase !== 'in_progress' || Number(state.currentIndex) < stops.length) &&
    (state.stayingAt === null || (state.stayingAt?.id === current?.id && current?.id !== 'return' &&
      typeof state.stayingAt?.name === 'string' && Number.isFinite(state.stayingAt.latitude) && Number.isFinite(state.stayingAt.longitude))) &&
    validTime(state.stayingSince) && validTime(state.startedAt) &&
    (state.phase !== 'in_progress' || state.startedAt !== null) &&
    (state.stayingAt === null ? state.stayingSince === null : state.stayingSince !== null) &&
    typeof state.outcomes === 'object' && state.outcomes !== null && !Array.isArray(state.outcomes) &&
    Object.entries(state.outcomes).every(([id, outcome]) =>
      knownStops.some((stop) => stop.id === id && id !== 'return') && ['visited', 'skipped', 'unavailable'].includes(outcome))
  );
}

export function parseTripProgress(raw: string | null, key: string, stops: CourseStop[]): ProgressState | null {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object' || !('key' in parsed) || !('state' in parsed)) return null;
    return parsed.key === key && validRestoredProgress(parsed.state, stops) ? parsed.state : null;
  } catch {
    return null;
  }
}

export function summarizeTrip(selected: SelectedCourse, progress: ProgressState | null) {
  const stops = courseProgressStops(selected);
  const inProgress = progress?.phase === 'in_progress';
  const visited = selected.course.stops.filter((stop, index) => progress?.outcomes[courseStopId(stop, index)] === 'visited').length;
  const skipped = selected.course.stops.filter((stop, index) => {
    const outcome = progress?.outcomes[courseStopId(stop, index)];
    return outcome === 'skipped' || outcome === 'unavailable';
  }).length;
  const currentIndex = inProgress ? progress.currentIndex : 0;
  const nextIndex = currentIndex + (progress?.stayingAt ? 1 : 0);
  return {
    inProgress,
    visited,
    skipped,
    total: selected.course.stops.length,
    currentPlace: inProgress ? progress.stayingAt?.name ?? null : null,
    nextPlace: stops[nextIndex]?.name ?? selected.destination.name,
    returning: nextIndex >= selected.course.stops.length,
    // 위치 추적 없이 표시하는 시각이므로 실제 도착 예측과 구분한다.
    plannedReturnAt: inProgress && progress.startedAt !== null
      ? progress.startedAt + selected.course.totalMinutes * 60_000 : null,
  };
}

/** 완료·중단된 여행 회차 목록용 요약. 목적지에 사진이 없어 정류지 이미지로 커버를 고른다. */
export function summarizeJourneyRecord(record: {
  selected: SelectedCourse;
  startedAt: number | null;
  endedAt: number | null;
  status: 'completed' | 'interrupted' | 'legacy';
  completedAll: boolean | null;
  outcomes: Record<string, 'visited' | 'skipped' | 'unavailable'>;
}) {
  const stops = record.selected.course.stops;
  let visited = 0;
  let skipped = 0;
  for (let index = 0; index < stops.length; index += 1) {
    const outcome = record.outcomes[courseStopId(stops[index], index)];
    if (outcome === 'visited') visited += 1;
    else if (outcome === 'skipped' || outcome === 'unavailable') skipped += 1;
  }
  const elapsedMinutes =
    record.startedAt !== null && record.endedAt !== null
      ? Math.max(0, Math.round((record.endedAt - record.startedAt) / 60_000))
      : null;
  const statusLabel =
    record.status === 'legacy'
      ? '이전 버전 기록'
      : record.status === 'interrupted'
        ? '중간 종료'
        : record.completedAll
          ? '모든 장소 방문 · 복귀 완료'
          : '복귀 완료';
  const coverImageUrl =
    stops.find((stop) => typeof stop.imageUrl === 'string' && stop.imageUrl.length > 0)?.imageUrl ??
    null;
  return {
    visited,
    skipped,
    total: stops.length,
    elapsedMinutes,
    statusLabel,
    coverImageUrl,
    dateLabel:
      record.endedAt === null
        ? '날짜 정보 없음'
        : new Date(record.endedAt).toLocaleDateString('ko-KR'),
  };
}
