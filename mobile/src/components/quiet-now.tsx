import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { createRequestGuard } from '@/utils/request-guard';
import { getApiErrorCode } from '@/api/client';
import { getRealtimeCongestion } from '@/api/places';
import { ALL_REGIONS, FEATURED_DESTINATIONS, type Region } from '@/constants/destinations';
import { REALTIME_LEVEL_LABEL } from '@/constants/congestion';
import type { RealtimeCongestion } from '@/types/place';
import { realtimeBasisLabel } from '@/utils/realtime-status';
import { detailStyles as s } from './detail-styles';

type Entry = { data?: RealtimeCongestion; state: 'ready' | 'unavailable' | 'error' };
export function QuietNow() {
  const [region, setRegion] = useState<Region | null>(null);
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const all = useMemo(() => FEATURED_DESTINATIONS.filter(v => v.region === region), [region]);
  const candidates = useMemo(() => all.slice(page * 3, page * 3 + 3), [all, page]);
  const request = useMemo(() => createRequestGuard(), []);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const token = request.start();
    if (!region) return;
    const timer = setTimeout(() => {
    setLoading(true);
    void Promise.all(candidates.map(async destination => {
      const id = destination.tourApiContentId;
      try {
        const data = await getRealtimeCongestion({ contentId: id });
        return { id, entry: { data, state: data.isRealtime ? 'ready' : 'unavailable' } as Entry };
      } catch (error) {
        return { id, entry: { state: getApiErrorCode(error) === 'CONGESTION_DATA_NOT_FOUND' ? 'unavailable' : 'error' } as Entry };
      }
    })).then(results => {
      if (!request.isCurrent(token)) return;
      setEntries(previous => {
        const next = { ...previous };
        for (const { id, entry } of results) next[id] = entry.state === 'error' ? { ...entry, data: previous[id]?.data } : entry;
        return next;
      });
      setLoading(false); setNow(Date.now());
    });
    }, 0);
    return () => { clearTimeout(timer); request.invalidate(); };
  }, [region, candidates, refresh, request]);
  return <View style={{ gap: 16 }}>
    <Text style={s.title}>어느 지역을 둘러볼까요?</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {ALL_REGIONS.filter(r => FEATURED_DESTINATIONS.some(d => d.region === r)).map(r => <Pressable key={r} accessibilityRole="button" accessibilityState={{ selected: region === r }} style={[s.card, { paddingVertical: 12, paddingHorizontal: 16, borderWidth: region === r ? 1 : 0 }]} onPress={() => { setRegion(r); setPage(0); }}><Text style={region === r ? s.link : s.body}>{r}</Text></Pressable>)}
    </View>
    {!region ? <Text style={s.body}>지역을 선택하면 공개 관광정보에서 골라 둔 대표 장소를 보여드려요. 현재 위치를 사용하지 않습니다.</Text> : <>
      <View style={s.row}><Text style={[s.title, { flex: 1 }]}>{region} 장소 제안</Text><Pressable accessibilityRole="button" disabled={loading} onPress={() => setRefresh(v => v + 1)} style={s.row}><Text style={s.link}>{loading ? '확인 중…' : '혼잡 새로고침'}</Text></Pressable></View>
      <Text style={s.body}>주변 관광정보가 있는 대표 장소 {all.length}곳 중 {page * 3 + 1}–{Math.min(page * 3 + 3, all.length)}번째. 전국 전체 장소나 실시간 인기 순위가 아닙니다.</Text>
      {loading && <ActivityIndicator accessibilityLabel="현재 목록 혼잡도 조회 중" />}
      {candidates.map(destination => {
        const entry = entries[destination.tourApiContentId];
        const data = entry?.data;
        const measured = data?.measuredAt ? Date.parse(data.measuredAt) : NaN;
        const old = Number.isFinite(measured) && now - measured > 30 * 60000;
        const label = entry?.state === 'unavailable' ? '혼잡 미제공' : entry?.state === 'error' ? data ? '갱신 실패 · 이전 정보' : '혼잡 조회 실패' : data ? (old ? '이전 관측 · ' : '') + REALTIME_LEVEL_LABEL[data.level] : '혼잡 확인 중';
        return <Link key={destination.tourApiContentId} href={{ pathname: '/places/[id]', params: { id: destination.tourApiContentId, source: 'TOUR', name: destination.name, address: destination.address, imageUrl: destination.imageUrl ?? '' } }} asChild>
          <Pressable accessibilityRole="button" style={[s.card, { flexDirection: 'row', alignItems: 'center' }]}>
            {destination.imageUrl && <Image source={{ uri: destination.imageUrl }} style={{ width: 64, height: 64, borderRadius: 8 }} />}
            <View style={{ flex: 1, gap: 4 }}><Text style={s.title}>{destination.name}</Text><Text style={s.body}>{destination.areaLabel}</Text><Text style={s.link}>{label}</Text><Text style={s.body}>{data && entry?.state !== 'unavailable' ? realtimeBasisLabel(data.measuredAt).replace('실시간 · ', '') : '관측 시각 미제공'}</Text></View>
          </Pressable>
        </Link>;
      })}
      {all.length > 3 && <Pressable accessibilityRole="button" style={s.row} disabled={loading} onPress={() => setPage(v => (v + 1) % Math.ceil(all.length / 3))}><Text style={s.link}>다른 후보 보기 →</Text></Pressable>}
    </>}
  </View>;
}
