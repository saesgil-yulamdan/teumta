import { useCallback, useEffect, useState } from 'react';

import { getApiErrorCode } from '@/api/client';
import {
  getConcentrationForecast,
  getNearbyFestivals,
  getNearbyLocalPlaces,
  getRealtimeCongestion,
} from '@/api/places';
import type { DestinationIdentifier } from '@/types/course';
import type {
  ConcentrationForecast,
  NearbyLocalPlaceResult,
  RealtimeCongestion,
} from '@/types/place';

export type PlaceDataStatus = 'idle' | 'loading' | 'error' | 'unavailable';

/** 장소 상세의 실시간 혼잡도·예측·주변 장소 조회 생명주기를 관리한다. */
export function usePlaceLiveData(options: {
  id?: string;
  source?: 'TOUR' | 'TMAP';
}) {
  const { id, source } = options;
  const [congestion, setCongestion] = useState<RealtimeCongestion | null>(null);
  const [congestionStatus, setCongestionStatus] = useState<PlaceDataStatus>('idle');
  const [nearby, setNearby] = useState<NearbyLocalPlaceResult[]>([]);
  const [nearbyStatus, setNearbyStatus] = useState<PlaceDataStatus>('loading');
  const [festivals, setFestivals] = useState<NearbyLocalPlaceResult[]>([]);
  const [festivalStatus, setFestivalStatus] = useState<PlaceDataStatus>('loading');
  const [forecast, setForecast] = useState<ConcentrationForecast | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setRefreshNonce((nonce) => nonce + 1);
  }, []);

  useEffect(() => {
    if (!id || !source) return;
    let ignored = false;
    let deferredLoad: ReturnType<typeof setTimeout> | null = null;

    const startLoad = setTimeout(() => {
      if (ignored) return;
      setCongestion(null);
      setNearby([]);
      setFestivals([]);
      setForecast(null);
      setCongestionStatus('loading');
      setNearbyStatus('loading');
      setFestivalStatus('loading');

      const identifier: DestinationIdentifier =
        source === 'TOUR' ? { contentId: id } : { poiId: id };
      getRealtimeCongestion(identifier)
        .then((data) => {
          if (ignored) return;
          setRefreshing(false);
          setCongestion(data);
          setCongestionStatus(data.isRealtime ? 'idle' : 'unavailable');
        })
        .catch((error: unknown) => {
          if (ignored) return;
          setRefreshing(false);
          setCongestionStatus(
            getApiErrorCode(error) === 'CONGESTION_DATA_NOT_FOUND' ? 'unavailable' : 'error',
          );
        });

      deferredLoad = setTimeout(() => {
        if (ignored) return;
        if (source === 'TOUR') {
          getConcentrationForecast(id)
            .then((data) => {
              if (!ignored) setForecast(data);
            })
            .catch(() => {
              // 예측 없는 장소도 많아 해당 섹션만 숨긴다.
            });
        }

        getNearbyLocalPlaces(identifier)
          .then((data) => {
            if (ignored) return;
            setNearby(data);
            setNearbyStatus('idle');
          })
          .catch(() => {
            if (!ignored) setNearbyStatus('error');
          });

        getNearbyFestivals(identifier)
          .then((data) => {
            if (ignored) return;
            setFestivals(data);
            setFestivalStatus('idle');
          })
          .catch(() => {
            if (!ignored) setFestivalStatus('error');
          });
      }, 350);
    }, 0);

    return () => {
      ignored = true;
      clearTimeout(startLoad);
      if (deferredLoad !== null) clearTimeout(deferredLoad);
    };
  }, [id, source, refreshNonce]);

  return {
    congestion,
    congestionStatus,
    nearby,
    nearbyStatus,
    festivals,
    festivalStatus,
    forecast,
    refreshing,
    refresh,
  };
}
