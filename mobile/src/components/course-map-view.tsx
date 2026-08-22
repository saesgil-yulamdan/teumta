import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { Teumta } from '@/constants/theme';
import type { Coordinate, DetourCourse } from '@/types/place';

type CourseMapViewProps = {
  detour?: DetourCourse;
  /**
   * 실제 보행 경로 좌표(구간별 TMAP 경로 연결). 없으면 정류지 직선 연결로 그린다.
   * 마커는 계속 detour.coordinates(지점)에서 나온다 — 선과 점의 역할 분리.
   */
  routePath?: Coordinate[];
  /** 지도에 내 위치(파란 점)를 표시. 위치 권한이 허용된 화면에서만 켠다. */
  showsUserLocation?: boolean;
};

const MARKER_ANCHOR = { x: 0.5, y: 0.5 };
const DESTINATION_COLOR = '#FF9175';
/** 이동 경로 전용 색 — 장소 마커(목적지 주황·정류지 초록)와 겹치지 않게 파랑으로 분리. */
const ROUTE_LINE_COLOR = '#2F6FED';
/** 파선 14px, 간격 9px — 마커(지름 26px)보다 확실히 길어 "점"이 아니라 "선"으로 읽힌다. */
const ROUTE_DASH_PATTERN = [14, 9];

function sameCoordinate(first: Coordinate, second: Coordinate): boolean {
  return first.latitude === second.latitude && first.longitude === second.longitude;
}

export function CourseMapView({ detour, routePath, showsUserLocation }: CourseMapViewProps) {
  const coordinates = detour?.coordinates ?? [];
  // 실경로가 있으면 선은 그걸로 긋고, 화면 범위도 경로가 지점 바깥으로 볼록한 만큼 포함한다.
  const lineCoordinates = routePath && routePath.length > 1 ? routePath : coordinates;
  const latitudes = lineCoordinates.map((coordinate) => coordinate.latitude);
  const longitudes = lineCoordinates.map((coordinate) => coordinate.longitude);
  const region =
    lineCoordinates.length > 0
      ? {
          latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
          longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
          latitudeDelta: Math.max((Math.max(...latitudes) - Math.min(...latitudes)) * 1.8, 0.01),
          longitudeDelta: Math.max((Math.max(...longitudes) - Math.min(...longitudes)) * 1.8, 0.01),
        }
      : { latitude: 37.5796, longitude: 126.977, latitudeDelta: 0.01, longitudeDelta: 0.01 };

  // 경로는 목적지 → 정류지들 → 목적지(복귀)라 첫·마지막 좌표가 같다.
  // 선은 그대로 그리되 마커는 한 번만 찍는다(같은 자리에 두 개가 겹치면 구분이 안 된다).
  const returnsToStart =
    coordinates.length > 1 && sameCoordinate(coordinates[0], coordinates[coordinates.length - 1]);
  const markerCoordinates = returnsToStart ? coordinates.slice(0, -1) : coordinates;

  return (
    <View style={styles.container}>
      <MapView style={styles.map} initialRegion={region} showsUserLocation={showsUserLocation}>
        {markerCoordinates.map((coordinate, index) => {
          const isDestination = index === 0;
          const title = detour?.stops?.[index];
          return (
            <Marker
              key={`${index}-${coordinate.latitude}-${coordinate.longitude}`}
              coordinate={coordinate}
              anchor={MARKER_ANCHOR}
              title={
                title ?? (isDestination ? '목적지' : `${index}번째 들르는 곳`)
              }
              description={
                isDestination
                  ? returnsToStart
                    ? '출발하고 돌아오는 곳'
                    : '출발하는 곳'
                  : undefined
              }>
              <View
                style={[
                  styles.marker,
                  isDestination ? styles.markerDestination : styles.markerStop,
                ]}>
                {/* 정류지는 방문 순서를 숫자로 표시한다 — 색만으로는 구분이 안 된다. */}
                {!isDestination && <Text style={styles.markerLabel}>{index}</Text>}
              </View>
            </Marker>
          );
        })}
        {/* 경로는 흰 밑선 위에 파랑 파선을 겹쳐 그린다.
            둥근 점(lineDashPattern=[0, 12])으로 그리던 때는 점 하나하나가 작은 원이라
            장소 마커(목적지 주황·정류지 초록)와 헷갈렸다. 경로 색을 마커와 겹치지 않는
            파랑으로 분리해 "이 선이 이동 경로"라는 게 한눈에 읽히게 한다.
            밑선은 파선 사이가 끊겨 보이지 않게 경로를 이어주고, 지도 배경과도 대비를 만든다. */}
        <Polyline
          coordinates={lineCoordinates}
          strokeColor={Teumta.surface}
          strokeWidth={9}
          lineCap="round"
          lineJoin="round"
          zIndex={1}
        />
        <Polyline
          coordinates={lineCoordinates}
          strokeColor={ROUTE_LINE_COLOR}
          strokeWidth={4}
          lineCap="butt"
          lineJoin="round"
          lineDashPattern={ROUTE_DASH_PATTERN}
          zIndex={2}
        />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  marker: {
    alignItems: 'center',
    borderColor: Teumta.surface,
    borderRadius: 13,
    borderWidth: 3,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  markerDestination: {
    backgroundColor: DESTINATION_COLOR,
  },
  markerStop: {
    backgroundColor: Teumta.greenDark,
  },
  markerLabel: {
    color: Teumta.surface,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 15,
  },
});
