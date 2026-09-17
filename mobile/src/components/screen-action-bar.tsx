import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TeumtaHybrid, TeumtaLayout } from '@/constants/theme';

/**
 * 본문과 같은 바탕의 하단 행동 영역. ScrollView 다음에 배치해 콘텐츠를 덮지 않는다.
 * 좌우·상단 safe area는 화면이, 하단 safe area는 이 컴포넌트가 한 번만 적용한다.
 */
export function ScreenActionBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(12, insets.bottom) }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: TeumtaHybrid.canvas,
    borderTopColor: TeumtaHybrid.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
    gap: 8,
    paddingHorizontal: TeumtaLayout.screenGutter,
    paddingTop: 12,
  },
});

export const screenActionStyles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TeumtaHybrid.navy,
    borderRadius: TeumtaLayout.controlRadius,
    minHeight: TeumtaLayout.actionHeight,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  label: {
    color: TeumtaHybrid.white,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 24,
    flexShrink: 1,
  },
  secondary: {
    backgroundColor: TeumtaHybrid.paper,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TeumtaHybrid.line,
  },
});
