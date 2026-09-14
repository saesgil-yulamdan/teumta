import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getRealtimeCongestion } from '@/api/places';
import { REALTIME_LEVEL_LABEL } from '@/constants/congestion';
import type { DestinationIdentifier } from '@/types/course';
import type { RealtimeCongestion } from '@/types/place';

const CONGESTION_POLL_INTERVAL_MS = 5 * 60 * 1000;

/** 진행 중 목적지 혼잡도를 서버 캐시 주기에 맞춰 갱신하고 완화 전환을 감지한다. */
export function useDestinationCongestion(options: {
  identifier?: DestinationIdentifier;
  destinationName?: string;
  onEased: (title: string, body: string) => void;
  onForeground: () => void;
}) {
  const { identifier, destinationName, onEased, onForeground } = options;
  const requestKey = identifier
    ? 'contentId' in identifier
      ? `tour:${identifier.contentId}`
      : `tmap:${identifier.poiId}`
    : null;
  const [congestionResult, setCongestionResult] = useState<{
    key: string;
    value: RealtimeCongestion;
  } | null>(null);
  const [easedKey, setEasedKey] = useState<string | null>(null);
  const lastLevel = useRef<RealtimeCongestion['level'] | null>(null);
  const easedNotified = useRef(false);

  useEffect(() => {
    if (!identifier || !requestKey) return;
    let ignored = false;
    lastLevel.current = null;
    easedNotified.current = false;

    const fetchCongestion = () => {
      getRealtimeCongestion(identifier)
        .then((data) => {
          if (ignored) return;
          setCongestionResult({ key: requestKey, value: data });
          const previous = lastLevel.current;
          lastLevel.current = data.level;
          const wasCrowded = previous === 'CROWDED' || previous === 'VERY_CROWDED';
          const nowCalm = data.level === 'RELAXED' || data.level === 'NORMAL';
          if (wasCrowded && nowCalm && !easedNotified.current) {
            easedNotified.current = true;
            setEasedKey(requestKey);
            onEased(
              '목적지 혼잡이 풀렸어요',
              `${destinationName ?? '목적지'} 지금 ${REALTIME_LEVEL_LABEL[data.level]} — 돌아가기 좋은 타이밍이에요.`,
            );
          }
        })
        .catch(() => {
          // 혼잡도 조회 실패는 코스 진행을 막지 않는다.
        });
    };

    fetchCongestion();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') fetchCongestion();
    }, CONGESTION_POLL_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        onForeground();
        fetchCongestion();
      }
    });

    return () => {
      ignored = true;
      clearInterval(timer);
      subscription.remove();
    };
  }, [identifier, requestKey, destinationName, onEased, onForeground]);

  return {
    congestion: congestionResult?.key === requestKey ? congestionResult.value : null,
    congestionEased: easedKey === requestKey,
  };
}
