import { Image } from 'expo-image';
import { Link, type Href, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Onboarding } from '@/components/onboarding';
import { QuietNow } from '@/components/quiet-now';
import { TeumtaTabBar } from '@/components/teumta-tab-bar';
import { TourApiAttribution } from '@/components/tour-api-attribution';
import { TeumtaWaymark } from '@/components/teumta-waymark';
import {
  AVAILABLE_REGIONS,
  destinationsInRegion,
  type FeaturedDestination,
  type Region,
} from '@/constants/destinations';
import { Fonts, TeumtaHybrid } from '@/constants/theme';
import { loadSelectedCourse, type SelectedCourse } from '@/stores/selected-course';

/** 목적지 상세로 넘길 파라미터. 상세 화면이 이 식별자로 실시간 정보를 조회한다. */
function detailHref(destination: FeaturedDestination) {
  return {
    pathname: '/places/[id]' as const,
    params: {
      id: destination.tourApiContentId,
      source: 'TOUR',
      name: destination.name,
      address: destination.address,
      ...(destination.imageUrl ? { imageUrl: destination.imageUrl } : {}),
    },
  };
}

export default function HomeScreen() {
  const [activeCourse, setActiveCourse] = useState<SelectedCourse | null>(null);
  const [activeCourseReady, setActiveCourseReady] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let ignored = false;
      void loadSelectedCourse().then((course) => {
        if (!ignored) {
          setActiveCourse(course);
          setActiveCourseReady(true);
        }
      });
      return () => {
        ignored = true;
      };
    }, []),
  );
  // null = 전체
  const [region, setRegion] = useState<Region | null>(null);
  const destinations = destinationsInRegion(region);
  // 대표 1곳을 위에 크게 두고 나머지는 전부 아래 격자에 편다.
  // 예전에는 2곳만 잘라 보여줘서 목적지를 늘려도 홈에는 3곳밖에 안 나왔다.
  const [featured, ...regionDestinations] = destinations;

  // 당겨서 새로고침 — 홈에서 실시간인 건 혼잡도 섹션뿐이라 신호만 넘긴다.
  const [refreshing, setRefreshing] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshSignal((signal) => signal + 1);
  }, []);
  const handleRefreshed = useCallback(() => setRefreshing(false), []);

  return (
    <SafeAreaView style={styles.screen}>
      <Onboarding />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={TeumtaHybrid.terracotta}
          />
        }
        showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}>
          <TeumtaWaymark />
          <Image
            source={require('@/assets/images/teumta-logo.svg')}
            style={styles.brandLogo}
            contentFit="contain"
          />
          <Text style={styles.brandName}>틈타</Text>
        </View>

        <View style={styles.intro}>
          <Text style={styles.eyebrow}>오늘의 여행</Text>
          <Text style={styles.title}>{activeCourse ? '여행을 이어가세요' : '어디로 떠나세요?'}</Text>
          <Text style={styles.subtitle}>
            {activeCourse ? '마지막 진행 지점부터 다시 시작해요.' : '혼잡은 피하고, 여행은 이어가요.'}
          </Text>
        </View>

        <Link href={'/search' as Href} asChild>
          <Pressable style={styles.searchField}>
            <Image
              source={require('@/assets/images/icons/search.svg')}
              style={styles.searchIcon}
              contentFit="contain"
            />
            <Text style={styles.searchPlaceholder}>장소·지역 검색</Text>
          </Pressable>
        </Link>

        {activeCourse ? (
          <Link href={'/trip' as Href} asChild>
            <Pressable accessibilityRole="button" accessibilityLabel={`${activeCourse.destination.name} 진행 중인 코스 이어가기`} style={styles.resumeCard}>
              <View style={styles.resumeCopy}>
                <Text style={styles.resumeEyebrow}>진행 중인 코스</Text>
                <Text numberOfLines={1} style={styles.resumeTitle}>
                  {activeCourse.destination.name}
                </Text>
                <Text style={styles.resumeMeta}>마지막 진행 지점부터 이어서 시작해요.</Text>
              </View>
              <Text style={styles.resumeAction}>이어가기</Text>
            </Pressable>
          </Link>
        ) : !activeCourseReady ? (
          <View accessible accessibilityLabel="진행 중인 코스 불러오는 중" style={styles.resumePlaceholder} />
        ) : null}

        <QuietNow refreshSignal={refreshSignal} onRefreshed={handleRefreshed} />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: region === null }}
            accessibilityLabel="전체 지역"
            onPress={() => setRegion(null)}
            style={[styles.chip, region === null && styles.chipSelected]}>
            <Text style={[styles.chipLabel, region === null && styles.chipLabelSelected]}>
              전체
            </Text>
          </Pressable>
          {AVAILABLE_REGIONS.map((item) => {
            const selected = item === region;
            return (
              <Pressable
                key={item}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${item} 지역`}
                onPress={() => setRegion(item)}
                style={[styles.chip, selected && styles.chipSelected]}>
                <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{item}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>대표 관광지</Text>
          {region !== null && (
            <Pressable onPress={() => setRegion(null)} hitSlop={8}>
              <Text style={styles.sectionAction}>전체 지역 보기</Text>
            </Pressable>
          )}
        </View>

        {featured && (
          <Link href={detailHref(featured)} asChild>
            <Pressable style={styles.featuredCard}>
              {featured.imageUrl ? (
                <Image
                  source={{ uri: featured.imageUrl }}
                  style={styles.featuredImage}
                  contentFit="cover"
                  // 지역을 바꾸면 같은 자리의 뷰가 재활용된다. 키가 없으면 새 이미지가
                  // 로드되기 전(또는 실패했을 때) 직전 지역 사진이 그대로 남는다.
                  recyclingKey={featured.tourApiContentId}
                />
              ) : (
                <View style={styles.featuredImage} />
              )}
              <View style={styles.featuredBody}>
                <View style={styles.featuredTexts}>
                  <Text style={styles.featuredName}>{featured.name}</Text>
                  <Text style={styles.featuredMeta}>
                    {featured.areaLabel} · 혼잡도·코스
                  </Text>
                </View>
              </View>
            </Pressable>
          </Link>
        )}

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>함께 둘러보기</Text>
        </View>

        <View style={styles.regionRow}>
          {regionDestinations.map((destination) => (
            <Link key={destination.tourApiContentId} href={detailHref(destination)} asChild>
              <Pressable style={styles.regionCard}>
                {destination.imageUrl ? (
                  <Image
                    source={{ uri: destination.imageUrl }}
                    style={styles.regionImage}
                    contentFit="cover"
                    recyclingKey={destination.tourApiContentId}
                  />
                ) : (
                  <View style={styles.regionImage} />
                )}
                <View style={styles.regionBody}>
                  <Text numberOfLines={2} style={styles.regionName}>
                    {destination.name}
                  </Text>
                  <Text style={styles.regionMeta}>{destination.areaLabel}</Text>
                </View>
              </Pressable>
            </Link>
          ))}
        </View>

        <TourApiAttribution style={styles.attribution} />
      </ScrollView>

      <TeumtaTabBar active="home" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: TeumtaHybrid.paper,
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: 22,
    paddingBottom: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  brandLogo: {
    height: 25,
    width: 32,
  },
  brandName: {
    color: TeumtaHybrid.ink,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 32,
  },
  intro: {
    gap: 4,
  },
  eyebrow: {
    color: TeumtaHybrid.terracotta,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    lineHeight: 17,
  },
  title: {
    color: TeumtaHybrid.ink,
    fontFamily: Fonts.sans,
    fontSize: 30,
    fontWeight: '500',
    lineHeight: 39,
  },
  subtitle: {
    color: TeumtaHybrid.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  searchField: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.paper,
    borderColor: TeumtaHybrid.line,
    borderRadius: TeumtaHybrid.radius.small,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    height: 52,
    paddingHorizontal: 14,
  },
  searchIcon: {
    height: 19,
    width: 19,
  },
  searchPlaceholder: {
    color: TeumtaHybrid.faint,
    fontSize: 13,
    lineHeight: 19,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    backgroundColor: TeumtaHybrid.paper,
    borderColor: TeumtaHybrid.line,
    borderRadius: TeumtaHybrid.radius.small,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: TeumtaHybrid.slateSoft,
    borderColor: TeumtaHybrid.slate,
  },
  chipLabel: {
    color: TeumtaHybrid.muted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  chipLabelSelected: {
    color: TeumtaHybrid.navy,
  },
  sectionRow: {
    alignItems: 'center',
    borderTopColor: TeumtaHybrid.ink,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
  },
  resumeCard: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.navySoft,
    borderColor: TeumtaHybrid.navy,
    borderRadius: TeumtaHybrid.radius.small,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 14,
  },
  resumePlaceholder: {
    backgroundColor: TeumtaHybrid.navySoft,
    borderColor: TeumtaHybrid.line,
    borderRadius: TeumtaHybrid.radius.small,
    borderWidth: 1,
    height: 72,
  },
  resumeCopy: {
    flex: 1,
    gap: 2,
  },
  resumeEyebrow: {
    color: TeumtaHybrid.slate,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 14,
  },
  resumeTitle: {
    color: TeumtaHybrid.ink,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 21,
  },
  resumeMeta: {
    color: TeumtaHybrid.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  resumeAction: {
    color: TeumtaHybrid.navy,
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 12,
  },
  sectionTitle: {
    color: TeumtaHybrid.ink,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  sectionAction: {
    color: TeumtaHybrid.terracotta,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  featuredCard: {
    backgroundColor: TeumtaHybrid.paper,
    borderBottomColor: TeumtaHybrid.ink,
    borderBottomWidth: 1,
    overflow: 'hidden',
  },
  featuredImage: {
    aspectRatio: 16 / 9,
    backgroundColor: TeumtaHybrid.canvas,
  },
  featuredBody: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  featuredTexts: {
    gap: 1,
  },
  featuredName: {
    color: TeumtaHybrid.ink,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  featuredMeta: {
    color: TeumtaHybrid.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  attribution: {
    marginTop: 4,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  regionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  regionCard: {
    backgroundColor: TeumtaHybrid.paper,
    borderBottomColor: TeumtaHybrid.line,
    borderBottomWidth: 1,
    // flex:1은 줄바꿈과 함께 쓰면 한 줄에 전부 밀어넣는다. 2열 격자라 폭을 고정한다.
    overflow: 'hidden',
    width: '48%',
  },
  regionImage: {
    aspectRatio: 4 / 3,
    backgroundColor: TeumtaHybrid.canvas,
    borderRadius: TeumtaHybrid.radius.small,
  },
  regionBody: {
    gap: 2,
    minHeight: 68,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  regionName: {
    color: TeumtaHybrid.ink,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  regionMeta: {
    color: TeumtaHybrid.muted,
    fontSize: 11,
    lineHeight: 15,
  },
});
