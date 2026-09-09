import Constants from 'expo-constants';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TeumtaHybrid } from '@/constants/theme';
import { buildReportMailUrl } from '@/utils/report-mail';

const PLACE_CATEGORIES = [
  '영업시간·휴무',
  '주소·위치',
  '폐업·운영 종료',
  '사진·설명',
  '혼잡도·예측',
  '기타 장소 정보',
] as const;

const APP_CATEGORIES = [
  '앱 오류',
  '화면·문구',
  '기능 제안',
  '기타 의견',
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
      <View style={styles.backdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="제보 창 닫기"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <ScrollView
          style={styles.sheet}
          contentContainerStyle={[styles.sheetContent, { paddingBottom: 18 + insets.bottom }]}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.headerTexts}>
              <Text style={styles.title}>
                {kind === 'place' ? '제보할 항목' : '의견 종류'}
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
            메일 앱에서 확인 후 보내주세요. 위치·기기 ID는 포함하지 않습니다.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(25, 26, 23, 0.55)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: TeumtaHybrid.paper,
    borderTopLeftRadius: TeumtaHybrid.radius.large,
    borderTopRightRadius: TeumtaHybrid.radius.large,
    maxHeight: '88%',
    width: '100%',
  },
  sheetContent: {
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
    color: TeumtaHybrid.ink,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 25,
  },
  subtitle: {
    color: TeumtaHybrid.muted,
    fontSize: 11,
    lineHeight: 15,
  },
  closeButton: {
    alignItems: 'center',
    borderColor: TeumtaHybrid.line,
    borderRadius: TeumtaHybrid.radius.small,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  closeLabel: {
    color: TeumtaHybrid.ink,
    fontSize: 26,
    fontWeight: '400',
    lineHeight: 29,
  },
  categoryList: {
    borderTopColor: TeumtaHybrid.line,
    borderTopWidth: 1,
  },
  categoryButton: {
    alignItems: 'center',
    borderBottomColor: TeumtaHybrid.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  categoryLabel: {
    color: TeumtaHybrid.ink,
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  chevron: {
    color: TeumtaHybrid.faint,
    fontSize: 21,
    lineHeight: 25,
  },
  notice: {
    color: TeumtaHybrid.faint,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
