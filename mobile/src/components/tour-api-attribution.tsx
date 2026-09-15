import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { TeumtaHybrid } from '@/constants/theme';

type TourApiAttributionProps = {
  style?: StyleProp<TextStyle>;
};

/** TourAPI(한국관광공사) 데이터를 노출하는 화면에 공통으로 붙이는 출처 표기. */
export function TourApiAttribution({ style }: TourApiAttributionProps) {
  return <Text style={[styles.text, style]}>자료 제공: ⓒ한국관광공사</Text>;
}

const styles = StyleSheet.create({
  text: {
    color: TeumtaHybrid.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
