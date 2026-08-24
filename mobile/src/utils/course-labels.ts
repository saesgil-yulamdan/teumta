import type { GeneratedCourse } from '@/types/course';

export function formatKilometers(meters: number): string {
  return `${(meters / 1000).toFixed(1)}km`;
}

/** 코스 이름은 서버 미제공 → 정류지 이름을 이어 붙여 생성. */
export function courseTitle(course: GeneratedCourse): string {
  return course.stops.map((stop) => stop.name).join(' · ');
}

export function courseCompositionLabel(course: GeneratedCourse): string {
  const festivalCount = course.stops.filter((stop) => stop.kind === 'FESTIVAL').length;
  const localCount = course.stops.length - festivalCount;
  const parts = [
    localCount > 0 ? `로컬 ${localCount}곳` : null,
    festivalCount > 0 ? `행사 ${festivalCount}곳` : null,
  ].filter((part): part is string => part !== null);

  if (parts.length === 0) {
    return '목적지 주변을 가볍게 둘러보고 돌아오는 코스예요.';
  }
  return `${parts.join('과 ')}을 들르고 돌아오는 코스예요.`;
}
