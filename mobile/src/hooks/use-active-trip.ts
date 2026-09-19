import { useTravel } from '@/stores/travel';
export function useActiveTrip() {
  const { active, ready } = useTravel();
  return { selected: active?.selected ?? null, progress: active?.progress ?? null, ready };
}
