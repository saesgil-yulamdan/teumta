import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateCoursesMock } = vi.hoisted(() => ({
  generateCoursesMock: vi.fn(),
}));

vi.mock('../services/course-generation.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/course-generation.service')>();
  return {
    ...actual,
    generateCourses: generateCoursesMock,
  };
});

import { generateCoursesController } from './course.controller';

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

beforeEach(() => {
  generateCoursesMock.mockReset();
  generateCoursesMock.mockResolvedValue({
    status: 'SUCCESS',
    result: {
      destination: { name: '경복궁', latitude: 37.5788, longitude: 126.977 },
      availableMinutes: 60,
      courses: [],
    },
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
