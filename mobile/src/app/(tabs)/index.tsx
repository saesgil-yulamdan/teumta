import { Image } from 'expo-image';
import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { searchPlaces } from '@/api/places';
import { TourApiAttribution } from '@/components/tour-api-attribution';
import { EmptyState } from '@/components/empty-state';
import { PlaceThumbnail } from '@/components/place-thumbnail';
import { ScreenSection } from '@/components/screen-section';
import { TeumtaWaymark } from '@/components/teumta-waymark';
import { Onboarding } from '@/components/onboarding';
import { QuietNow } from '@/components/quiet-now';
import { travel, useTravel, storageError } from '@/stores/travel';
import { TeumtaHybrid, TeumtaLayout } from '@/constants/theme';
import type { SearchPlaceResult } from '@/types/place';
import { createRequestGuard } from '@/utils/request-guard';

type SearchStatus = 'idle' | 'loading' | 'error';


export default function BrowseScreen() {
  const { deletionRevision } = useTravel();
  return <BrowseContent key={deletionRevision} />;
}

function BrowseContent() {
  const router = useRouter();
  const params = useLocalSearchParams<{ search?: string }>();
  const { searches: recent, active } = useTravel();
  const [searching, setSearching] = useState(false);
  const input = useRef<TextInput>(null);
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<SearchPlaceResult[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [hasSearched, setHasSearched] = useState(false);
  const requestGuard = useMemo(() => createRequestGuard(), []);

  useFocusEffect(useCallback(() => {
    if (params.search === '1') {
      setSearching(true);
      input.current?.focus();
      router.setParams({ search: undefined });
    }
  }, [params.search, router]));
  useEffect(() => () => requestGuard.invalidate(), [requestGuard]);
  function clearRecent() { void travel.clearSearches().catch(storageError); }
  function cancelSearch() {
    Keyboard.dismiss(); input.current?.blur(); requestGuard.invalidate();
    setSearching(false); setStatus('idle'); setHasSearched(false); setKeyword(''); setResults([]);
  }

  function handleChangeKeyword(text: string) {
    setKeyword(text);
    setStatus('idle');
    setHasSearched(false);
    // hasSearched=false인데 이전 검색어의 results가 남아있으면 화면이 다른 검색어를 가리킨다 —
    // 진행 중이던 요청도 함께 무효화해, 늦게 도착한 응답이 지금 입력값을 덮어쓰지 않게 한다.
    setResults([]);
    requestGuard.invalidate();
  }

  async function runSearch(term: string) {
    const trimmed = term.trim();
    if (!trimmed) return;

    Keyboard.dismiss();
    setResults([]);
    const requestId = requestGuard.start();
    setKeyword(trimmed);
    setSearching(true);
    void travel.search(trimmed).catch(storageError);
    setStatus('loading');
    try {
      const data = await searchPlaces(trimmed);
      if (!requestGuard.isCurrent(requestId)) return;
      setResults(data);
      setStatus('idle');
    } catch {
      if (!requestGuard.isCurrent(requestId)) return;
      setResults([]);
      setStatus('error');
    } finally {
      if (requestGuard.isCurrent(requestId)) {
        setHasSearched(true);
      }
    }
  }

  // 결과가 아직 없을 때만 최근·추천을 보여준다 — 결과 목록과 겹치면 눈만 어지럽다.
  const showShortcuts = status === 'idle' && !hasSearched && results.length === 0;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <Onboarding />
      <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.fixedHeader}>
          <View style={styles.shortcutHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><TeumtaWaymark /><Text style={styles.sectionTitle}>틈타</Text></View>
            <Pressable accessibilityRole="button" style={styles.clearRecent} onPress={() => router.push('/settings')}><Text style={styles.shortcutClear}>설정·도움</Text></Pressable>
          </View>
          {!searching && <Text style={styles.description}>잠깐 둘러보고, 다시 돌아와요.</Text>}
          <View style={styles.searchRow}>
            <View style={styles.inputWrap}>
              <Image source={require('@/assets/images/icons/search.svg')} style={styles.searchIcon} contentFit="contain" />
              <TextInput ref={input} onFocus={() => { setSearching(true); setHasSearched(false); setResults([]); requestGuard.invalidate(); setStatus('idle'); }} accessibilityLabel="장소 또는 지역 검색어"
                value={keyword} onChangeText={handleChangeKeyword}
                onSubmitEditing={() => void runSearch(keyword)} returnKeyType="search"
                placeholder="관광지, 지역, 테마 검색" placeholderTextColor={TeumtaHybrid.faint}
                style={styles.searchInput} />
              {keyword.length > 0 && (
                <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" style={styles.clearInput} onPress={() => handleChangeKeyword('')}>
                  <Text style={styles.clearLabel}>×</Text>
                </Pressable>
              )}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="검색 실행"
              disabled={!keyword.trim() || status === 'loading'}
              style={[styles.searchButton, (!keyword.trim() || status === 'loading') && styles.searchButtonDisabled]}
              onPress={() => void runSearch(keyword)}>
              <Text style={styles.searchButtonText}>검색</Text>
            </Pressable>
          </View>
          {searching && <Pressable accessibilityRole="button" onPress={cancelSearch} style={styles.clearRecent}><Text style={styles.shortcutClear}>검색 취소</Text></Pressable>}
        </View>
        <ScrollView style={[styles.body, searching && { display: 'none' }]} contentContainerStyle={styles.browseContainer}>
          {active && (
            <Pressable
              accessibilityRole="button"
              style={styles.resumePill}
              onPress={() => router.push('/trip')}>
              <Text style={styles.resumeLabel} numberOfLines={1}>
                {active.selected.destination.name} · 코스 이어가기
              </Text>
              <Text style={styles.resumeArrow}>→</Text>
            </Pressable>
          )}
          <QuietNow />
        </ScrollView>
        <ScrollView style={[styles.body, !searching && { display: 'none' }]} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {showShortcuts && (
            <>
              {recent.length > 0 && (
                <View style={styles.shortcutSection}>
                  <View style={styles.shortcutHeader}>
                    <Text style={styles.sectionTitle}>최근 검색</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="최근 검색어 모두 지우기" onPress={clearRecent} style={styles.clearRecent}>
                      <Text style={styles.shortcutClear}>모두 지우기</Text>
                    </Pressable>
                  </View>
                  <View style={styles.chipWrap}>
                    {recent.map((term) => (
                      <Pressable key={term} accessibilityRole="button" accessibilityLabel={`${term} 다시 검색`}
                        style={styles.chip} onPress={() => void runSearch(term)}>
                        <Text style={styles.chipLabel}>{term}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
              {recent.length === 0 && <Text style={styles.description}>최근 검색이 없어요. 장소나 지역 이름을 입력해 주세요.</Text>}
            </>
          )}
          {status === 'loading' && (
            <View style={styles.loading} accessibilityLiveRegion="polite">
              <ActivityIndicator color={TeumtaHybrid.navy} />
              <Text style={styles.description}>검색 중</Text>
            </View>
          )}
          {status === 'error' && (
            <EmptyState title="잠시 검색하지 못했어요" description="연결 상태를 확인하고 다시 시도해 주세요."
              actionLabel="다시 검색" onAction={() => void runSearch(keyword)} />
          )}
          {status === 'idle' && hasSearched && results.length === 0 && (
            <EmptyState title="아직 찾은 장소가 없어요" description="장소 이름을 짧게 입력하거나 다른 지역으로 검색해 보세요."
              actionLabel="검색어 다시 입력" onAction={() => handleChangeKeyword('')} />
          )}
          {results.length > 0 && (
            <ScreenSection title="검색 결과" meta={`${results.length}곳`}>
              <View style={styles.list}>
                {results.map((place, index) => {
                  const id = place.tourApiContentId ?? place.tmapPoiId;
                  if (!id) return (
                    <View key={`${place.source}-${place.name}-${index}`} style={styles.result}>
                      <SearchResultContent place={place} unavailable />
                    </View>
                  );
                  return (
                    <Link key={`${place.source}-${id}-${index}`} href={{
                      pathname: place.source === 'TOUR' && ['14', '15', '28', '38', '39'].includes(place.contentTypeId ?? '') && place.latitude != null && place.longitude != null ? '/local-places/[id]' : '/places/[id]',
                      params: {
                        id, contentId: place.tourApiContentId ?? undefined, source: place.source, name: place.name, ...(place.contentTypeId === '15' && { category: '행사·축제' }),
                        ...(place.address && { address: place.address }),
                        ...(place.imageUrl && { imageUrl: place.imageUrl }),
                        ...(place.latitude != null && { latitude: String(place.latitude) }),
                        ...(place.longitude != null && { longitude: String(place.longitude) }),
                      },
                    }} asChild>
                      <Pressable accessibilityRole="button" style={styles.result}><SearchResultContent place={place} /></Pressable>
                    </Link>
                  );
                })}
              </View>
            </ScreenSection>
          )}
          {results.some((place) => place.source === 'TOUR') && <TourApiAttribution />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SearchResultContent({ place, unavailable = false }: { place: SearchPlaceResult; unavailable?: boolean; }) {
  return (
    <>
      <PlaceThumbnail imageUrl={place.imageUrl} variant="card" style={styles.thumb} />
      <View style={styles.resultTexts}>
        <Text style={styles.placeName}>{place.name}</Text>
        {place.address && <Text numberOfLines={2} style={styles.location}>{place.address}</Text>}
        {unavailable && <Text style={styles.location}>상세 정보 없음</Text>}
      </View>
      {!unavailable && <Text style={styles.suggestionArrow}>›</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: TeumtaHybrid.paper,
    flex: 1,
  },
  body: {
    flex: 1,
  },
  fixedHeader: {
    backgroundColor: TeumtaHybrid.paper,
    gap: 12,
    paddingTop: 12,
    paddingHorizontal: TeumtaLayout.screenGutter,
    paddingBottom: 20,
  },
  container: {
    gap: 32,
    paddingHorizontal: TeumtaLayout.screenGutter,
    paddingTop: 8,
    paddingBottom: TeumtaLayout.contentBottomPadding,
  },
  browseContainer: {
    gap: 20,
    paddingHorizontal: TeumtaLayout.screenGutter,
    paddingTop: 4,
    paddingBottom: TeumtaLayout.contentBottomPadding,
  },
  resumePill: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.navySoft,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  resumeLabel: {
    color: TeumtaHybrid.navy,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  resumeArrow: {
    color: TeumtaHybrid.navy,
    fontSize: 18,
    fontWeight: '700',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.canvas,
    borderRadius: 10,
    paddingLeft: 14,
    minHeight: 50,
    gap: 8,
  },
  searchIcon: {
    height: 20,
    width: 20,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    color: TeumtaHybrid.ink,
    fontSize: 15,
    paddingVertical: 14,
  },
  clearInput: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    width: 36,
  },
  clearLabel: {
    color: TeumtaHybrid.muted,
    fontSize: 24,
  },
  searchButton: {
    backgroundColor: TeumtaHybrid.navy,
    borderRadius: 10,
    minHeight: 50,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButtonDisabled: {
    backgroundColor: TeumtaHybrid.slate,
  },
  searchButtonText: {
    color: TeumtaHybrid.white,
    fontSize: 15,
    fontWeight: '700',
  },
  shortcutSection: {
    gap: 12,
  },
  shortcutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: TeumtaHybrid.ink,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
  },
  clearRecent: {
    minHeight: 44,
    justifyContent: 'center',
  },
  shortcutClear: {
    color: TeumtaHybrid.muted,
    fontSize: 13,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    backgroundColor: TeumtaHybrid.canvas,
    borderRadius: 8,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  chipLabel: {
    color: TeumtaHybrid.ink,
    fontSize: 14,
    lineHeight: 22,
  },
  description: {
    color: TeumtaHybrid.muted,
    fontSize: 14,
    lineHeight: 23,
  },
  suggestions: {
    gap: 4,
  },
  suggestion: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: TeumtaHybrid.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 50,
  },
  suggestionName: {
    flex: 1,
    color: TeumtaHybrid.ink,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 25,
  },
  suggestionArrow: {
    color: TeumtaHybrid.faint,
    fontSize: 24,
  },
  loading: {
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  list: {
    gap: 0,
  },
  result: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: TeumtaHybrid.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 80,
  },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: 4,
    backgroundColor: TeumtaHybrid.line,
  },
  resultTexts: {
    flex: 1,
    gap: 6,
  },
  placeName: {
    color: TeumtaHybrid.ink,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 25,
  },
  location: {
    color: TeumtaHybrid.muted,
    fontSize: 14,
    lineHeight: 22,
  },
});
