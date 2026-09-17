import { Image } from 'expo-image';
import { Link, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActiveTripCard } from '@/components/active-trip-card';
import { Onboarding } from '@/components/onboarding';
import { QuietNow } from '@/components/quiet-now';
import { TeumtaWaymark } from '@/components/teumta-waymark';
import { TeumtaHybrid, TeumtaLayout } from '@/constants/theme';

export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshSignal((signal) => signal + 1);
  }, []);
  const handleRefreshed = useCallback(() => setRefreshing(false), []);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
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

        <Link href={'/search' as Href} asChild>
          <Pressable accessibilityRole="button" accessibilityLabel="탐색에서 장소 검색" style={styles.searchField}>
            <Image source={require('@/assets/images/icons/search.svg')} style={styles.searchIcon} contentFit="contain" />
            <Text style={styles.searchPlaceholder}>장소·지역 검색</Text>
            <Text style={styles.searchHint}>탐색</Text>
          </Pressable>
        </Link>

        <View style={styles.quickActions}>
          <Link href={'/search' as Href} asChild>
            <Pressable accessibilityRole="button" style={styles.quickAction}>
              <Text style={styles.quickLabel}>장소 찾기</Text>
              <Text style={styles.quickArrow}>→</Text>
            </Pressable>
          </Link>
          <Link href={{ pathname: '/trips', params: { section: 'saved' } }} asChild>
            <Pressable accessibilityRole="button" style={styles.quickAction}>
              <Text style={styles.quickLabel}>저장한 장소</Text>
              <Text style={styles.quickArrow}>→</Text>
            </Pressable>
          </Link>
          <Link href={{ pathname: '/trips', params: { section: 'history' } }} asChild>
            <Pressable accessibilityRole="button" style={styles.quickAction}>
              <Text style={styles.quickLabel}>여행 기록</Text>
              <Text style={styles.quickArrow}>→</Text>
            </Pressable>
          </Link>
        </View>

        <ActiveTripCard />
        <QuietNow refreshSignal={refreshSignal} onRefreshed={handleRefreshed} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: TeumtaHybrid.paper, flex: 1 },
  scroll: { flex: 1 },
  content: {
    gap: TeumtaLayout.sectionGap,
    paddingBottom: TeumtaLayout.contentBottomPadding,
    paddingHorizontal: TeumtaLayout.screenGutter,
    paddingTop: 12,
  },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 36 },
  brandName: { color: TeumtaHybrid.ink, fontSize: 20, fontWeight: '700', lineHeight: 28 },
  searchField: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.canvas,
    borderRadius: TeumtaLayout.controlRadius,
    flexDirection: 'row',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  searchIcon: { height: 20, width: 20 },
  searchPlaceholder: { color: TeumtaHybrid.muted, flex: 1, fontSize: 15, lineHeight: 22 },
  searchHint: { color: TeumtaHybrid.navy, fontSize: 12, fontWeight: '700' },
  quickActions: { flexDirection: 'row', gap: 8 },
  quickAction: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.canvas,
    borderRadius: 10,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 12,
  },
  quickLabel: { color: TeumtaHybrid.ink, fontSize: 12, fontWeight: '600' },
  quickArrow: { color: TeumtaHybrid.navy, fontSize: 15 },
});
