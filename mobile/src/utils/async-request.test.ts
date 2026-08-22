import { describe, expect, it } from 'vitest';

import { isStaleRequest, nextRequestId } from './async-request';

describe('async request guards', () => {
  it('새 요청 id는 이전 id보다 1 크다', () => {
    expect(nextRequestId(0)).toBe(1);
    expect(nextRequestId(41)).toBe(42);
  });

  it('늦게 도착한 이전 요청은 stale로 본다', () => {
    expect(isStaleRequest(2, 3)).toBe(true);
    expect(isStaleRequest(3, 3)).toBe(false);
  });
});
