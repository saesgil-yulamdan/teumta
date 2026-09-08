import { StyleSheet, Text, View } from 'react-native';

import { TeumtaHybrid } from '@/constants/theme';
import type { Coordinate, DetourCourse } from '@/types/place';

type CourseMapViewProps = {
  detour?: DetourCourse;
  /** 네이티브 전용 옵션 — 웹 폴백에서는 사용하지 않는다. */
  routePath?: Coordinate[];
  showsUserLocation?: boolean;
  skippedStopIndexes?: number[];
};

export function CourseMapView({ detour, skippedStopIndexes = [] }: CourseMapViewProps) {
  const coordinates = detour?.coordinates ?? [];

  return (
    <View style={styles.webFallback}>
      <Text style={styles.eyebrow}>ROUTE PREVIEW</Text>
      <Text style={styles.title}>{detour?.name}</Text>
      <Text style={styles.description}>웹 지도 준비 중 · 경로 지점 미리보기</Text>
      {coordinates.map((coordinate, index) => (
        <View
          key={`${index}-${coordinate.latitude}-${coordinate.longitude}`}
          style={styles.coordinateRow}>
          <Text style={styles.coordinateIndex}>{String(index + 1).padStart(2, '0')}</Text>
          <Text style={styles.coordinate}>
            {coordinate.latitude.toFixed(5)}, {coordinate.longitude.toFixed(5)}
            {index > 0 && skippedStopIndexes.includes(index - 1) ? ' · 건너뜀' : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  webFallback: {
    backgroundColor: TeumtaHybrid.canvas,
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  eyebrow: {
    color: TeumtaHybrid.terracotta,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    lineHeight: 14,
  },
  title: {
    color: TeumtaHybrid.ink,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 2,
  },
  description: {
    color: TeumtaHybrid.muted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
    marginTop: 4,
  },
  coordinateRow: {
    alignItems: 'center',
    borderTopColor: TeumtaHybrid.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    minHeight: 34,
  },
  coordinateIndex: {
    color: TeumtaHybrid.terracotta,
    fontSize: 10,
    fontWeight: '900',
    width: 34,
  },
  coordinate: {
    color: TeumtaHybrid.slate,
    fontSize: 11,
    lineHeight: 15,
  },
});
