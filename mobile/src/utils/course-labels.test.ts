import { describe, expect, it } from 'vitest';

import type { CourseStop, GeneratedCourse } from '@/types/course';

import { courseCompositionLabel, courseTitle, formatKilometers } from './course-labels';

function stop(name: string, kind?: CourseStop['kind']): CourseStop {
  return {
    kind,
    name,
    address: null,
    latitude: 37.57,
    longitude: 126.97,
    imageUrl: null,
    travelMinutesFromPrevious: 5,
    distanceMetersFromPrevious: 320,
    stayMinutes: 15,
  };
}

function course(stops: CourseStop[]): GeneratedCourse {
  return {
    totalMinutes: 60,
    returnTravelMinutes: 5,
    returnDistanceMeters: 300,
    verified: true,
    stops,
  };
}

describe('course labels', () => {
  it('거리 미터를 카드용 km 문자열로 바꾼다', () => {
    expect(formatKilometers(1234)).toBe('1.2km');
  });

  it('정류지 이름으로 코스 제목을 만든다', () => {
    expect(courseTitle(course([stop('통인시장'), stop('서촌 전시공간')]))).toBe(
      '통인시장 · 서촌 전시공간',
    );
  });

  it('로컬과 행사가 섞인 코스 구성을 설명한다', () => {
    expect(courseCompositionLabel(course([stop('통인시장'), stop('궁중문화축전', 'FESTIVAL')]))).toBe(
      '로컬 1곳과 행사 1곳을 들르고 돌아오는 코스예요.',
    );
  });

  it('행사만 있는 코스와 빈 코스도 어색하지 않게 설명한다', () => {
    expect(courseCompositionLabel(course([stop('서울축제', 'FESTIVAL')]))).toBe(
      '행사 1곳을 들르고 돌아오는 코스예요.',
    );
    expect(courseCompositionLabel(course([]))).toBe(
      '목적지 주변을 가볍게 둘러보고 돌아오는 코스예요.',
    );
  });
});
