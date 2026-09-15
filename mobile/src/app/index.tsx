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
            tintColor={TeumtaHybrid.navy}
          />
        }
        showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}>
          <TeumtaWaymark />
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
          <Pressable accessibilityRole="button" accessibilityLabel="장소와 지역 검색" style={styles.searchField}>
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
    backgroundColor: TeumtaHybrid.canvas,
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: 24,
    paddingBottom: 32,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  brandName: {
    color: TeumtaHybrid.ink,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 28,
  },
  intro: {
    gap: 8,
  },
  eyebrow: {
    color: TeumtaHybrid.navy,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  title: {
    color: TeumtaHybrid.ink,
    fontFamily: Fonts.sans,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 40,
  },
  subtitle: {
    color: TeumtaHybrid.muted,
    fontSize: 15,
    lineHeight: 23,
  },
  searchField: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.paper,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 18,
  },
  searchIcon: {
    height: 22,
    width: 22,
  },
  searchPlaceholder: {
    color: TeumtaHybrid.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    backgroundColor: TeumtaHybrid.paper,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: TeumtaHybrid.navy,
  },
  chipLabel: {
    color: TeumtaHybrid.muted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  chipLabelSelected: {
    color: TeumtaHybrid.white,
  },
  sectionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  resumeCard: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.navySoft,
    borderRadius: 20,
    flexDirection: 'row',
    gap: 12,
    padding: 20,
  },
  resumePlaceholder: {
    backgroundColor: TeumtaHybrid.navySoft,
    borderRadius: 20,
    height: 112,
  },
  resumeCopy: {
    flex: 1,
    gap: 4,
  },
  resumeEyebrow: {
    color: TeumtaHybrid.navy,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  resumeTitle: {
    color: TeumtaHybrid.ink,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 26,
  },
  resumeMeta: {
    color: TeumtaHybrid.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  resumeAction: {
    color: TeumtaHybrid.navy,
    fontSize: 14,
    fontWeight: '800',
  },
  sectionTitle: {
    color: TeumtaHybrid.ink,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 28,
  },
  sectionAction: {
    color: TeumtaHybrid.navy,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  featuredCard: {
    backgroundColor: TeumtaHybrid.paper,
    borderRadius: 22,
    overflow: 'hidden',
  },
  featuredImage: {
    aspectRatio: 4 / 3,
    backgroundColor: TeumtaHybrid.line,
  },
  featuredBody: {
    padding: 20,
  },
  featuredTexts: {
    gap: 6,
  },
  featuredName: {
    color: TeumtaHybrid.ink,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 30,
  },
  featuredMeta: {
    color: TeumtaHybrid.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  attribution: {
    marginTop: 8,
  },
  regionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  regionCard: {
    backgroundColor: TeumtaHybrid.paper,
    borderRadius: 18,
    overflow: 'hidden',
    width: '47%',
    flexGrow: 1,
    maxWidth: '49%',
  },
  regionImage: {
    aspectRatio: 4 / 3,
    backgroundColor: TeumtaHybrid.line,
  },
  regionBody: {
    gap: 5,
    minHeight: 84,
    padding: 14,
  },
  regionName: {
    color: TeumtaHybrid.ink,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  regionMeta: {
    color: TeumtaHybrid.muted,
    fontSize: 13,
    lineHeight: 20,
  },
});
