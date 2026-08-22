import { describe, expect, it } from 'vitest';

import {
  ExternalApiNotFoundError,
  ExternalApiResponseError,
} from '../external/common/external-api.error';
import { buildExternalApiLogEntry } from './structured-log';

describe('buildExternalApiLogEntry', () => {
  it('외부 API 오류를 구조화하고 URL 쿼리는 기록하지 않는다', () => {
    const entry = buildExternalApiLogEntry(
      {
        service: 'tour',
        phase: 'http_status',
        error: new ExternalApiResponseError('tour', 'Unexpected response status 500', {
          status: 500,
        }),
        url: 'https://apis.example.invalid/op?serviceKey=SECRET&keyword=경복궁',
        method: 'GET',
      },
      new Date('2026-08-22T12:00:00.000Z'),
    );

    expect(entry).toMatchObject({
      level: 'warn',
      event: 'external_api_issue',
      service: 'tour',
      code: 'INVALID_RESPONSE',
      phase: 'http_status',
      status: 500,
      method: 'GET',
      host: 'apis.example.invalid',
      path: '/op',
      timestamp: '2026-08-22T12:00:00.000Z',
    });
    expect(JSON.stringify(entry)).not.toContain('SECRET');
    expect(JSON.stringify(entry)).not.toContain('keyword');
  });

  it('SK 미커버는 장애성 warn이 아니라 집계 가능한 info로 남긴다', () => {
    const entry = buildExternalApiLogEntry({
      service: 'congestion',
      phase: 'puzzle_not_found',
      error: new ExternalApiNotFoundError('congestion', 'Puzzle API has no data for this POI', {
        code: 'CONGESTION_DATA_NOT_FOUND',
      }),
      detailCode: '404',
    });

    expect(entry.level).toBe('info');
    expect(entry.code).toBe('CONGESTION_DATA_NOT_FOUND');
    expect(entry.detailCode).toBe('404');
  });
});
