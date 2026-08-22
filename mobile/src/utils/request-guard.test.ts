import { describe, expect, it } from 'vitest';

import { createRequestGuard } from './request-guard';

describe('createRequestGuard', () => {
  it('검색 A 이후 검색 B를 시작하면 A의 늦은 응답은 stale로 판정한다', () => {
    const guard = createRequestGuard();

    const requestA = guard.start(); // 경복궁 검색
    const requestB = guard.start(); // 이어서 부산 검색

    // A의 응답이 B보다 늦게 도착
    expect(guard.isCurrent(requestA)).toBe(false);
    expect(guard.isCurrent(requestB)).toBe(true);
  });

  it('요청 중 입력창을 비우면(invalidate) 그 요청의 응답은 stale로 판정한다', () => {
    const guard = createRequestGuard();

    const request = guard.start(); // 경복궁 검색 요청 전송
    guard.invalidate(); // 응답 전에 입력창 비움

    expect(guard.isCurrent(request)).toBe(false);
  });

  it('무효화 없이 정상 완료되면 해당 요청은 계속 최신 상태다', () => {
    const guard = createRequestGuard();

    const request = guard.start();

    expect(guard.isCurrent(request)).toBe(true);
  });
});
