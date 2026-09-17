import { Image } from 'expo-image';

/** 루트의 v2 SVG에서 생성한 공통 로고. 비율과 원본 색상을 그대로 유지한다. */
export function TeumtaLogo({ size = 32 }: { size?: number }) {
  return (
    <Image
      source={require('@/assets/images/teumta-logo.svg')}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessibilityLabel="틈타 로고"
    />
  );
}
