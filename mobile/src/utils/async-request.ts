/** 화면 전환·검색 입력 중 늦게 도착한 비동기 응답이 최신 상태를 덮지 않게 하는 순수 헬퍼. */

export function nextRequestId(currentRequestId: number): number {
  return currentRequestId + 1;
}

export function isStaleRequest(requestId: number, latestRequestId: number): boolean {
  return requestId !== latestRequestId;
}
