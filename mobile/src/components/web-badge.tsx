import Constants from 'expo-constants';
import { StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { TeumtaLogo } from '@/components/teumta-logo';

export function WebBadge() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="code" themeColor="textSecondary" style={styles.versionText}>
        v{Constants.expoConfig?.version ?? '1.0.0'}
      </ThemedText>
      <TeumtaLogo size={36} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.five,
    alignItems: 'center',
    gap: Spacing.two,
  },
  versionText: {
    textAlign: 'center',
  },
});
