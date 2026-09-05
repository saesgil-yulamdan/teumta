import type { GeneratedCourse } from '@/types/course';

export function remainingTripMinutes(input: {
  course: GeneratedCourse;
  currentIndex: number;
  stayingSince: number | null;
  now: number;
  currentWalkMinutes: number | null;
}): number {
  const { course, currentIndex, stayingSince, now, currentWalkMinutes } = input;
  if (currentIndex > course.stops.length) {
    return 0;
  }
  if (currentIndex === course.stops.length) {
    return Math.max(0, currentWalkMinutes ?? course.returnTravelMinutes);
  }

  const current = course.stops[currentIndex];
  const currentStay =
    stayingSince === null
      ? current.stayMinutes
      : Math.max(0, current.stayMinutes - (now - stayingSince) / 60_000);
  const currentTravel = stayingSince === null
    ? Math.max(0, currentWalkMinutes ?? current.travelMinutesFromPrevious)
    : 0;
  const later = course.stops
    .slice(currentIndex + 1)
    .reduce(
      (total, stop) => total + stop.travelMinutesFromPrevious + stop.stayMinutes,
      0,
    );
  return Math.ceil(currentTravel + currentStay + later + course.returnTravelMinutes);
}

export function remainingDeadlineMinutes(
  startedAt: number | null,
  availableMinutes: number,
  now: number,
): number {
  if (startedAt === null) {
    return availableMinutes;
  }
  return Math.max(0, Math.ceil((startedAt + availableMinutes * 60_000 - now) / 60_000));
}

/** 현재 정류지까지 보존하고 이후 일정을 승인된 대체 장소 1곳으로 교체한다. */
export function courseWithAlternative(
  course: GeneratedCourse,
  currentIndex: number,
  alternative: GeneratedCourse,
): GeneratedCourse {
  return {
    ...course,
    totalMinutes:
      course.stops
        .slice(0, currentIndex)
        .reduce(
          (total, stop) => total + stop.travelMinutesFromPrevious + stop.stayMinutes,
          0,
        ) +
      (course.stops[currentIndex]?.travelMinutesFromPrevious ?? 0) +
      alternative.totalMinutes,
    returnTravelMinutes: alternative.returnTravelMinutes,
    returnDistanceMeters: alternative.returnDistanceMeters,
    returnPath: alternative.returnPath,
    verified: course.verified && alternative.verified,
    stops: [...course.stops.slice(0, currentIndex + 1), ...alternative.stops],
  };
}

/** 현재 정류지 이후 일정을 모두 비우고 바로 원 목적지로 복귀한다. */
export function courseReturningAfterCurrent(
  course: GeneratedCourse,
  currentIndex: number,
  returnLeg: { minutes: number; distanceMeters: number },
): GeneratedCourse {
  const keptStops = course.stops.slice(0, currentIndex + 1);
  return {
    ...course,
    totalMinutes:
      keptStops.slice(0, -1).reduce(
        (total, stop) => total + stop.travelMinutesFromPrevious + stop.stayMinutes,
        0,
      ) +
      (keptStops.at(-1)?.travelMinutesFromPrevious ?? 0) +
      returnLeg.minutes,
    returnTravelMinutes: returnLeg.minutes,
    returnDistanceMeters: returnLeg.distanceMeters,
    // 사용자 현재 위치를 서버/TMAP에 보내지 않으므로 새 복귀선은 직선 폴백을 쓴다.
    returnPath: null,
    stops: keptStops,
    verified: false,
  };
}
