import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Fonts, TeumtaHybrid } from '@/constants/theme';
import { TeumtaWaymark } from '@/components/teumta-waymark';

type TeumtaHeaderProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  showBack?: boolean;
  actionLabel?: string;
  onAction?: () => void;
};

/** 모든 목록형 화면이 공유하는 틈타 헤더. 화면마다 다른 상단 리듬을 줄인다. */
export function TeumtaHeader({
  title,
  subtitle,
  eyebrow,
  showBack = false,
  actionLabel,
  onAction,
}: TeumtaHeaderProps) {
  const router = useRouter();

  return (
    <View style={styles.header}>
      {showBack && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로 가기"
          hitSlop={8}
          style={styles.backButton}
          onPress={() => router.back()}>
          <Image
            source={require('@/assets/images/icons/back.svg')}
            style={styles.backIcon}
            contentFit="contain"
          />
        </Pressable>
      )}
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <TeumtaWaymark />
          <View style={styles.titleCopy}>
            {eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
        </View>
      </View>
      {actionLabel && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={8}
          style={styles.action}
          onPress={onAction}>
          <Text style={styles.actionLabel}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 64,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.canvas,
    borderColor: TeumtaHybrid.line,
    borderRadius: TeumtaHybrid.radius.small,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  backIcon: { height: 18, width: 18 },
  copy: { flex: 1 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  titleCopy: { flex: 1, gap: 1 },
  eyebrow: {
    color: TeumtaHybrid.terracotta,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    lineHeight: 14,
  },
  title: {
    color: TeumtaHybrid.ink,
    fontFamily: Fonts.sans,
    fontSize: 27,
    fontWeight: '500',
    lineHeight: 32,
  },
  subtitle: { color: TeumtaHybrid.muted, fontSize: 12, lineHeight: 18 },
  action: { paddingHorizontal: 4, paddingVertical: 10 },
  actionLabel: { color: TeumtaHybrid.terracotta, fontSize: 11, fontWeight: '800' },
});
