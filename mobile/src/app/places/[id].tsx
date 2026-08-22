import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getConcentrationForecast,
  getNearbyLocalPlaces,
  getRealtimeCongestion,
} from '@/api/places';
import { PlaceThumbnail } from '@/components/place-thumbnail';
import { TourApiAttribution } from '@/components/tour-api-attribution';
import { REALTIME_LEVEL_LABEL, REALTIME_LEVEL_TO_CONGESTION_LEVEL } from '@/constants/congestion';
import { Teumta } from '@/constants/theme';
import { useBookmarks } from '@/hooks/use-bookmarks';
import type {
  CongestionLevel,
  ConcentrationForecast,
  NearbyLocalPlaceResult,
  RealtimeCongestion,
} from '@/types/place';
import {
  chartRatio,
  forecastDayLabel,
  formatForecastDate,
  summarizeForecast,
  type ForecastTone,
} from '@/utils/forecast';

const STATUS_BAR_TINT = '#CCE8DB';
const HERO_BAND = '#1C4738';

const CONGESTION_HEADLINE: Record<CongestionLevel, { title: string; subtitle: string }> = {
  low: { title: '지금은 여유로운 편이에요', subtitle: '현재 혼잡도가 낮은 상태예요.' },
  medium: { title: '지금은 무난한 편이에요', subtitle: '현재 혼잡도가 보통 상태예요.' },
  high: { title: '지금은 붐비는 편이에요', subtitle: '현재 혼잡도가 높은 상태예요.' },
  veryHigh: { title: '지금은 매우 붐벼요', subtitle: '현재 혼잡도가 매우 높은 상태예요.' },
};

const CONGESTION_BAR_RATIO: Record<CongestionLevel, number> = {
  low: 0.33,
  medium: 0.62,
  high: 0.79,
  veryHigh: 0.95,
};

const CONGESTION_MESSAGE: Record<CongestionLevel, string> = {
  low: '주변이 여유로운 편이에요. 지금 방문하기 좋아요.',
  medium: '무난한 편이지만, 여유를 원한다면 주변 로컬 장소를 먼저 둘러보는 것도 좋아요.',
  high: '아래 틈타 코스를 확인해 다른 장소로 우회했다가 다시 방문해보세요.',
  veryHigh: '아래 틈타 코스를 확인해 다른 장소로 우회했다가 다시 방문해보세요.',
};

/** 중앙값 대비 오늘의 위치. KTO는 등급 미제공이라 상대 표현만. */
const FORECAST_TONE_TITLE: Record<ForecastTone, string> = {
  busy: '오늘은 평소보다 붐비는 날이에요',
  usual: '오늘은 평소와 비슷해요',
  quiet: '오늘은 평소보다 한산한 날이에요',
};

/** 측정 시각 → "15:40". 값이 이상하면 미표시. */
function measuredAtLabel(measuredAt: string | null): string | null {
  if (!measuredAt) {
    return null;
  }
  const at = new Date(measuredAt);
  if (Number.isNaN(at.getTime())) {
    return null;
  }
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

const LEGEND_STEPS = [
  { key: 'low', label: '여유' },
  { key: 'medium', label: '보통' },
  { key: 'high', label: '혼잡' },
  { key: 'veryHigh', label: '매우 혼잡' },
] as const;

type Status = 'idle' | 'loading' | 'error' | 'unavailable';

type PlaceDetailParams = {
  id: string;
  source: 'TOUR' | 'TMAP';
  name?: string;
  address?: string;
  imageUrl?: string;
  latitude?: string;
  longitude?: string;
};

export default function PlaceDetailScreen() {
  const { id, source, name, address, imageUrl } = useLocalSearchParams<PlaceDetailParams>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPlaceBookmarked, togglePlaceBookmark } = useBookmarks();

  const [congestion, setCongestion] = useState<RealtimeCongestion | null>(null);
  const [congestionStatus, setCongestionStatus] = useState<Status>('idle');

  const [nearby, setNearby] = useState<NearbyLocalPlaceResult[]>([]);
  const [nearbyStatus, setNearbyStatus] = useState<Status>('loading');

  const [forecast, setForecast] = useState<ConcentrationForecast | null>(null);

  // 당겨서 새로고침 — 값이 바뀌면 아래 효과가 전부 다시 조회한다(서버 5분 캐시가 흡수).
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const [showCrowdedAlert, setShowCrowdedAlert] = useState(false);

  useEffect(() => {
    if (!id || !source) return;

    let ignored = false;

    setCongestion(null);
    setNearby([]);
    setForecast(null);
    setShowCrowdedAlert(false);

    // TOUR 목적지도 서버가 TMAP POI로 매칭해 조회(api-spec 3.4a)
    setCongestionStatus('loading');
    getRealtimeCongestion(source === 'TOUR' ? { contentId: id } : { poiId: id })
      .then((data) => {
        // 당김 스피너는 대표 조회(혼잡도)가 끝나면 내린다 — 반영 여부와 무관.
        setRefreshing(false);
        if (ignored) return;
        setCongestion(data);
        setCongestionStatus('idle');
      })
      .catch((error: unknown) => {
        setRefreshing(false);
        if (ignored) return;
        // 404는 SK 미커버 장소 — 장애가 아니라 원래 없는 데이터
        const status = (error as { response?: { status?: number } }).response?.status;
        setCongestionStatus(status === 404 ? 'unavailable' : 'error');
      });

    // 집중률 예측은 TourAPI 목적지 전용(관광지 단위 데이터)
    if (source === 'TOUR') {
      getConcentrationForecast(id)
        .then((data) => {
          if (!ignored) {
            setForecast(data);
          }
        })
        .catch(() => {
          // 예측 없는 장소도 많음 → 실패 시 해당 섹션만 숨김
        });
    }

    setNearbyStatus('loading');
    const identifier = source === 'TOUR' ? { contentId: id } : { poiId: id };
    getNearbyLocalPlaces(identifier)
      .then((data) => {
        if (ignored) return;
        setNearby(data);
        setNearbyStatus('idle');
      })
      .catch(() => {
        if (ignored) return;
        setNearbyStatus('error');
      });

    return () => {
      ignored = true;
    };
  }, [id, source, refreshNonce]);

  useEffect(() => {
    if (!congestion) return;
    const level = REALTIME_LEVEL_TO_CONGESTION_LEVEL[congestion.level];
    if (level !== 'high' && level !== 'veryHigh') return;

    setShowCrowdedAlert(true);
    const timer = setTimeout(() => setShowCrowdedAlert(false), 5000);
    return () => clearTimeout(timer);
  }, [congestion]);

  if (!id || !source || !name) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>관광지를 찾을 수 없습니다.</Text>
      </View>
    );
  }

  const congestionLevel = congestion ? REALTIME_LEVEL_TO_CONGESTION_LEVEL[congestion.level] : null;
  const forecastSummary = forecast ? summarizeForecast(forecast.forecasts) : null;
  const palette = congestionLevel ? Teumta.congestion[congestionLevel] : null;
  const headline = congestionLevel ? CONGESTION_HEADLINE[congestionLevel] : null;
  // 우회 트리거(congestion-rules §5): CROWDED 이상일 때만 CTA 강조.
  // 그 미만·미제공(404)·조회 실패는 기존 모양 유지 — 예측값으로 대체 판단하지 않는다.
  const crowdedNow =
    congestionStatus === 'idle' &&
    (congestionLevel === 'high' || congestionLevel === 'veryHigh');

  function goToDetours() {
    router.push({
      pathname: '/detours',
      params: {
        ...(source === 'TOUR' ? { contentId: id } : { poiId: id }),
        name,
      },
    });
  }

  return (
    <View style={styles.screen}>
      <View style={{ height: insets.top, backgroundColor: STATUS_BAR_TINT }} />

      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              setRefreshNonce((nonce) => nonce + 1);
            }}
            tintColor={Teumta.green}
          />
        }
        showsVerticalScrollIndicator={false}>
        <View style={styles.heroTopRow}>
          <Pressable style={styles.heroButton} onPress={() => router.back()}>
            <Image
              source={require('@/assets/images/icons/back.svg')}
              style={styles.heroButtonIcon}
              contentFit="contain"
            />
          </Pressable>
          <Pressable
            style={[styles.heroButton, isPlaceBookmarked(source, id) && styles.heroButtonSaved]}
            onPress={() =>
              togglePlaceBookmark({
                id,
                source,
                name,
                address: address ?? null,
                imageUrl: imageUrl ?? null,
              })
            }>
            <Image
              source={require('@/assets/images/icons/bookmark.svg')}
              style={styles.heroButtonIcon}
              contentFit="contain"
            />
          </Pressable>
        </View>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.heroImage}
            contentFit="cover"
            recyclingKey={id}
          />
        ) : (
          <View style={styles.heroImage} />
        )}
        <View style={styles.heroTitleBand}>
          <Text style={styles.heroTitle}>{name}</Text>
          {address && <Text style={styles.heroSubtitle}>{address}</Text>}
        </View>

        <View style={styles.content}>
          <View style={styles.congestionCard}>
            {congestionStatus === 'loading' && <ActivityIndicator />}

            {congestionStatus === 'unavailable' && (
              <Text style={styles.congestionSubtitle}>
                이 장소는 실시간 혼잡도를 제공하지 않아요.
              </Text>
            )}

            {congestionStatus === 'error' && (
              <Text style={styles.congestionSubtitle}>혼잡도 정보를 불러오지 못했어요.</Text>
            )}

            {congestionStatus === 'idle' && congestion && congestionLevel && palette && headline && (
              <>
                <View style={styles.congestionHeader}>
                  <View style={styles.congestionTexts}>
                    <Text style={styles.congestionTitle}>{headline.title}</Text>
                    <Text style={styles.congestionSubtitle}>{headline.subtitle}</Text>
                  </View>
                  <View style={styles.congestionLevelBox}>
                    <Text style={[styles.congestionLevel, { color: palette.text }]}>
                      {REALTIME_LEVEL_LABEL[congestion.level]}
                    </Text>
                    {measuredAtLabel(congestion.measuredAt) && (
                      <Text style={styles.measuredAt}>
                        {measuredAtLabel(congestion.measuredAt)} 기준
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.congestionTrack}>
                  <View
                    style={[
                      styles.congestionFill,
                      {
                        backgroundColor: palette.dot,
                        width: `${Math.round(CONGESTION_BAR_RATIO[congestionLevel] * 100)}%`,
                      },
                    ]}
                  />
                </View>
                <View style={[styles.congestionBanner, crowdedNow && styles.congestionBannerAlert]}>
                  <Image
                    source={require('@/assets/images/icons/info.svg')}
                    style={styles.bannerIcon}
                    contentFit="contain"
                  />
                  <Text style={[styles.bannerText, crowdedNow && styles.bannerTextAlert]}>
                    {CONGESTION_MESSAGE[congestionLevel]}
                  </Text>
                </View>
              </>
            )}
          </View>

          {congestionStatus === 'idle' && congestionLevel && (
            <>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>혼잡도 단계</Text>
                <Text style={styles.sectionAction}>4단계 기준</Text>
              </View>

              <View style={styles.legendRow}>
                {LEGEND_STEPS.map((step) => {
                  const stepPalette = Teumta.congestion[step.key];
                  const active = step.key === congestionLevel;
                  return (
                    <View
                      key={step.key}
                      style={[
                        styles.legendCard,
                        active && {
                          backgroundColor: stepPalette.background,
                          borderColor: stepPalette.text,
                        },
                      ]}>
                      <View style={[styles.legendDot, { backgroundColor: stepPalette.dot }]} />
                      <Text style={[styles.legendLabel, active && { color: stepPalette.text }]}>
                        {step.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {forecastSummary && (
            <>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>언제 가면 덜 붐빌까</Text>
                <Text style={styles.sectionAction}>앞으로 2주</Text>
              </View>

              <View style={styles.forecastCard}>
                <Text style={styles.forecastTitle}>
                  {FORECAST_TONE_TITLE[forecastSummary.tone]}
                </Text>
                <Text style={styles.forecastSubtitle}>
                  앞으로 30일 평균과 견주면{' '}
                  {forecastSummary.differenceFromMedian === 0
                    ? '비슷한 수준이에요'
                    : `${Math.abs(forecastSummary.differenceFromMedian)}% ${
                        forecastSummary.differenceFromMedian > 0 ? '높아요' : '낮아요'
                      }`}
                  .
                </Text>

                <View style={styles.forecastChart}>
                  {forecastSummary.upcoming.map((entry, index) => {
                    const isToday = index === 0;
                    const isQuietest =
                      forecastSummary.quietest?.forecastDate === entry.forecastDate;
                    return (
                      <View key={entry.forecastDate} style={styles.forecastBarColumn}>
                        <View style={styles.forecastBarTrack}>
                          <View
                            style={[
                              styles.forecastBar,
                              {
                                height: `${Math.round(
                                  chartRatio(entry.concentrationRate, forecastSummary.upcoming) * 100,
                                )}%`,
                              },
                              isToday && styles.forecastBarToday,
                              isQuietest && styles.forecastBarQuietest,
                            ]}
                          />
                        </View>
                        <Text
                          style={[
                            styles.forecastDayLabel,
                            (isToday || isQuietest) && styles.forecastDayLabelStrong,
                          ]}>
                          {forecastDayLabel(entry.forecastDate)}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {forecastSummary.quietest && (
                  <View style={styles.forecastHint}>
                    <Text style={styles.forecastHintText}>
                      {formatForecastDate(forecastSummary.quietest.forecastDate)}에 가면 오늘보다{' '}
                      {forecastSummary.quietestDropPercent}% 한산할 것으로 예상돼요.
                    </Text>
                  </View>
                )}

              </View>
            </>
          )}

          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>근처에서 잠깐 둘러볼 곳</Text>
          </View>

          {nearbyStatus === 'loading' && <ActivityIndicator style={styles.stateBox} />}
          {nearbyStatus === 'error' && (
            <Text style={styles.stateText}>주변 장소를 불러오지 못했어요.</Text>
          )}
          {nearbyStatus === 'idle' && nearby.length === 0 && (
            <Text style={styles.stateText}>주변에 추천할 로컬 장소가 없어요.</Text>
          )}

          <View style={styles.nearbyList}>
            {nearby.map((place) => (
              <Pressable
                key={`${place.name}-${place.latitude}-${place.longitude}`}
                style={styles.nearbyCard}
                onPress={() =>
                  router.push({
                    pathname: '/local-places/[id]',
                    params: {
                      id: place.name,
                      contentId: place.tourApiContentId,
                      name: place.name,
                      latitude: String(place.latitude),
                      longitude: String(place.longitude),
                      distanceMeters: String(place.distanceMeters),
                      travelTimeMinutes: String(place.travelTimeMinutes),
                      destinationName: name,
                      ...(place.address ? { address: place.address } : {}),
                      ...(place.imageUrl ? { imageUrl: place.imageUrl } : {}),
                      ...(place.category ? { category: place.category } : {}),
                    },
                  })
                }>
                <PlaceThumbnail
                  imageUrl={place.imageUrl}
                  category={place.category}
                  variant="card"
                  style={styles.nearbyThumb}
                />
                <View style={styles.nearbyTexts}>
                  <Text style={styles.nearbyName}>{place.name}</Text>
                  <Text style={styles.nearbyMeta}>
                    {/* 어떤 곳인지 먼저 보여야 갈지 말지 판단할 수 있다. */}
                    {place.category ? `${place.category} · ` : ''}도보 {place.travelTimeMinutes}분 ·{' '}
                    {place.distanceMeters}m
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>

          {/* 주변 로컬 장소 목록도 TourAPI 데이터라 목적지 출처와 무관하게 표기한다. */}
          {(source === 'TOUR' || nearby.length > 0) && (
            <TourApiAttribution style={styles.attribution} />
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
        <Pressable
          style={[styles.ctaButton, crowdedNow && styles.ctaButtonCrowded]}
          onPress={goToDetours}>
          <Text style={styles.ctaLabel}>틈타 코스 보기</Text>
        </Pressable>
      </View>

      <Modal
        visible={showCrowdedAlert}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCrowdedAlert(false)}>
        <Pressable style={styles.alertBackdrop} onPress={() => setShowCrowdedAlert(false)}>
          <Pressable style={styles.alertCard} onPress={() => {}}>
            <Text style={styles.alertTitle}>잠깐!</Text>
            <Text style={styles.alertBody}>
              붐비는 장소예요{'\n'}틈타 코스를 이용해보시겠어요?
            </Text>
            <Pressable
              style={styles.alertButton}
              onPress={() => {
                setShowCrowdedAlert(false);
                goToDetours();
              }}>
              <Text style={styles.alertButtonLabel}>틈타 코스 보기</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: Teumta.background,
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    color: Teumta.textSecondary,
    fontSize: 16,
  },
  heroTopRow: {
    backgroundColor: Teumta.surface,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 6,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  heroButton: {
    alignItems: 'center',
    backgroundColor: Teumta.surface,
    borderRadius: 13,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  heroButtonSaved: {
    backgroundColor: Teumta.greenLight,
  },
  heroButtonIcon: {
    height: 19,
    width: 19,
  },
  heroImage: {
    backgroundColor: Teumta.imagePlaceholder,
    height: 102,
  },
  heroTitleBand: {
    backgroundColor: HERO_BAND,
    gap: 1,
    paddingBottom: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  heroTitle: {
    color: Teumta.surface,
    fontSize: 23,
    fontWeight: '900',
    lineHeight: 32,
  },
  heroSubtitle: {
    color: Teumta.surface,
    fontSize: 11,
    lineHeight: 15,
  },
  content: {
    backgroundColor: Teumta.surface,
    gap: 14,
    paddingBottom: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  congestionCard: {
    backgroundColor: Teumta.surface,
    borderColor: Teumta.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  congestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  congestionTexts: {
    gap: 2,
  },
  congestionTitle: {
    color: Teumta.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  congestionSubtitle: {
    color: Teumta.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  congestionLevel: {
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 36,
  },
  congestionTrack: {
    backgroundColor: '#F0F2F0',
    borderRadius: 999,
    height: 9,
    overflow: 'hidden',
  },
  congestionFill: {
    borderRadius: 999,
    height: 9,
  },
  congestionBanner: {
    alignItems: 'flex-start',
    backgroundColor: Teumta.greenLight,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  bannerIcon: {
    height: 16,
    marginTop: 1,
    width: 16,
  },
  bannerText: {
    color: Teumta.greenDark,
    flex: 1,
    fontSize: 10,
    fontWeight: '500',
    lineHeight: 14,
  },
  congestionBannerAlert: {
    backgroundColor: Teumta.congestion.veryHigh.background,
  },
  bannerTextAlert: {
    color: Teumta.congestion.veryHigh.text,
    fontWeight: '700',
  },
  sectionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: Teumta.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  sectionAction: {
    color: Teumta.greenDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 9,
  },
  legendCard: {
    alignItems: 'center',
    backgroundColor: Teumta.surface,
    borderColor: Teumta.border,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    gap: 5,
    height: 58,
    justifyContent: 'center',
  },
  legendDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  legendLabel: {
    color: Teumta.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  stateBox: {
    marginTop: 4,
  },
  stateText: {
    color: Teumta.textSecondary,
    fontSize: 12,
  },
  congestionLevelBox: {
    alignItems: 'flex-end',
    gap: 1,
  },
  measuredAt: {
    color: Teumta.textTertiary,
    fontSize: 10,
    lineHeight: 13,
  },
  forecastCard: {
    backgroundColor: Teumta.surface,
    borderColor: Teumta.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  forecastTitle: {
    color: Teumta.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  forecastSubtitle: {
    color: Teumta.textSecondary,
    fontSize: 11,
    lineHeight: 15,
    marginTop: -6,
  },
  forecastChart: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 4,
    height: 84,
  },
  forecastBarColumn: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  forecastBarTrack: {
    height: 64,
    justifyContent: 'flex-end',
    width: '100%',
  },
  forecastBar: {
    backgroundColor: '#D6E9DF',
    borderRadius: 4,
    width: '100%',
  },
  forecastBarToday: {
    backgroundColor: Teumta.textTertiary,
  },
  forecastBarQuietest: {
    backgroundColor: Teumta.green,
  },
  forecastDayLabel: {
    color: Teumta.textTertiary,
    fontSize: 10,
    lineHeight: 13,
  },
  forecastDayLabelStrong: {
    color: Teumta.textPrimary,
    fontWeight: '700',
  },
  forecastHint: {
    backgroundColor: Teumta.greenLight,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  forecastHintText: {
    color: Teumta.greenDark,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  nearbyList: {
    gap: 8,
  },
  nearbyCard: {
    alignItems: 'center',
    backgroundColor: Teumta.surface,
    borderColor: Teumta.border,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingLeft: 8,
    paddingRight: 10,
    paddingVertical: 8,
  },
  nearbyThumb: {
    backgroundColor: Teumta.imagePlaceholder,
    borderRadius: 12,
    height: 52,
    width: 52,
  },
  nearbyTexts: {
    flex: 1,
    gap: 2,
  },
  nearbyName: {
    color: Teumta.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  nearbyMeta: {
    color: Teumta.textSecondary,
    fontSize: 10,
    lineHeight: 14,
  },
  attribution: {
    marginTop: 4,
  },
  footer: {
    backgroundColor: Teumta.surface,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  ctaButton: {
    alignItems: 'center',
    backgroundColor: Teumta.green,
    borderRadius: 16,
    height: 50,
    justifyContent: 'center',
  },
  ctaButtonCrowded: {
    backgroundColor: Teumta.congestion.veryHigh.text,
  },
  alertBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 20, 17, 0.55)',
    flex: 1,
    justifyContent: 'center',
    padding: 28,
  },
  alertCard: {
    alignItems: 'center',
    backgroundColor: Teumta.surface,
    borderRadius: 20,
    gap: 10,
    maxWidth: 320,
    padding: 24,
    width: '100%',
  },
  alertTitle: {
    color: Teumta.congestion.veryHigh.text,
    fontSize: 20,
    fontWeight: '900',
  },
  alertBody: {
    color: Teumta.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    textAlign: 'center',
  },
  alertButton: {
    alignItems: 'center',
    backgroundColor: Teumta.green,
    borderRadius: 14,
    height: 46,
    justifyContent: 'center',
    marginTop: 6,
    width: '100%',
  },
  alertButtonLabel: {
    color: Teumta.surface,
    fontSize: 14,
    fontWeight: '700',
  },
  ctaLabel: {
    color: Teumta.surface,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
});
