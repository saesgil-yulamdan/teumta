import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TeumtaHybrid } from '@/constants/theme';

export function ScreenSection({ title, meta, children }: { title: string; meta?: string; children: ReactNode; }) {
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        {meta && <Text style={styles.meta}>{meta}</Text>}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 16,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flexShrink: 1,
    color: TeumtaHybrid.ink,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 28,
  },
  meta: {
    color: TeumtaHybrid.muted,
    fontSize: 13,
    lineHeight: 20,
  },
});
