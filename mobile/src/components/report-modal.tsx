import Constants from 'expo-constants';
import { Alert, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Teumta } from '@/constants/theme';
import { buildReportMailUrl } from '@/utils/report-mail';

const PLACE_CATEGORIES = [
  '영업시간·휴무가 달라요',
  '주소·위치가 달라요',
  '폐업·운영 종료 장소예요',
  '사진·설명이 달라요',
  '혼잡도·예측 정보가 이상해요',
  '기타 장소 정보가 달라요',
] as const;

const APP_CATEGORIES = [
  '앱이 정상 작동하지 않아요',
  '화면·문구가 이상해요',
  '기능 개선을 제안해요',
  '기타 의견이 있어요',
] as const;

type ReportModalProps = {
  visible: boolean;
  onClose: () => void;
  kind: 'place' | 'app';
  place?: {
    name: string;
    source: string;
    id?: string;
    address?: string;
  };
};

export function ReportModal({ visible, onClose, kind, place }: ReportModalProps) {
  const insets = useSafeAreaInsets();
  const categories = kind === 'place' ? PLACE_CATEGORIES : APP_CATEGORIES;

  const openReportMail = async (category: string) => {
    const url = buildReportMailUrl({
      category,
      appVersion: Constants.expoConfig?.version ?? '확인 불가',
      platform: Platform.OS,
      ...(kind === 'place' && place ? { place } : {}),
    });

    try {
      await Linking.openURL(url);
      onClose();
    } catch {
      Alert.alert(
        '메일 앱을 열 수 없어요',
        '기기에 메일 앱을 설정한 뒤 다시 시도하거나 마이 화면의 지원·문의를 이용해 주세요.',
      );
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="제보 창 닫기"
        style={styles.backdrop}
        onPress={onClose}>
        <Pressable
          accessibilityRole="none"
          style={[styles.sheet, { paddingBottom: 18 + insets.bottom }]}
          onPress={() => {}}>
          <View style={styles.header}>
            <View style={styles.headerTexts}>
              <Text style={styles.title}>
                {kind === 'place' ? '어떤 정보가 다른가요?' : '무엇을 보내시겠어요?'}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {kind === 'place' && place ? place.name : '버그·의견 보내기'}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="제보 창 닫기"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
              <Text style={styles.closeLabel}>×</Text>
            </Pressable>
          </View>

          <View style={styles.categoryList}>
            {categories.map((category) => (
              <Pressable
                accessibilityRole="button"
                key={category}
                onPress={() => void openReportMail(category)}
                style={({ pressed }) => [styles.categoryButton, pressed && styles.pressed]}>
                <Text style={styles.categoryLabel}>{category}</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.notice}>
            선택하면 메일 앱이 열려요. 내용을 확인하고 직접 보내주세요. 현재 위치나 기기 ID는
            포함하지 않아요.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(15, 20, 17, 0.5)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Teumta.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  headerTexts: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: Teumta.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 25,
  },
  subtitle: {
    color: Teumta.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: Teumta.imagePlaceholder,
    borderRadius: 19,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  closeLabel: {
    color: Teumta.textSecondary,
    fontSize: 26,
    fontWeight: '400',
    lineHeight: 29,
  },
  categoryList: {
    gap: 7,
  },
  categoryButton: {
    alignItems: 'center',
    backgroundColor: '#F7F9F8',
    borderRadius: 13,
    flexDirection: 'row',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  categoryLabel: {
    color: Teumta.textPrimary,
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  chevron: {
    color: Teumta.textTertiary,
    fontSize: 21,
    lineHeight: 25,
  },
  notice: {
    color: Teumta.textTertiary,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
