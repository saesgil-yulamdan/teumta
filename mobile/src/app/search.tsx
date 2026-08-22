import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { searchPlaces } from '@/api/places';
import { TourApiAttribution } from '@/components/tour-api-attribution';
import { Teumta } from '@/constants/theme';
import type { SearchPlaceResult } from '@/types/place';
import {
  MAX_RECENT_SEARCHES,
  clearRecentSearchesStorage,
  loadRecentSearches,
  saveRecentSearches,
} from '@/utils/recent-searches';
import { isStaleRequest, nextRequestId } from '@/utils/async-request';

type SearchStatus = 'idle' | 'loading' | 'error';

/** 빈 화면용 추천 검색어 — 지역이 겹치지 않게 대표 목적지에서 골랐다. */
const SUGGESTED_KEYWORDS = [
  '경복궁',
  '해운대해수욕장',
  '전주 한옥마을',
  '성산일출봉',
  '감천문화마을',
  '남이섬',
];

export default function SearchScreen() {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<SearchPlaceResult[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [hasSearched, setHasSearched] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const searchRequestId = useRef(0);

  useEffect(() => {
    void loadRecentSearches().then(setRecent);
  }, []);

  function rememberKeyword(term: string) {
    setRecent((previous) => {
      const next = [term, ...previous.filter((item) => item !== term)].slice(
        0,
        MAX_RECENT_SEARCHES,
      );
      saveRecentSearches(next);
      return next;
    });
  }

  function clearRecent() {
    setRecent([]);
    clearRecentSearchesStorage();
  }

  function handleChangeKeyword(text: string) {
    searchRequestId.current = nextRequestId(searchRequestId.current);
    setKeyword(text);
    setStatus('idle');
    setHasSearched(false);
  }

  async function runSearch(term: string) {
    const trimmed = term.trim();
    if (!trimmed) return;

    setKeyword(trimmed);
    rememberKeyword(trimmed);
    setStatus('loading');
    const requestId = nextRequestId(searchRequestId.current);
    searchRequestId.current = requestId;
    try {
      const data = await searchPlaces(trimmed);
      if (isStaleRequest(requestId, searchRequestId.current)) {
        return;
      }
      setResults(data);
      setStatus('idle');
    } catch {
      if (isStaleRequest(requestId, searchRequestId.current)) {
        return;
      }
      setResults([]);
      setStatus('error');
    } finally {
      if (!isStaleRequest(requestId, searchRequestId.current)) {
        setHasSearched(true);
      }
    }
  }

  // 결과가 아직 없을 때만 최근·추천을 보여준다 — 결과 목록과 겹치면 눈만 어지럽다.
  const showShortcuts = status === 'idle' && !hasSearched && results.length === 0;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.searchRow}>
        <TextInput
          value={keyword}
          onChangeText={handleChangeKeyword}
          onSubmitEditing={() => void runSearch(keyword)}
          returnKeyType="search"
          placeholder="관광지, 지역, 테마 검색"
          placeholderTextColor={Teumta.textTertiary}
          style={styles.searchInput}
        />
        <Pressable style={styles.searchButton} onPress={() => void runSearch(keyword)}>
          <Text style={styles.searchButtonText}>검색</Text>
        </Pressable>
      </View>

      {showShortcuts && (
        <>
          {recent.length > 0 && (
            <View style={styles.shortcutSection}>
              <View style={styles.shortcutHeader}>
                <Text style={styles.shortcutTitle}>최근 검색</Text>
                <Pressable onPress={clearRecent} hitSlop={8}>
                  <Text style={styles.shortcutClear}>지우기</Text>
                </Pressable>
              </View>
              <View style={styles.chipWrap}>
                {recent.map((term) => (
                  <Pressable key={term} style={styles.chip} onPress={() => void runSearch(term)}>
                    <Text style={styles.chipLabel}>{term}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <View style={styles.shortcutSection}>
            <View style={styles.shortcutHeader}>
              <Text style={styles.shortcutTitle}>이런 곳은 어때요</Text>
            </View>
            <View style={styles.chipWrap}>
              {SUGGESTED_KEYWORDS.map((term) => (
                <Pressable key={term} style={styles.chip} onPress={() => void runSearch(term)}>
                  <Text style={styles.chipLabel}>{term}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </>
      )}

      {status === 'loading' && <ActivityIndicator style={styles.stateBox} />}

      {status === 'error' && (
        <Text style={styles.stateText}>검색 중 문제가 발생했습니다. 다시 시도해 주세요.</Text>
      )}

      {status === 'idle' && hasSearched && results.length === 0 && (
        <Text style={styles.stateText}>검색 결과가 없습니다.</Text>
      )}

      <View style={styles.list}>
        {results.map((place, index) => {
          const id = place.tourApiContentId ?? place.tmapPoiId;

          if (!id) {
            return (
              <View key={`${place.source}-${place.name}-${index}`} style={[styles.card, styles.cardDisabled]}>
                <Text style={styles.placeName}>{place.name}</Text>
                {place.address && <Text style={styles.location}>{place.address}</Text>}
              </View>
            );
          }

          return (
            <Link
              key={`${place.source}-${id}-${index}`}
              href={{
                pathname: '/places/[id]',
                params: {
                  id,
                  source: place.source,
                  name: place.name,
                  ...(place.address && { address: place.address }),
                  ...(place.imageUrl && { imageUrl: place.imageUrl }),
                  ...(place.latitude != null && { latitude: String(place.latitude) }),
                  ...(place.longitude != null && { longitude: String(place.longitude) }),
                },
              }}
              asChild>
              <Pressable style={styles.card}>
                <Text style={styles.placeName}>{place.name}</Text>
                {place.address && <Text style={styles.location}>{place.address}</Text>}
              </Pressable>
            </Link>
          );
        })}
      </View>

      {results.some((place) => place.source === 'TOUR') && (
        <TourApiAttribution style={styles.attribution} />
      )}
    </ScrollView>
  );
}

// 다른 화면과 같은 Teumta 토큰만 쓴다 — 이 화면만 초기 프로토타입 색이 남아 이질적이었다.
const styles = StyleSheet.create({
  container: {
    gap: 16,
    padding: 20,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  searchInput: {
    backgroundColor: Teumta.surface,
    borderColor: Teumta.border,
    borderRadius: 14,
    borderWidth: 1,
    color: Teumta.textPrimary,
    flex: 1,
    fontSize: 14,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  searchButton: {
    alignItems: 'center',
    backgroundColor: Teumta.green,
    borderRadius: 14,
    justifyContent: 'center',
    paddingHorizontal: 17,
  },
  searchButtonText: {
    color: Teumta.surface,
    fontSize: 13,
    fontWeight: '700',
  },
  shortcutSection: {
    gap: 9,
  },
  shortcutHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  shortcutTitle: {
    color: Teumta.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  shortcutClear: {
    color: Teumta.greenDark,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: Teumta.surface,
    borderColor: Teumta.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  chipLabel: {
    color: Teumta.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  stateBox: {
    marginTop: 8,
  },
  stateText: {
    color: Teumta.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  list: {
    gap: 9,
  },
  attribution: {
    marginTop: 4,
  },
  card: {
    backgroundColor: Teumta.surface,
    borderColor: Teumta.border,
    borderRadius: 15,
    borderWidth: 1,
    gap: 3,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  placeName: {
    color: Teumta.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  location: {
    color: Teumta.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
});
