import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getApiErrorCode } from '@/api/client';
import { isFreshObservation } from '@/utils/realtime-status';
import { getRealtimeCongestion } from '@/api/places';
import { REALTIME_LEVEL_LABEL } from '@/constants/congestion';
import type { DestinationIdentifier } from '@/types/course';
import type { RealtimeCongestion } from '@/types/place';

const CONGESTION_POLL_INTERVAL_MS = 5 * 60 * 1000;

/** 진행 중 목적지 혼잡도를 서버 캐시 주기에 맞춰 갱신하고 완화 전환을 감지한다. */
export function useDestinationCongestion(options: {
  enabled?: boolean;
  identifier?: DestinationIdentifier;
  destinationName?: string;
  onEased: (title: string, body: string) => void;
  onForeground: () => void;
}) {
  const { enabled = true, identifier, destinationName, onEased, onForeground } = options;
  const requestKey = identifier
    ? 'contentId' in identifier
      ? `tour:${identifier.contentId}`
      : `tmap:${identifier.poiId}`
    : null;
  const [congestionResult, setCongestionResult] = useState<{
    key: string;
    value: RealtimeCongestion;
  } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'unavailable'>('loading');
  const [easedKey, setEasedKey] = useState<string | null>(null);
  const lastLevel = useRef<RealtimeCongestion['level'] | null>(null);
  const easedNotified = useRef(false);

  useEffect(() => {
    if (!enabled || !identifier || !requestKey) return;
    let ignored = false;
    let pending = false;
    lastLevel.current = null;
    easedNotified.current = false;

    const fetchCongestion = () => {
      if (pending) return;
      pending = true;
      getRealtimeCongestion(identifier)
        .then((data) => {
          if (ignored) return;
          setStatus(data.isRealtime ? 'ready' : 'unavailable');
          setCongestionResult({ key: requestKey, value: data });
          if (!data.isRealtime || !isFreshObservation(data.measuredAt)) { setEasedKey(null); return; }
          const previous = lastLevel.current;
          lastLevel.current = data.level;
          const wasCrowded = previous === 'CROWDED' || previous === 'VERY_CROWDED';
          const nowCalm = data.level === 'RELAXED' || data.level === 'NORMAL';
          if (!nowCalm) setEasedKey(null);
          if (wasCrowded && nowCalm && !easedNotified.current) {
            easedNotified.current = true;
            setEasedKey(requestKey);
            onEased(
              '목적지 혼잡 등급이 낮아졌어요',
              `${destinationName ?? '목적지'} 최근 관측 ${REALTIME_LEVEL_LABEL[data.level]} · 현장 상황은 달라질 수 있어요.`,
            );
          }
        })
        .catch(error => {
          if (!ignored) { setStatus(getApiErrorCode(error) === 'CONGESTION_DATA_NOT_FOUND' ? 'unavailable' : 'error'); setEasedKey(null); }
        }).finally(() => { pending = false; });
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
  }, [enabled, identifier, requestKey, destinationName, onEased, onForeground]);

  return {
    status,
    congestion: congestionResult?.key === requestKey ? congestionResult.value : null,
    congestionEased: easedKey === requestKey,
  };
}
