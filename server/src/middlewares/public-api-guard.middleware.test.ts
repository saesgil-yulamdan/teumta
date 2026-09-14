import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PUBLIC_API_RATE_MAX_COST,
  PUBLIC_API_RATE_WINDOW_MS,
  getPublicApiUsageSnapshot,
  publicApiGuardMiddleware,
  resetPublicApiGuard,
} from './public-api-guard.middleware';

function request(path: string, ip = '1.2.3.4'): Request {
  return { path, ip, method: 'GET' } as Request;
}

function response() {
  const headers: Record<string, string> = {};
  const value = {
    statusCode: 200,
    body: null as unknown,
    set(name: string, content: string) {
      headers[name] = content;
      return value;
    },
    status(code: number) {
      value.statusCode = code;
      return value;
    },
    json(body: unknown) {
      value.body = body;
      return value;
    },
    once: vi.fn(),
    headers,
  };
  return value;
}

beforeEach(() => {
  resetPublicApiGuard();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-08T00:00:00Z'));
});

afterEach(() => vi.useRealTimers());

describe('publicApiGuardMiddleware', () => {
  it('고비용 코스 요청은 가중치로 제한한다', () => {
    const next = vi.fn();
    for (let index = 0; index < PUBLIC_API_RATE_MAX_COST / 15; index += 1) {
      publicApiGuardMiddleware(request('/courses'), response() as unknown as Response, next);
    }
    const blocked = response();
    publicApiGuardMiddleware(request('/courses'), blocked as unknown as Response, next);

    expect(blocked.statusCode).toBe(429);
    expect(blocked.body).toMatchObject({ error: { code: 'PUBLIC_API_RATE_LIMITED' } });
  });

  it('시간 창이 지나면 다시 허용한다', () => {
    const next = vi.fn();
    for (let index = 0; index < PUBLIC_API_RATE_MAX_COST / 15; index += 1) {
      publicApiGuardMiddleware(request('/courses'), response() as unknown as Response, next);
    }
    vi.advanceTimersByTime(PUBLIC_API_RATE_WINDOW_MS + 1);
    const allowed = response();
    publicApiGuardMiddleware(request('/courses'), allowed as unknown as Response, next);

    expect(allowed.statusCode).toBe(200);
  });

  it('일반 조회 사용량이 코스 생성 한도를 잠식하지 않는다', () => {
    const next = vi.fn();
    for (let index = 0; index < PUBLIC_API_RATE_MAX_COST; index += 1) {
      publicApiGuardMiddleware(request('/congestion'), response() as unknown as Response, next);
    }

    const courseResponse = response();
    publicApiGuardMiddleware(
      request('/courses'),
      courseResponse as unknown as Response,
      next,
    );

    expect(courseResponse.statusCode).toBe(200);
  });

  it('마운트되지 않은 과거 관리자 경로도 일반 unknown 요청으로 계측한다', () => {
    const next = vi.fn();
    publicApiGuardMiddleware(request('/admin/routes'), response() as unknown as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(getPublicApiUsageSnapshot()).toMatchObject({
      requests: 1,
      byEndpoint: { 'GET /other': 1 },
    });
  });

  it('endpoint별 요청 수와 가중 비용을 집계한다', () => {
    publicApiGuardMiddleware(request('/local-places'), response() as unknown as Response, vi.fn());
    publicApiGuardMiddleware(request('/search/places'), response() as unknown as Response, vi.fn());

    expect(getPublicApiUsageSnapshot()).toMatchObject({
      requests: 2,
      rejected: 0,
      weightedCost: 7,
      byEndpoint: { 'GET /local-places': 1, 'GET /search/places': 1 },
    });
  });

  it('동적·알 수 없는 경로를 정규화해 집계 키가 무한히 늘지 않게 한다', () => {
    publicApiGuardMiddleware(request('/places/123'), response() as unknown as Response, vi.fn());
    publicApiGuardMiddleware(request('/arbitrary/a'), response() as unknown as Response, vi.fn());
    publicApiGuardMiddleware(request('/arbitrary/b'), response() as unknown as Response, vi.fn());

    expect(getPublicApiUsageSnapshot().byEndpoint).toEqual({
      'GET /other': 3,
    });
  });
});
