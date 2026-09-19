import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { LOCATION_OPTIONS } from '@/constants/location';
import type { Coordinate } from '@/types/place';
export type LocationStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'error';
/** Explicit opt-in, foreground only. Coordinates never leave this hook's consumers. */
export function useCurrentLocation(options?: { watch?: boolean }) {
  const watch = options?.watch ?? false;
  const [location, setLocation] = useState<Coordinate | null>(null);
  const [status, setStatus] = useState<LocationStatus>('idle');
  const subscription = useRef<Location.LocationSubscription | null>(null);
  const revision = useRef(0);
  const stop = useCallback(() => {
    revision.current++;
    subscription.current?.remove(); subscription.current = null;
    setLocation(null); setStatus('idle');
  }, []);
  const start = useCallback(async () => {
    stop();
    const request = ++revision.current;
    setStatus('requesting');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (request !== revision.current) return;
      if (!permission.granted) { setStatus('denied'); return; }
      setStatus('granted');
      const update = (position: Location.LocationObject) => {
        if (request === revision.current && AppState.currentState === 'active') setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      };
      if (watch) {
        const next = await Location.watchPositionAsync(LOCATION_OPTIONS, update);
        if (request !== revision.current) next.remove(); else subscription.current = next;
      } else update(await Location.getCurrentPositionAsync(LOCATION_OPTIONS));
    } catch { if (request === revision.current) setStatus('error'); }
  }, [watch, stop]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') stop(); });
    return () => { stop(); listener.remove(); };
  }, [stop]);
  return { location, status, start, stop };
}
