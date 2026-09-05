/** 라이트·다크 모드 색상. Expo 템플릿 기본값 — 틈타 화면은 아래 `Teumta` 토큰을 쓴다. */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * 틈타 디자인 토큰(Figma "틈타 사용자 앱" 기준).
 * congestion.medium은 디자인 미정의 → 혼잡·여유 톤 사이 보간값.
 */
export const Teumta = {
  background: '#FAFAF7',
  surface: '#FFFFFF',
  border: '#E5EAE6',
  textPrimary: '#202522',
  textSecondary: '#737B76',
  textTertiary: '#A3AAA5',
  green: '#55C89A',
  greenLight: '#EAF8F2',
  greenDark: '#24966D',
  imagePlaceholder: '#F2F5F3',
  congestion: {
    low: { text: '#24966D', background: '#EAF8F2', dot: '#35B779' },
    medium: { text: '#B98207', background: '#FFF6E3', dot: '#F1B84B' },
    high: { text: '#EF6D64', background: '#FFF0ED', dot: '#EF6D64' },
    veryHigh: { text: '#E0362C', background: '#FFECEA', dot: '#FF0000' },
  },
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
