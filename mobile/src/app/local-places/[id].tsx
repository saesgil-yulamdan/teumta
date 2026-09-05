import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getLocalPlaceDetail } from '@/api/places';
import { PlaceThumbnail } from '@/components/place-thumbnail';
import { ReportModal } from '@/components/report-modal';
import { TourApiAttribution } from '@/components/tour-api-attribution';
import { Teumta } from '@/constants/theme';
import type { LocalPlaceDetail } from '@/types/place';
import { openDirections, openNaverMapPlace } from '@/utils/directions';
import { withRoJosa } from '@/utils/text';

const STATUS_BAR_TINT = '#CCE8DB';
const HERO_BAND = '#1C4738';

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
};

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${meters}m`;
}

export default function LocalPlaceDetailScreen() {
  const params = useLocalSearchParams<LocalPlaceParams>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const latitude = Number(params.latitude);
  const longitude = Number(params.longitude);
  const hasCoordinate = Number.isFinite(latitude) && Number.isFinite(longitude);

  const [detail, setDetail] = useState<LocalPlaceDetail | null>(null);
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
          setDetail(data);
        }
      })
      .catch(() => {
        // 소개가 없는 장소도 있다. 실패하면 해당 섹션만 숨긴다.
      });

    return () => {
      ignored = true;
    };
  }, [contentId]);

  if (!params.name || !hasCoordinate) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>장소 정보를 불러올 수 없습니다.</Text>
        <Pressable style={styles.emptyButton} onPress={() => router.back()}>
          <Text style={styles.emptyButtonLabel}>돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  const distanceMeters = Number(params.distanceMeters);
  const travelMinutes = Number(params.travelTimeMinutes);

  return (
    <View style={styles.screen}>
      <View style={{ height: insets.top, backgroundColor: STATUS_BAR_TINT }} />

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.heroTopRow}>
          <Pressable style={styles.heroButton} onPress={() => router.back()}>
            <Image
              source={require('@/assets/images/icons/back.svg')}
              style={styles.heroButtonIcon}
              contentFit="contain"
            />
          </Pressable>
        </View>
        <PlaceThumbnail
          imageUrl={params.imageUrl}
          category={params.category}
          variant="hero"
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

          {detail?.overview ? (
            <>
              <Text style={styles.sectionTitle}>어떤 곳인가요</Text>
              <Text style={styles.overview}>{detail.overview}</Text>
            </>
          ) : null}

          {/* 휴무일 데이터가 스키마에 없어 "닫힌 가게 제안" 신뢰 문제가 있었다 — TourAPI 실시간으로 채운다. */}
          {(detail?.openHours || detail?.restDays) && (
            <>
              <Text style={styles.sectionTitle}>운영 정보</Text>
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
            </>
          )}

          <Text style={styles.sectionTitle}>주소</Text>
          <Text style={styles.description}>{params.address ?? '주소 정보가 없어요.'}</Text>

          {detail?.tel ? (
            <>
              <Text style={styles.sectionTitle}>연락처</Text>
              <Text style={styles.description}>{detail.tel}</Text>
            </>
          ) : null}

          <View style={styles.emptyBox}>
            <Text style={styles.emptyBoxText}>
              걷는 거리와 시간은 실제 보행 경로로 계산한 값이에요.
            </Text>
          </View>

          {/* 사진·리뷰·영업시간까지는 우리가 제공하지 않는다. 판단은 여기서, 심화 정보는 지도 앱에서. */}
          <Pressable
            style={styles.secondaryButton}
            onPress={() => {
              void openNaverMapPlace({ name: params.name as string, address: params.address });
            }}>
            <Text style={styles.secondaryButtonLabel}>네이버지도에서 사진·리뷰 보기</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            hitSlop={6}
            onPress={() => setShowReport(true)}
            style={styles.reportLink}>
            <Text style={styles.reportLinkLabel}>정보가 다른가요? 제보하기</Text>
          </Pressable>

          <TourApiAttribution style={styles.attribution} />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
        <View style={styles.footerRow}>
          {/* 뒤로가기 아이콘만으로는 코스 화면으로 돌아갈 길이 안 보인다 — 엄지 위치에 명시. */}
          <Pressable style={styles.returnButton} onPress={() => router.back()}>
            <Text style={styles.returnLabel} numberOfLines={1}>
              {params.destinationName ? `${withRoJosa(params.destinationName)} 돌아가기` : '돌아가기'}
            </Text>
          </Pressable>
          <Pressable
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
      </View>

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
  emptyButton: {
    backgroundColor: Teumta.greenLight,
    borderRadius: 999,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  emptyButtonLabel: {
    color: Teumta.greenDark,
    fontSize: 13,
    fontWeight: '700',
  },
  attribution: {
    marginTop: 8,
  },
  emptyText: {
    color: Teumta.textSecondary,
    fontSize: 16,
  },
  heroTopRow: {
    backgroundColor: Teumta.surface,
    flexDirection: 'row',
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
  heroCategory: {
    color: Teumta.greenLight,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
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
  statsRow: {
    flexDirection: 'row',
    gap: 7,
  },
  statTile: {
    alignItems: 'center',
    backgroundColor: Teumta.surface,
    borderColor: Teumta.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  statLabel: {
    color: Teumta.textTertiary,
    fontSize: 10,
    lineHeight: 13,
  },
  statValue: {
    color: Teumta.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  sectionTitle: {
    color: Teumta.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  description: {
    color: Teumta.textSecondary,
    fontSize: 12,
    lineHeight: 19,
  },
  overview: {
    color: Teumta.textPrimary,
    fontSize: 13,
    lineHeight: 21,
  },
  hoursCard: {
    backgroundColor: '#F7F9F8',
    borderRadius: 12,
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  hoursRow: {
    flexDirection: 'row',
    gap: 10,
  },
  hoursLabel: {
    color: Teumta.textTertiary,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 17,
    width: 52,
  },
  hoursValue: {
    color: Teumta.textPrimary,
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  emptyBox: {
    backgroundColor: '#F7F9F8',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  emptyBoxText: {
    color: Teumta.textSecondary,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: Teumta.border,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    paddingVertical: 13,
  },
  secondaryButtonLabel: {
    color: Teumta.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  reportLink: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  reportLinkLabel: {
    color: Teumta.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
    textDecorationLine: 'underline',
  },
  courseList: {
    gap: 8,
  },
  courseCard: {
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
  courseThumb: {
    backgroundColor: Teumta.imagePlaceholder,
    borderRadius: 12,
    height: 52,
    width: 52,
  },
  courseTexts: {
    flex: 1,
    gap: 2,
  },
  courseName: {
    color: Teumta.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  courseMeta: {
    color: Teumta.textSecondary,
    fontSize: 10,
    lineHeight: 14,
  },
  courseChevron: {
    color: Teumta.textTertiary,
    fontSize: 20,
    fontWeight: '500',
    lineHeight: 28,
  },
  footer: {
    backgroundColor: Teumta.surface,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  returnButton: {
    alignItems: 'center',
    borderColor: Teumta.border,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    height: 50,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  returnLabel: {
    color: Teumta.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  ctaButton: {
    alignItems: 'center',
    backgroundColor: Teumta.green,
    borderRadius: 16,
    flex: 1,
    height: 50,
    justifyContent: 'center',
  },
  ctaLabel: {
    color: Teumta.surface,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
});
