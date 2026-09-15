import { StyleSheet, View } from 'react-native';

import { TeumtaHybrid } from '@/constants/theme';

/** 목적지에서 잠시 비켜 나갔다가 돌아오는 틈타의 경로 모티프. */
export function TeumtaWaymark() {
  return (
    <View accessible={false} importantForAccessibility="no" style={styles.mark}>
      <View style={[styles.bar, styles.short]} />
      <View style={[styles.bar, styles.long]} />
      <View style={[styles.bar, styles.short, styles.offset]} />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { flexDirection: 'row', gap: 3, height: 18, width: 18 },
  bar: { backgroundColor: TeumtaHybrid.navy, borderRadius: 2, width: 3 },
  short: { height: 8, marginTop: 5 },
  long: { backgroundColor: TeumtaHybrid.forest, height: 18 },
  offset: { marginTop: 0 },
});
