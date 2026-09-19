import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  ALL_REGIONS,
  FEATURED_DESTINATIONS,
  type FeaturedDestination,
  type Region,
} from '@/constants/destinations';
import { TeumtaHybrid, TeumtaLayout } from '@/constants/theme';

/** 리드 1 + 모자이크 4(2×2). 홈에서는 혼잡 API를 호출하지 않는다. */
const PAGE_SIZE = 5;

const WITH_IMAGES = FEATURED_DESTINATIONS.filter(
  (destination): destination is FeaturedDestination & { imageUrl: string } =>
    Boolean(destination.imageUrl),
);

const REGION_OPTIONS = ALL_REGIONS.filter((region) =>
  WITH_IMAGES.some((destination) => destination.region === region),
);

function placeHref(destination: FeaturedDestination) {
  return {
    pathname: '/places/[id]' as const,
    params: {
      id: destination.tourApiContentId,
      source: 'TOUR',
      name: destination.name,
      address: destination.address,
      imageUrl: destination.imageUrl ?? '',
    },
  };
}

export function QuietNow() {
  const [region, setRegion] = useState<Region | null>(null);
  const [page, setPage] = useState(0);

  const pool = useMemo(
    () =>
      region
        ? WITH_IMAGES.filter((destination) => destination.region === region)
        : WITH_IMAGES,
    [region],
  );

  const pageCount = Math.max(1, Math.ceil(pool.length / PAGE_SIZE));
  const safePage = page % pageCount;
  const pageItems = useMemo(
    () => pool.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [pool, safePage],
  );
  const lead = pageItems[0];
  const mosaic = pageItems.slice(1);

  return (
    <View style={styles.root}>
      <Text accessibilityRole="header" style={styles.heading}>
        잠깐 둘러볼 곳
      </Text>
      <Text style={styles.caption}>
        공개 관광정보에서 골라 둔 대표 장소예요. 현재 위치는 쓰지 않아요.
      </Text>

      <View style={styles.chipWrap} accessibilityRole="tablist">
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: region === null }}
          style={[styles.chip, region === null && styles.chipSelected]}
          onPress={() => {
            setRegion(null);
            setPage(0);
          }}>
          <Text
            style={[
              styles.chipLabel,
              region === null && styles.chipLabelSelected,
            ]}>
            전체
          </Text>
        </Pressable>
        {REGION_OPTIONS.map((option) => {
          const selected = region === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => {
                setRegion(option);
                setPage(0);
              }}>
              <Text
                style={[
                  styles.chipLabel,
                  selected && styles.chipLabelSelected,
                ]}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {pageItems.length === 0 || !lead ? (
        <Text style={styles.caption}>이 지역에 보여줄 사진이 아직 없어요.</Text>
      ) : (
        <>
          <Link href={placeHref(lead)} asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${lead.name}, ${lead.areaLabel}`}>
              <View style={styles.lead}>
                <Image
                  source={{ uri: lead.imageUrl }}
                  style={styles.leadImage}
                  contentFit="cover"
                  recyclingKey={lead.imageUrl}
                />
                <View style={styles.leadCopy}>
                  <Text style={styles.leadEyebrow}>{lead.areaLabel}</Text>
                  <Text style={styles.leadTitle}>{lead.name}</Text>
                </View>
              </View>
            </Pressable>
          </Link>

          {mosaic.length > 0 && (
            <View style={styles.mosaic}>
              {mosaic.map((destination) => (
                <Link
                  key={destination.tourApiContentId}
                  href={placeHref(destination)}
                  asChild>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${destination.name}, ${destination.areaLabel}`}
                    style={styles.tile}>
                    <Image
                      source={{ uri: destination.imageUrl }}
                      style={styles.tileImage}
                      contentFit="cover"
                      recyclingKey={destination.imageUrl}
                    />
                    <View style={styles.tileBody}>
                      <Text style={styles.tileTitle} numberOfLines={1}>
                        {destination.name}
                      </Text>
                      <Text style={styles.tileMeta} numberOfLines={1}>
                        {destination.areaLabel}
                      </Text>
                    </View>
                  </Pressable>
                </Link>
              ))}
            </View>
          )}

          {pool.length > PAGE_SIZE && (
            <Pressable
              accessibilityRole="button"
              style={styles.moreHit}
              onPress={() => setPage((value) => (value + 1) % pageCount)}>
              <Text style={styles.moreLabel}>다른 후보 보기 →</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 14,
  },
  heading: {
    color: TeumtaHybrid.ink,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 26,
  },
  caption: {
    color: TeumtaHybrid.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: TeumtaHybrid.canvas,
    borderRadius: 999,
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: TeumtaHybrid.navySoft,
  },
  chipLabel: {
    color: TeumtaHybrid.muted,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  chipLabelSelected: {
    color: TeumtaHybrid.navy,
    fontWeight: '800',
  },
  lead: {
    borderRadius: TeumtaLayout.cardRadius,
    overflow: 'hidden',
    backgroundColor: TeumtaHybrid.line,
    height: 200,
  },
  leadImage: {
    ...StyleSheet.absoluteFill,
  },
  leadCopy: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: 4,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: 'rgba(20, 28, 40, 0.48)',
  },
  leadEyebrow: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  leadTitle: {
    color: TeumtaHybrid.white,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 30,
  },
  mosaic: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    width: '48%',
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: TeumtaHybrid.paper,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TeumtaHybrid.line,
    overflow: 'hidden',
  },
  tileImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: TeumtaHybrid.line,
  },
  tileBody: {
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tileTitle: {
    color: TeumtaHybrid.ink,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  tileMeta: {
    color: TeumtaHybrid.muted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  moreHit: {
    minHeight: 44,
    justifyContent: 'center',
  },
  moreLabel: {
    color: TeumtaHybrid.navy,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 22,
  },
});
