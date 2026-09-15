import { StyleSheet, Text, View } from 'react-native';

import { TeumtaHybrid } from '@/constants/theme';
import type { Coordinate, DetourCourse } from '@/types/place';

type CourseMapViewProps = {
  detour?: DetourCourse;
  routePath?: Coordinate[];
  showsUserLocation?: boolean;
  skippedStopIndexes?: number[];
};

/** 좌표로 그린 동선도. 지도 타일·도로를 가장하지 않으며 외부 조회를 추가하지 않는다. */
export function CourseMapView({ detour, routePath, skippedStopIndexes = [] }: CourseMapViewProps) {
  const valid = (point: Coordinate) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
  const coordinates = (detour?.coordinates ?? []).filter(valid);
  const path = (routePath && routePath.length > 1 ? routePath : coordinates).filter(valid);
  const all = [...path, ...coordinates];
  const bounds = all.reduce((box, point) => ({
    minLat: Math.min(box.minLat, point.latitude), maxLat: Math.max(box.maxLat, point.latitude),
    minLon: Math.min(box.minLon, point.longitude), maxLon: Math.max(box.maxLon, point.longitude),
  }), { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity });
  const centerLat = all.length ? (bounds.minLat + bounds.maxLat) / 2 : 0;
  const centerLon = all.length ? (bounds.minLon + bounds.maxLon) / 2 : 0;
  const longitudeScale = Math.max(Math.cos(centerLat * Math.PI / 180), 0.01);
  const scale = all.length ? Math.min(
    264 / Math.max((bounds.maxLon - bounds.minLon) * longitudeScale, 0.00001),
    114 / Math.max(bounds.maxLat - bounds.minLat, 0.00001),
  ) : 1;
  const project = (point: Coordinate) => ({
    x: 180 + (point.longitude - centerLon) * longitudeScale * scale,
    y: 86 - (point.latitude - centerLat) * scale,
  });
  const points = path.map((point) => {
    const { x, y } = project(point);
    return `${x},${y}`;
  }).join(' ');
  const returnsToStart = coordinates.length > 1 &&
    coordinates[0].latitude === coordinates[coordinates.length - 1].latitude &&
    coordinates[0].longitude === coordinates[coordinates.length - 1].longitude;
  const markers = returnsToStart ? coordinates.slice(0, -1) : coordinates;

  return (
    <View style={styles.preview}>
      <View style={styles.heading}>
        <Text style={styles.title}>동선 미리보기</Text>
        <Text style={styles.caption}>출발 · 방문 · 복귀</Text>
      </View>
      <svg viewBox="0 0 360 170" width="100%" style={{ flex: 1, minHeight: 0 }}
        role="img" aria-label={`배경 지도 없는 코스 동선: ${detour?.stops?.join(' → ') ?? '선택한 코스 없음'}`}>
        <title>방문 순서와 이동 동선</title>
        <polyline points={points} fill="none" stroke={TeumtaHybrid.white} strokeWidth="10" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={points} fill="none" stroke={TeumtaHybrid.navy} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        {markers.map((coordinate, index) => {
          const { x, y } = project(coordinate);
          const skipped = index > 0 && skippedStopIndexes.includes(index - 1);
          return (
            <g key={index}>
              <title>{detour?.stops?.[index] ?? `${index}번째 장소`}{skipped ? ' · 건너뜀' : ''}</title>
              <circle cx={x} cy={y} r="15" fill={index === 0 ? TeumtaHybrid.ink : skipped ? TeumtaHybrid.muted : TeumtaHybrid.navy} stroke="white" strokeWidth="3" />
              <text x={x} y={y} dy="0.35em" textAnchor="middle" fill="white" fontSize="12" fontWeight="700">
                {index === 0 ? '출' : skipped ? '−' : index}
              </text>
            </g>
          );
        })}
      </svg>
      <Text style={styles.caption}>동선만 표시해요. 실제 배경 지도는 앱에서 볼 수 있어요.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    flex: 1,
    backgroundColor: TeumtaHybrid.canvas,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: TeumtaHybrid.ink,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  caption: {
    color: TeumtaHybrid.muted,
    fontSize: 11,
    lineHeight: 17,
  },
});
