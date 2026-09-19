import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBookmarks } from '@/hooks/use-bookmarks';
import { getLocalPlaceDetail } from '@/api/places';
import { PlaceThumbnail } from '@/components/place-thumbnail';
import { ScreenSection } from '@/components/screen-section';
import { ReportModal } from '@/components/report-modal';
import { TourApiAttribution } from '@/components/tour-api-attribution';
import { TeumtaHybrid, TeumtaLayout } from '@/constants/theme';
import { ScreenActionBar, screenActionStyles } from '@/components/screen-action-bar';
import type { LocalPlaceDetail } from '@/types/place';
import { openDirections, openNaverMapPlace } from '@/utils/directions';

/**
 * 주변 로컬 장소 상세.
 *
 * 요청 시점 외부 API 조회 결과라 서버 id 없음(api-spec 3.3b).
 * 목록 화면에서 표시용 값을 그대로 넘겨받아 렌더링.
 */
type LocalPlaceParams = {
  /** TourAPI 콘텐츠 식별자. 소개문 조회 키 — 없으면 소개 섹션을 띄우지 않는다. */
  contentId?: string;
  name?: string;
  address?: string;
  latitude?: string;
  longitude?: string;
  /** TMAP 실측 보행거리(m). 직선거리 아님. */
  distanceMeters?: string;
  travelTimeMinutes?: string;
  imageUrl?: string;
  /** 분류 라벨(문화시설/쇼핑/음식점). */
  category?: string;
  /** 어느 목적지 주변에서 찾았는지(표시용). */
  destinationName?: string;
  eventStartDate?: string;
  eventEndDate?: string;
};

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${meters}m`;
}

export default function LocalPlaceDetailScreen() {
  const params = useLocalSearchParams<LocalPlaceParams>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPlaceBookmarked, togglePlaceBookmark } = useBookmarks();
  const goBack = () => router.canGoBack() ? router.back() : router.replace('/search');
  const isFestival = params.category === '행사·축제';
  const eventDate = (value?: string) => value && /^\d{8}$/.test(value)
    ? `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}` : null;
  const eventPeriod = [eventDate(params.eventStartDate), eventDate(params.eventEndDate)]
    .filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(' – ');

  const latitude = Number(params.latitude);
  const longitude = Number(params.longitude);
  const hasCoordinate = Number.isFinite(latitude) && Number.isFinite(longitude);

  const [detail, setDetail] = useState<LocalPlaceDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [showReport, setShowReport] = useState(false);

  // 소개문은 목록에 없다. 화면에 실제로 들어온 1곳만 상세로 조회한다(외부 API 쿼터).
  const contentId = params.contentId;
  useEffect(() => {
    if (!contentId) {
      return;
    }
    let ignored = false;

    getLocalPlaceDetail(contentId)
      .then((data) => {
        if (!ignored) {
          setDetail(data); setDetailStatus('ready');
        }
      })
      .catch(() => {
        if (!ignored) setDetailStatus('error');
      });

    return () => {
      ignored = true;
    };
  }, [contentId]);

  if (!params.name || !hasCoordinate) {
    return (
      <View
        style={[
          styles.emptyContainer,
          { paddingTop: 24 + insets.top, paddingBottom: 24 + insets.bottom },
        ]}>
        <Text style={styles.emptyText}>장소 정보를 불러올 수 없습니다.</Text>
        <Pressable style={styles.emptyButton} onPress={goBack}>
          <Text style={styles.emptyButtonLabel}>돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  const distanceMeters = Number(params.distanceMeters);
  const travelMinutes = Number(params.travelTimeMinutes);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>

      <View style={styles.heroTopRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로 가기" style={styles.heroButton} onPress={goBack}>
          <Image
            source={require('@/assets/images/icons/back.svg')}
            style={styles.heroButtonIcon}
            contentFit="contain"
          />
        </Pressable>
        {contentId && <Pressable accessibilityRole="button" accessibilityLabel={isPlaceBookmarked('TOUR', contentId) ? '저장 해제' : '장소 저장'} accessibilityState={{ selected: isPlaceBookmarked('TOUR', contentId) }} style={[styles.heroButton, { marginLeft: 'auto' }]} onPress={() => togglePlaceBookmark({ id: contentId, source: 'TOUR', name: params.name!, address: params.address ?? null, imageUrl: params.imageUrl ?? null, local: { latitude: String(latitude), longitude: String(longitude), category: params.category, eventStartDate: params.eventStartDate, eventEndDate: params.eventEndDate } })}><Text>{isPlaceBookmarked('TOUR', contentId) ? '저장됨' : '저장'}</Text></Pressable>}
      </View>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <PlaceThumbnail
          imageUrl={params.imageUrl}
          category={params.category}
          variant="hero"
          contentFit={isFestival ? 'contain' : 'cover'}
          style={styles.heroImage}
        />
        <View style={styles.heroTitleBand}>
          {params.category ? <Text style={styles.heroCategory}>{params.category}</Text> : null}
          <Text style={styles.heroTitle}>{params.name}</Text>
          {params.destinationName && Number.isFinite(travelMinutes) && (
            <Text style={styles.heroSubtitle}>
              {params.destinationName}에서 도보 {travelMinutes}분
            </Text>
          )}
        </View>

        <View style={styles.content}>
          {params.address && <Text style={styles.description}>{params.address}</Text>}
          {!contentId && <Text style={styles.description}>다시 조회할 수 있는 장소 코드가 없어 저장은 지원하지 않아요. 외부 지도에서 확인해 주세요.</Text>}
          {contentId && detailStatus !== 'ready' && <Text style={styles.description}>{detailStatus === 'loading' ? '소개·운영정보 확인 중…' : '소개·운영정보 조회 실패 · 외부 지도에서 확인해 주세요.'}</Text>}
          {params.destinationName && <Text style={styles.description}>아래 거리·시간은 {params.destinationName} 기준의 예상치입니다.</Text>}
          <View style={styles.statsRow}>
            <View style={styles.statTile}>
              <Text style={styles.statLabel}>도보</Text>
              <Text style={styles.statValue}>
                {Number.isFinite(travelMinutes) ? `${travelMinutes}분` : '—'}
              </Text>
            </View>
            <View style={styles.statTile}>
              <Text style={styles.statLabel}>걷는 거리</Text>
              <Text style={styles.statValue}>
                {Number.isFinite(distanceMeters) ? formatDistance(distanceMeters) : '—'}
              </Text>
            </View>
          </View>

          {isFestival && (
            <View style={styles.eventBanner}>
              <Text style={styles.eventLabel}>행사 일정</Text>
              <Text style={styles.eventDate}>{eventPeriod || '일정 확인 필요'}</Text>
              <Text style={styles.description}>방문 전 주최 측에서 운영 일정을 확인해 주세요.</Text>
            </View>
          )}

          {/* 휴무일 데이터가 스키마에 없어 "닫힌 가게 제안" 신뢰 문제가 있었다 — TourAPI 실시간으로 채운다. */}
          {(detail?.openHours || detail?.restDays) && (
            <ScreenSection title="운영 정보">
              <View style={styles.hoursCard}>
                {detail?.openHours ? (
                  <View style={styles.hoursRow}>
                    <Text style={styles.hoursLabel}>운영시간</Text>
                    <Text style={styles.hoursValue}>{detail.openHours}</Text>
                  </View>
                ) : null}
                {detail?.restDays ? (
                  <View style={styles.hoursRow}>
                    <Text style={styles.hoursLabel}>휴무일</Text>
                    <Text style={styles.hoursValue}>{detail.restDays}</Text>
                  </View>
                ) : null}
              </View>
            </ScreenSection>
          )}

          {detail?.overview ? (
            <ScreenSection title="이곳은요">
              <Text style={styles.overview}>{detail.overview}</Text>
            </ScreenSection>
          ) : null}

          <ScreenSection title="찾아가는 길">
            <Text style={styles.description}>{params.address || '주소 정보가 없어요.'}</Text>
          </ScreenSection>

          {detail?.tel ? (
            <ScreenSection title="연락처">
              <Text style={styles.description}>{detail.tel}</Text>
            </ScreenSection>
          ) : null}

          <View style={styles.emptyBox}>
            <Text style={styles.emptyBoxText}>
              거리·시간은 표시된 기준 장소에서의 예상치이며 현재 위치 기준이 아닙니다.
            </Text>
          </View>

          {/* 추가 사진·리뷰와 최신 운영 정보는 지도 앱에서 확인한다. */}
          <Pressable
            accessibilityRole="button"
            style={styles.secondaryButton}
            onPress={() => {
              void openNaverMapPlace({ name: params.name as string, address: params.address });
            }}>
            <Text style={styles.secondaryButtonLabel}>네이버지도에서 더 보기</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            hitSlop={6}
            onPress={() => setShowReport(true)}
            style={styles.reportLink}>
            <Text style={styles.reportLinkLabel}>정보 수정 제보</Text>
          </Pressable>

          <TourApiAttribution style={styles.attribution} />
        </View>
      </ScrollView>

      <ScreenActionBar>
        <View style={styles.footerRow}>
          {/* 뒤로가기 아이콘만으로는 코스 화면으로 돌아갈 길이 안 보인다 — 엄지 위치에 명시. */}
          <Pressable accessibilityRole="button" style={styles.returnButton} onPress={goBack}>
            <Text style={styles.returnLabel} numberOfLines={1}>
              이전 화면
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="이 장소 길찾기 열기"
            style={styles.ctaButton}
            onPress={() => {
              void openDirections({
                name: params.name as string,
                latitude,
                longitude,
              });
            }}>
            <Text style={styles.ctaLabel}>길찾기 열기</Text>
          </Pressable>
        </View>
      </ScreenActionBar>

      <ReportModal
        visible={showReport}
        onClose={() => setShowReport(false)}
        kind="place"
        place={{
          name: params.name,
          source: '한국관광공사',
          ...(contentId ? { id: contentId } : {}),
          ...(params.address ? { address: params.address } : {}),
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
  emptyButton: {
    backgroundColor: TeumtaHybrid.navy,
    borderRadius: 16,
    marginTop: 16,
    padding: 16,
    minHeight: 48,
  },
  emptyButtonLabel: {
    color: TeumtaHybrid.white,
    fontSize: 13,
    fontWeight: '700',
  },
  attribution: {
    marginTop: 8,
  },
  emptyText: {
    color: TeumtaHybrid.muted,
    fontSize: 16,
  },
  heroTopRow: {
    flexDirection: 'row',
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
  heroButtonIcon: {
    height: 19,
    width: 19,
  },
  heroImage: {
    aspectRatio: 4 / 3,
    marginHorizontal: TeumtaLayout.screenGutter,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: TeumtaHybrid.paper,
  },
  heroTitleBand: {
    gap: 8,
    padding: TeumtaLayout.cardPadding,
  },
  heroCategory: {
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
  statsRow: {
    flexDirection: 'row',
    backgroundColor: TeumtaHybrid.paper,
    borderRadius: 20,
    padding: 20,
    gap: 20,
  },
  statTile: {
    flex: 1,
    gap: 6,
  },
  statLabel: {
    color: TeumtaHybrid.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  statValue: {
    color: TeumtaHybrid.ink,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 31,
  },
  description: {
    color: TeumtaHybrid.muted,
    fontSize: 15,
    lineHeight: 24,
  },
  overview: {
    color: TeumtaHybrid.ink,
    fontSize: 15,
    lineHeight: 26,
  },
  hoursCard: {
    gap: 16,
  },
  hoursRow: {
    flexDirection: 'row',
    gap: 16,
  },
  hoursLabel: {
    color: TeumtaHybrid.muted,
    fontSize: 14,
    lineHeight: 23,
    width: 60,
  },
  hoursValue: {
    color: TeumtaHybrid.ink,
    flex: 1,
    fontSize: 15,
    lineHeight: 23,
  },
  emptyBox: {
    paddingVertical: 4,
  },
  emptyBoxText: {
    color: TeumtaHybrid.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TeumtaHybrid.navySoft,
    borderRadius: 16,
    minHeight: 52,
    padding: 14,
  },
  secondaryButtonLabel: {
    color: TeumtaHybrid.navy,
    fontSize: 15,
    fontWeight: '700',
  },
  reportLink: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  reportLinkLabel: {
    color: TeumtaHybrid.muted,
    fontSize: 13,
    lineHeight: 20,
    textDecorationLine: 'underline',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  returnButton: {
    ...screenActionStyles.button,
    ...screenActionStyles.secondary,
    flex: 1,
  },
  returnLabel: {
    color: TeumtaHybrid.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  ctaButton: {
    ...screenActionStyles.button,
    flex: 1.5,
  },
  ctaLabel: { ...screenActionStyles.label },
  eventBanner: {
    backgroundColor: TeumtaHybrid.navySoft,
    borderRadius: 20,
    gap: 10,
    padding: 20,
  },
  eventLabel: {
    color: TeumtaHybrid.navy,
    fontSize: 13,
    fontWeight: '700',
  },
  eventDate: {
    color: TeumtaHybrid.ink,
    fontSize: 21,
    fontWeight: '800',
    lineHeight: 30,
  },
});
