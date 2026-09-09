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

/**
 * 2026 hybrid visual direction.
 *
 * Discovery screens use the editorial paper/ink/forest colors while active
 * course screens use the navy/signal wayfinding colors. Keeping this separate
 * from `Teumta` lets screens move over incrementally without changing legacy
 * surfaces by accident.
 */
export const TeumtaHybrid = {
  canvas: '#F1EEE5',
  paper: '#FBFAF5',
  ink: '#191A17',
  muted: '#67685F',
  // 보조 텍스트도 야외·저시력 환경에서 읽히도록 paper 대비를 확보한다.
  faint: '#74766F',
  line: '#D3D0C5',
  forest: '#174F3D',
  forestSoft: '#DCE8DE',
  // 작은 강조 문구에도 쓸 수 있도록 paper 대비 4.5:1 이상을 유지한다.
  terracotta: '#A64F3A',
  terracottaSoft: '#EFE1DA',
  navy: '#344454',
  navySoft: '#E2E6E8',
  signal: '#D2AA57',
  signalSoft: '#F0E7D0',
  slate: '#60717C',
  slateSoft: '#E6EAEB',
  white: '#FFFFFF',
  radius: {
    small: 3,
    medium: 6,
    large: 10,
  },
} as const;

export const TeumtaHybridCongestion = {
  low: { text: '#526F7A', background: '#E6ECEE', dot: '#6C8A94' },
  medium: { text: '#8B692E', background: '#F1E8D5', dot: '#B28A43' },
  high: { text: '#A45542', background: '#F0E0DA', dot: '#BF684F' },
  veryHigh: { text: '#8F3F36', background: '#ECD8D4', dot: '#A84B3E' },
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
