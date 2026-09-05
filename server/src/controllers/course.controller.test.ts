import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateCourseAlternativesMock, generateCoursesMock } = vi.hoisted(() => ({
  generateCourseAlternativesMock: vi.fn(),
  generateCoursesMock: vi.fn(),
}));

vi.mock('../services/course-generation.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/course-generation.service')>();
  return {
    ...actual,
    generateCourseAlternatives: generateCourseAlternativesMock,
    generateCourses: generateCoursesMock,
  };
});

import {
  generateCourseAlternativesController,
  generateCoursesController,
} from './course.controller';

interface FakeResponse {
  statusCode: number;
  body: unknown;
  status: (code: number) => FakeResponse;
  json: (payload: unknown) => FakeResponse;
}

function makeReq(query: Record<string, string> = {}): Request {
  return { params: {}, query } as unknown as Request;
}

function makeRes(): FakeResponse {
  const res: FakeResponse = {
    statusCode: 0,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

async function run(query: Record<string, string>) {
  const res = makeRes();
  const next = vi.fn();
  await generateCoursesController(makeReq(query), res as unknown as Response, next);
  return { res, next };
}

async function runAlternatives(query: Record<string, string>) {
  const res = makeRes();
  const next = vi.fn();
  await generateCourseAlternativesController(makeReq(query), res as unknown as Response, next);
  return { res, next };
}

beforeEach(() => {
  generateCoursesMock.mockReset();
  generateCourseAlternativesMock.mockReset();
  generateCoursesMock.mockResolvedValue({
    status: 'SUCCESS',
    result: {
      destination: { name: '경복궁', latitude: 37.5788, longitude: 126.977 },
      availableMinutes: 60,
      courses: [],
    },
  });
  generateCourseAlternativesMock.mockResolvedValue({
    status: 'SUCCESS',
    result: {
      origin: { name: '통인시장', latitude: 37.58, longitude: 126.97 },
      destination: { name: '경복궁', latitude: 37.5788, longitude: 126.977 },
      availableMinutes: 30,
      alternatives: [],
    },
  });
});

describe('generateCourseAlternativesController', () => {
  it('공개 장소 식별자와 제외 목록만 서비스에 전달한다', async () => {
    const { res } = await runAlternatives({
      originContentId: '100',
      contentId: '126508',
      availableMinutes: '30',
      excludeContentIds: '100,200',
    });

    expect(res.statusCode).toBe(200);
    expect(generateCourseAlternativesMock).toHaveBeenCalledWith({
      originContentId: '100',
      contentId: '126508',
      availableMinutes: 30,
      excludeContentIds: ['100', '200'],
    });
  });

  it('출발 정류지가 없으면 400', async () => {
    const { res } = await runAlternatives({ contentId: '126508', availableMinutes: '30' });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'INVALID_ORIGIN' } });
    expect(generateCourseAlternativesMock).not.toHaveBeenCalled();
  });
});

describe('generateCoursesController', () => {
  it('variant 미지정 시 0으로 서비스에 전달한다', async () => {
    const { res } = await run({ contentId: '126508', availableMinutes: '60' });

    expect(res.statusCode).toBe(200);
    expect(generateCoursesMock).toHaveBeenCalledWith({
      contentId: '126508',
      availableMinutes: 60,
      variant: 0,
    });
  });

  it('variant 지정 시 정수로 변환해 서비스에 전달한다', async () => {
    const { res } = await run({ poiId: '362105', availableMinutes: '90', variant: '7' });

    expect(res.statusCode).toBe(200);
    expect(generateCoursesMock).toHaveBeenCalledWith({
      poiId: '362105',
      availableMinutes: 90,
      variant: 7,
    });
  });

  it('variant가 음수/소수/문자열/최대 초과면 400', async () => {
    for (const variant of ['-1', '1.5', 'abc', '1001']) {
      const { res } = await run({ contentId: '126508', availableMinutes: '60', variant });
      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({
        success: false,
        data: null,
        error: { code: 'INVALID_VARIANT' },
      });
    }
    expect(generateCoursesMock).not.toHaveBeenCalled();
  });
});
