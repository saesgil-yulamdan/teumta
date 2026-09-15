import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Fonts, TeumtaHybrid } from '@/constants/theme';

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
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
          <Image
            source={require('@/assets/images/icons/back.svg')}
            style={styles.backIcon}
            contentFit="contain"
          />
        </Pressable>
      )}
      <View style={styles.copy}>
        {eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
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
    minHeight: 72,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.canvas,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  backIcon: { height: 18, width: 18 },
  copy: { flex: 1, gap: 4 },
  eyebrow: {
    color: TeumtaHybrid.navy,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    lineHeight: 14,
  },
  title: {
    color: TeumtaHybrid.ink,
    fontFamily: Fonts.sans,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 38,
  },
  subtitle: { color: TeumtaHybrid.muted, fontSize: 14, lineHeight: 22 },
  action: { paddingHorizontal: 4, paddingVertical: 10 },
  actionLabel: { color: TeumtaHybrid.navy, fontSize: 13, fontWeight: '700' },
});
