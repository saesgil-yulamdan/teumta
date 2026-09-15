import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TeumtaHybrid } from '@/constants/theme';

export function EmptyState({ title, description, actionLabel, onAction }: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel && onAction && (
        <Pressable accessibilityRole="button" style={styles.button} onPress={onAction}>
          <Text style={styles.buttonLabel}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  title: {
    color: TeumtaHybrid.ink,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 25,
    textAlign: 'center',
  },
  description: {
    color: TeumtaHybrid.muted,
    fontSize: 14,
    lineHeight: 23,
    textAlign: 'center',
  },
  button: {
    backgroundColor: TeumtaHybrid.navySoft,
    borderRadius: 14,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 12,
    marginTop: 6,
  },
  buttonLabel: {
    color: TeumtaHybrid.navy,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 22,
  },
});
