/**
 * 최신 요청만 반영하기 위한 순번 가드.
 *
 * 검색처럼 "요청 중 취소·재요청"이 반복되는 화면에서, 늦게 도착한 응답이
 * 이후 상태를 덮어쓰지 않게 한다. AbortController 대신 쓰는 이유는 외부 API
 * 클라이언트가 취소를 지원하지 않아도(fetch 자체를 막지 않아도) 적용 가능해서다.
 */
export function createRequestGuard() {
  let current = 0;

  return {
    /** 새 요청 시작 — 발급한 id를 응답 처리 시 isCurrent로 검증한다. */
    start(): number {
      current += 1;
      return current;
    },
    /** 응답을 기다리지 않고 즉시 무효화(예: 입력창 비움). 진행 중인 요청은 전부 stale이 된다. */
    invalidate(): void {
      current += 1;
    },
    /** 이 id가 여전히 최신 요청인지. */
    isCurrent(id: number): boolean {
      return id === current;
    },
  };
}
