import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlaceThumbnail } from '@/components/place-thumbnail';
import { ScreenSection } from '@/components/screen-section';
import { ReportModal } from '@/components/report-modal';
import { TourApiAttribution } from '@/components/tour-api-attribution';
import { ScreenActionBar, screenActionStyles } from '@/components/screen-action-bar';
import { REALTIME_LEVEL_LABEL, REALTIME_LEVEL_TO_CONGESTION_LEVEL } from '@/constants/congestion';
import { TeumtaHybrid, TeumtaHybridCongestion, TeumtaLayout } from '@/constants/theme';
import { useBookmarks } from '@/hooks/use-bookmarks';
import { usePlaceLiveData } from '@/hooks/use-place-live-data';
import type { CongestionLevel } from '@/types/place';
import { shouldShowDetourPrompt } from '@/utils/congestion-prompt';
import {
  chartRatio,
  forecastDayLabel,
  formatForecastDate,
  summarizeForecast,
  type ForecastTone,
} from '@/utils/forecast';
import { realtimeBasisLabel, isFreshObservation } from '@/utils/realtime-status';

const CONGESTION_HEADLINE: Record<CongestionLevel, string> = {
  low: '지금은 여유로워요',
  medium: '지금은 무난해요',
  high: '지금은 붐벼요',
  veryHigh: '지금은 매우 붐벼요',
};

const CONGESTION_BAR_RATIO: Record<CongestionLevel, number> = {
  low: 0.33,
  medium: 0.62,
  high: 0.79,
  veryHigh: 0.95,
};

const CONGESTION_MESSAGE: Record<CongestionLevel, string> = {
  low: '지금 방문하기 좋아요.',
  medium: '덜 붐비는 날을 확인해보세요.',
  high: '주변을 걷고 다시 방문해보세요.',
  veryHigh: '주변을 걷고 다시 방문해보세요.',
};

/** 중앙값 대비 오늘의 위치. KTO는 등급 미제공이라 상대 표현만. */
const FORECAST_TONE_TITLE: Record<ForecastTone, string> = {
  busy: '오늘 예측 · 평소보다 혼잡',
  usual: '오늘 예측 · 평소 수준',
  quiet: '오늘 예측 · 평소보다 여유',
};

function festivalPeriodLabel(start?: string | null, end?: string | null): string {
  const format = (value?: string | null) => {
    if (!value || !/^\d{8}$/.test(value)) {
      return null;
    }
    return `${Number(value.slice(4, 6))}.${Number(value.slice(6, 8))}`;
  };
  const startLabel = format(start);
  const endLabel = format(end);
  if (startLabel && endLabel) {
    return startLabel === endLabel ? startLabel : `${startLabel}-${endLabel}`;
  }
  return startLabel ?? endLabel ?? '일정 확인 필요';
}

const LEGEND_STEPS = [
  { key: 'low', label: '여유' },
  { key: 'medium', label: '보통' },
  { key: 'high', label: '혼잡' },
  { key: 'veryHigh', label: '매우 혼잡' },
] as const;

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

  const {
    congestion,
    congestionStatus,
    nearby,
    nearbyStatus,
    festivals,
    festivalStatus,
    forecast,
    refreshing,
    refresh,
  } = usePlaceLiveData({ id, source });

  const [showReport, setShowReport] = useState(false);

  if (!id || !source || !name) {
    return (
      <View
        style={[
          styles.emptyContainer,
          { paddingTop: 24 + insets.top, paddingBottom: 24 + insets.bottom },
        ]}>
        <Text style={styles.emptyText}>관광지를 찾을 수 없습니다.</Text>
      </View>
    );
  }

  const congestionLevel = congestion ? REALTIME_LEVEL_TO_CONGESTION_LEVEL[congestion.level] : null;
  const forecastSummary = forecast ? summarizeForecast(forecast.forecasts) : null;
  const palette = congestionLevel ? TeumtaHybridCongestion[congestionLevel] : null;
  const headline = congestionLevel ? CONGESTION_HEADLINE[congestionLevel] : null;
  // 우회 트리거(congestion-rules §5): CROWDED 이상이면 혼잡 회피 안내 문구를 표시한다.
  // 예측값으로 현재 혼잡을 대체 판단하지 않는다.
  const crowdedNow =
    congestionStatus === 'idle' && shouldShowDetourPrompt(congestion ?? null, congestionLevel);

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
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>

      <View style={styles.heroTopRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로 가기" style={styles.heroButton} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
          <Image
            source={require('@/assets/images/icons/back.svg')}
            style={styles.heroButtonIcon}
            contentFit="contain"
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isPlaceBookmarked(source, id) ? '저장한 장소에서 삭제' : '장소 저장'}
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
      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={TeumtaHybrid.navy}
          />
        }
        showsVerticalScrollIndicator={false}>
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
          <Text style={styles.heroEyebrow}>출발지 살펴보기</Text>
          <Text style={styles.heroTitle}>{name}</Text>
          {address && <Text style={styles.heroSubtitle}>{address}</Text>}
        </View>

        <View style={styles.content}>
          <View style={styles.congestionCard}>
            {congestionStatus === 'loading' && (
              <View style={styles.dataStatusRow}>
                <ActivityIndicator color={TeumtaHybrid.slate} size="small" />
                <Text style={styles.dataStatusText}>실시간 혼잡도 · 확인 중</Text>
              </View>
            )}

            {congestionStatus === 'unavailable' && (
              <View style={styles.dataStatusRow}>
                <View style={[styles.dataStatusDot, styles.dataStatusDotMuted]} />
                <Text style={styles.dataStatusText}>실시간 혼잡도 · 미제공</Text>
              </View>
            )}

            {congestionStatus === 'error' && (
              <View style={styles.dataStatusRow}>
                <View style={[styles.dataStatusDot, styles.dataStatusDotWarning]} />
                <Text style={styles.dataStatusText}>실시간 혼잡도 · 확인 불가</Text>
              </View>
            )}

            {congestionStatus === 'idle' && congestion && congestionLevel && palette && headline && (
              <>
                <View style={styles.congestionHeader}>
                  <View style={styles.congestionTexts}>
                    <Text style={styles.congestionTitle}>{isFreshObservation(congestion.measuredAt) ? headline : '관측 당시 · ' + REALTIME_LEVEL_LABEL[congestion.level]}</Text>
                    <View style={styles.dataBasisRow}>
                      <View
                        style={[
                          styles.dataStatusDot,
                          !congestion.measuredAt && styles.dataStatusDotMuted,
                        ]}
                      />
                      <Text numberOfLines={1} style={styles.dataBasisText}>
                        {realtimeBasisLabel(congestion.measuredAt)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.congestionLevelBox}>
                    <Text style={[styles.congestionLevel, { color: palette.text }]}>
                      {REALTIME_LEVEL_LABEL[congestion.level]}
                    </Text>
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
                    {isFreshObservation(congestion.measuredAt) ? CONGESTION_MESSAGE[congestionLevel] : '이전 관측값이므로 지금 상황과 다를 수 있어요.'} 주변 코스의 한적함이나 복귀 시 혼잡 해소를 보장하지는 않아요.
                  </Text>
                </View>
              </>
            )}
          </View>

          {congestionStatus === 'idle' && congestionLevel && (
            <ScreenSection title="혼잡도 단계" meta="4단계 기준">

              <View style={styles.legendRow}>
                {LEGEND_STEPS.map((step) => {
                  const stepPalette = TeumtaHybridCongestion[step.key];
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
            </ScreenSection>
          )}

          {forecastSummary && (
            <ScreenSection title="날짜별 혼잡 예측" meta="향후 30일 · 현재 관측과 별도">

              <View style={styles.forecastCard}>
                <Text style={styles.forecastTitle}>
                  {FORECAST_TONE_TITLE[forecastSummary.tone]}
                </Text>
                <Text style={styles.forecastSubtitle}>
                  30일 중간값보다{' '}
                  {forecastSummary.differenceFromMedian === 0
                    ? '비슷해요'
                    : `${Math.abs(forecastSummary.differenceFromMedian)}% ${forecastSummary.differenceFromMedian > 0 ? '높아요' : '낮아요'
                    }`}
                </Text>

                <ScrollView
                  contentContainerStyle={styles.forecastChart}
                  horizontal
                  showsHorizontalScrollIndicator={false}>
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
                </ScrollView>

                {forecastSummary.quietest && (
                  <View style={styles.forecastHint}>
                    <Text style={styles.forecastHintText}>
                      {formatForecastDate(forecastSummary.quietest.forecastDate)} · 오늘보다{' '}
                      {forecastSummary.quietestDropPercent}% 낮은 예측
                    </Text>
                  </View>
                )}

              </View>
            </ScreenSection>
          )}

          <ScreenSection title="근처 둘러볼 곳">

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

          </ScreenSection>

          <ScreenSection title="근처 행사" meta="진행 중·예정">

            {festivalStatus === 'loading' && <ActivityIndicator style={styles.stateBox} />}
            {festivalStatus === 'error' && (
              <Text style={styles.stateText}>근처 행사 정보를 불러오지 못했어요.</Text>
            )}
            {festivalStatus === 'idle' && festivals.length === 0 && (
              <Text style={styles.stateText}>가까운 진행 중·예정 행사가 없어요.</Text>
            )}

            <View style={styles.nearbyList}>
              {festivals.map((festival) => (
                <Pressable
                  key={`${festival.tourApiContentId}-${festival.name}`}
                  style={styles.nearbyCard}
                  onPress={() =>
                    router.push({
                      pathname: '/local-places/[id]',
                      params: {
                        id: festival.name,
                        contentId: festival.tourApiContentId,
                        name: festival.name,
                        latitude: String(festival.latitude),
                        longitude: String(festival.longitude),
                        distanceMeters: String(festival.distanceMeters),
                        travelTimeMinutes: String(festival.travelTimeMinutes),
                        destinationName: name,
                        category: '행사·축제',
                        eventStartDate: festival.eventStartDate,
                        eventEndDate: festival.eventEndDate,
                        ...(festival.address ? { address: festival.address } : {}),
                        ...(festival.imageUrl ? { imageUrl: festival.imageUrl } : {}),
                      },
                    })
                  }>
                  <PlaceThumbnail
                    imageUrl={festival.imageUrl}
                    category="행사·축제"
                    contentFit="contain"
                    variant="card"
                    style={styles.nearbyThumb}
                  />
                  <View style={styles.nearbyTexts}>
                    <Text style={styles.nearbyName}>{festival.name}</Text>
                    <Text style={styles.nearbyMeta}>
                      {festivalPeriodLabel(festival.eventStartDate, festival.eventEndDate)} · 도보{' '}
                      {festival.travelTimeMinutes}분 · {festival.distanceMeters}m
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>

          </ScreenSection>

          {/* 주변 로컬 장소 목록도 TourAPI 데이터라 목적지 출처와 무관하게 표기한다. */}
          {(source === 'TOUR' || nearby.length > 0 || festivals.length > 0) && (
            <TourApiAttribution style={styles.attribution} />
          )}

          <Pressable
            accessibilityRole="button"
            hitSlop={6}
            onPress={() => setShowReport(true)}
            style={styles.reportLink}>
            <Text style={styles.reportLinkLabel}>정보 수정 제보</Text>
          </Pressable>
        </View>
      </ScrollView>

      <ScreenActionBar>
        <Pressable
          style={styles.ctaButton}
          accessibilityRole="button"
          accessibilityLabel={'주변 코스 보기'}
          onPress={goToDetours}>
          <Text style={styles.ctaLabel}>{'주변 코스 보기'}</Text>
        </Pressable>
      </ScreenActionBar>

      <ReportModal
        visible={showReport}
        onClose={() => setShowReport(false)}
        kind="place"
        place={{
          name: name ?? '이름 확인 불가',
          source: source === 'TOUR' ? '한국관광공사' : 'TMAP',
          id,
          ...(address ? { address } : {}),
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: TeumtaHybrid.canvas,
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
    color: TeumtaHybrid.muted,
    fontSize: 16,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: TeumtaLayout.screenGutter,
    paddingVertical: 10,
  },
  heroButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TeumtaHybrid.paper,
    borderRadius: 22,
    width: 44,
    height: 44,
  },
  heroButtonSaved: {
    backgroundColor: TeumtaHybrid.navySoft,
  },
  heroButtonIcon: {
    height: 19,
    width: 19,
  },
  heroImage: {
    aspectRatio: 4 / 3,
    marginHorizontal: TeumtaLayout.screenGutter,
    borderRadius: 24,
    backgroundColor: TeumtaHybrid.line,
  },
  heroTitleBand: {
    gap: 8,
    padding: TeumtaLayout.cardPadding,
  },
  heroEyebrow: {
    color: TeumtaHybrid.navy,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  heroTitle: {
    color: TeumtaHybrid.ink,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 39,
    letterSpacing: -0.8,
  },
  heroSubtitle: {
    color: TeumtaHybrid.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  content: {
    gap: TeumtaLayout.sectionGap,
    paddingHorizontal: TeumtaLayout.screenGutter,
    paddingBottom: TeumtaLayout.contentBottomPadding,
  },
  congestionCard: {
    backgroundColor: TeumtaHybrid.paper,
    borderRadius: TeumtaLayout.cardRadius,
    gap: 18,
    padding: 20,
  },
  congestionHeader: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  congestionTexts: {
    flex: 1,
    gap: 6,
    paddingRight: 14,
  },
  congestionTitle: {
    color: TeumtaHybrid.ink,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 28,
  },
  dataBasisRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  dataBasisText: {
    color: TeumtaHybrid.muted,
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 19,
  },
  dataStatusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    minHeight: 24,
  },
  dataStatusDot: {
    backgroundColor: TeumtaHybrid.slate,
    height: 7,
    width: 7,
  },
  dataStatusDotMuted: {
    backgroundColor: TeumtaHybrid.faint,
  },
  dataStatusDotWarning: {
    backgroundColor: TeumtaHybrid.signal,
  },
  dataStatusText: {
    color: TeumtaHybrid.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  congestionLevel: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 38,
  },
  congestionTrack: {
    backgroundColor: TeumtaHybrid.canvas,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  congestionFill: {
    height: 8,
    borderRadius: 4,
  },
  congestionBanner: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  bannerIcon: {
    height: 16,
    marginTop: 1,
    width: 16,
  },
  bannerText: {
    color: TeumtaHybrid.muted,
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
  },
  congestionBannerAlert: {
    backgroundColor: TeumtaHybrid.terracottaSoft,
    padding: 12,
    borderRadius: 12,
  },
  bannerTextAlert: {
    color: TeumtaHybrid.terracotta,
    fontWeight: '700',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 8,
  },
  legendCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TeumtaHybrid.paper,
    borderRadius: 16,
    flex: 1,
    gap: 8,
    minHeight: 72,
    paddingVertical: 12,
  },
  legendDot: {
    height: 6,
    width: 24,
    borderRadius: 3,
  },
  legendLabel: {
    color: TeumtaHybrid.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  stateBox: {
    marginTop: 4,
  },
  stateText: {
    color: TeumtaHybrid.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  congestionLevelBox: {
    alignItems: 'flex-end',
    gap: 1,
  },
  forecastCard: {
    backgroundColor: TeumtaHybrid.paper,
    borderRadius: 24,
    padding: 20,
    gap: 14,
  },
  forecastTitle: {
    color: TeumtaHybrid.ink,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 25,
  },
  forecastSubtitle: {
    color: TeumtaHybrid.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  forecastChart: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 6,
    height: 114,
  },
  forecastBarColumn: {
    alignItems: 'center',
    gap: 8,
    width: 24,
  },
  forecastBarTrack: {
    height: 84,
    justifyContent: 'flex-end',
    width: '100%',
  },
  forecastBar: {
    backgroundColor: TeumtaHybrid.line,
    width: '100%',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  forecastBarToday: {
    backgroundColor: TeumtaHybrid.ink,
  },
  forecastBarQuietest: {
    backgroundColor: TeumtaHybrid.navy,
  },
  forecastDayLabel: {
    color: TeumtaHybrid.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  forecastDayLabelStrong: {
    color: TeumtaHybrid.ink,
    fontWeight: '700',
  },
  forecastHint: {
    backgroundColor: TeumtaHybrid.navySoft,
    padding: 12,
    borderRadius: 12,
  },
  forecastHintText: {
    color: TeumtaHybrid.navy,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 21,
  },
  nearbyList: {
    gap: 20,
  },
  nearbyCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    minHeight: 80,
  },
  nearbyThumb: {
    backgroundColor: TeumtaHybrid.paper,
    borderRadius: 4,
    height: 80,
    width: 80,
  },
  nearbyTexts: {
    flex: 1,
    gap: 6,
  },
  nearbyName: {
    color: TeumtaHybrid.ink,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 25,
  },
  nearbyMeta: {
    color: TeumtaHybrid.muted,
    fontSize: 13,
    lineHeight: 21,
  },
  attribution: {
    marginTop: 4,
  },
  reportLink: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  reportLinkLabel: {
    color: TeumtaHybrid.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    textDecorationLine: 'underline',
  },
  ctaButton: {
    ...screenActionStyles.button,
  },
  alertBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 24, 20, 0.62)',
    flex: 1,
    justifyContent: 'center',
    padding: 28,
  },
  alertCard: {
    alignItems: 'flex-start',
    backgroundColor: TeumtaHybrid.paper,
    borderRadius: TeumtaHybrid.radius.large,
    gap: 12,
    maxWidth: 320,
    paddingBottom: 22,
    paddingHorizontal: 24,
    paddingTop: 48,
    width: '100%',
  },
  alertCloseButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TeumtaHybrid.canvas,
    borderRadius: 22,
    width: 44,
    height: 44,
    position: 'absolute',
    right: 12,
    top: 12,
  },
  alertCloseLabel: {
    color: TeumtaHybrid.ink,
    fontSize: 27,
    fontWeight: '400',
    lineHeight: 30,
  },
  buttonPressed: {
    opacity: 0.6,
  },
  alertTitle: {
    color: TeumtaHybrid.terracotta,
    fontSize: 24,
    fontWeight: '800',
  },
  alertBody: {
    color: TeumtaHybrid.ink,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  alertButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TeumtaHybrid.navy,
    borderRadius: 16,
    minHeight: 52,
    padding: 12,
    marginTop: 8,
    width: '100%',
  },
  alertButtonLabel: {
    color: TeumtaHybrid.white,
    fontSize: 14,
    fontWeight: '700',
  },
  ctaLabel: { ...screenActionStyles.label },
});
