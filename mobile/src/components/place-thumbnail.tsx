import { Image } from 'expo-image';
import {
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Teumta, TeumtaHybrid } from '@/constants/theme';

/**
 * 장소 사진 자리.
 *
 * TourAPI에 사진이 없는 장소가 있다(종로 표본 36곳 중 6곳, 대부분 음식점).
 * `detailImage2`까지 확인했지만 그 장소들은 추가 이미지도 0장이라 더 조회해도 안 나온다.
 * 외부에서 사진을 끌어오는 건 저작권 문제라 하지 않는다.
 *
 * 그래서 빈 회색 사각형 대신 **분류를 보여준다.** 사진이 없는 것과
 * 로딩에 실패한 것이 구분되고, 빈 자리에서도 정보가 하나는 남는다.
 */

type PlaceThumbnailProps = {
  imageUrl?: string | null;
  /** 서버 분류 라벨(3.3b `category`). 없으면 중립 배경만. */
  category?: string | null;
  variant: 'card' | 'hero';
  style?: StyleProp<ViewStyle & ImageStyle>;
};

type Tone = { background: string; text: string };

/**
 * 분류 계열별 색.
 *
 * 혼잡도 색(`Teumta.congestion`)은 재사용하지 않는다 — 그쪽은 "붐빔"이라는 의미를 갖고 있어
 * 분류에 쓰면 두 신호가 섞인다.
 */
const FOOD: Tone = { background: '#FFF3E6', text: '#B5701A' };
const SHOPPING: Tone = { background: '#F0EEFB', text: '#5B51A8' };
const CULTURE: Tone = { background: TeumtaHybrid.slateSoft, text: TeumtaHybrid.slate };
const NEUTRAL: Tone = { background: Teumta.imagePlaceholder, text: Teumta.textTertiary };

/** 서버 분류 라벨(nearby-local-place.service의 표)과 같은 값을 쓴다. */
const TONE_BY_CATEGORY: Record<string, Tone> = {
  한식: FOOD,
  양식: FOOD,
  일식: FOOD,
  중식: FOOD,
  이색음식: FOOD,
  '카페·찻집': FOOD,
  음식점: FOOD,
  '5일장': SHOPPING,
  전통시장: SHOPPING,
  백화점: SHOPPING,
  '전문매장·상가': SHOPPING,
  '공예·공방': SHOPPING,
  특산물: SHOPPING,
  '거리·상권': SHOPPING,
  쇼핑: SHOPPING,
  박물관: CULTURE,
  기념관: CULTURE,
  전시관: CULTURE,
  컨벤션: CULTURE,
  '미술관·갤러리': CULTURE,
  공연장: CULTURE,
  문화원: CULTURE,
  도서관: CULTURE,
  서점: CULTURE,
  문화시설: CULTURE,
};

/** 카드 썸네일은 52px이라 "카페·찻집" 전체가 안 들어간다. 가운뎃점 앞까지만 쓴다. */
function shortLabel(category: string): string {
  return category.split('·')[0];
}

export function PlaceThumbnail({ imageUrl, category, variant, style }: PlaceThumbnailProps) {
  if (imageUrl) {
    // 목록에서 뷰가 재활용될 때 직전 항목의 사진이 남지 않게 한다.
    return (
      <Image source={{ uri: imageUrl }} style={style} contentFit="cover" recyclingKey={imageUrl} />
    );
  }

  const tone = (category && TONE_BY_CATEGORY[category]) || NEUTRAL;
  const label = category ? (variant === 'card' ? shortLabel(category) : category) : null;

  return (
    // 호출부 스타일(카드 썸네일 등)이 회색 배경을 갖고 있어 분류 색이 뒤에 와야 이긴다.
    <View style={[styles.fallback, style, { backgroundColor: tone.background }]}>
      {label ? (
        <Text
          style={[
            variant === 'card' ? styles.cardLabel : styles.heroLabel,
            { color: tone.text },
          ]}
          numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  heroLabel: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
