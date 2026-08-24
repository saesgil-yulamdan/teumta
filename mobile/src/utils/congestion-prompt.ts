import type { CongestionLevel, RealtimeCongestion } from '@/types/place';

/**
 * 서버가 우회 제안 메타를 내려주면 그 판단을 우선하고, 구서버 응답은 기존 level 기준으로 폴백한다.
 */
export function shouldShowDetourPrompt(
  congestion: RealtimeCongestion | null,
  congestionLevel: CongestionLevel | null,
): boolean {
  if (congestion === null || congestionLevel === null) {
    return false;
  }

  return (
    congestion.detourPrompt?.shouldPrompt ??
    (congestionLevel === 'high' || congestionLevel === 'veryHigh')
  );
}
