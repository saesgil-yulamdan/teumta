import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TeumtaHybrid } from '@/constants/theme';
import { TeumtaLogo } from '@/components/teumta-logo';

/** 봤는지 여부만 기기에 남긴다 — 다른 저장 데이터와 달리 지워도 다시 뜨는 것뿐이라 전체 삭제에 안 묶는다. */
const STORAGE_KEY = 'teumta:onboarding-seen:v1';

const STEPS = [
  {
    key: 'check',
    title: '장소 선택',
    body: '출발하고 돌아올 장소를 골라요.',
  },
  {
    key: 'detour',
    title: '주변 코스',
    body: '30·60·90분에 맞는 코스를 살펴봐요.',
  },
  {
    key: 'return',
    title: '다시 돌아오기',
    body: '직접 도착과 복귀를 기록할 수 있어요.',
  },
] as const;

/**
 * 첫 실행 1장짜리 온보딩.
 *
 * 홈 위에 모달로 덮는다 — 라우트로 만들면 첫 프레임에 홈이 번쩍였다가 전환된다.
 * 저장값을 읽기 전에는 아무것도 띄우지 않는다(이미 본 사용자에게 깜빡임 방지).
 */
export function Onboarding() {
  const { height, width } = useWindowDimensions();
  const [visible, setVisible] = useState(false);
  const compact = width <= 350 || height <= 700;

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((seen) => {
        if (!seen) {
          setVisible(true);
        }
      })
      .catch(() => {
        // 저장소를 못 읽으면 온보딩 없이 진행 — 본 사람에게 또 띄우는 쪽이 더 나쁘다
      });
  }, []);

  const dismiss = () => {
    setVisible(false);
    AsyncStorage.setItem(STORAGE_KEY, 'true').catch(() => { });
  };

  if (!visible) {
    return null;
  }

  return (
    <Modal animationType="fade" transparent={false} onRequestClose={dismiss}>
      <SafeAreaView style={[styles.screen, compact && styles.screenCompact]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, compact && styles.contentCompact]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.brandRow}>
            <TeumtaLogo size={36} />
            <Text style={styles.brandName}>틈타</Text>
          </View>

          <Text style={[styles.title, compact && styles.titleCompact]}>
            붐비는 시간은 비켜가고,{'\n'}여행은 그대로.
          </Text>
          <Text style={styles.subtitle}>
            혼잡한 목적지를 잠시 비켜 주변을 걷고 돌아옵니다.
          </Text>

          <View style={styles.steps}>
            {STEPS.map((step, index) => (
              <View key={step.key} style={styles.stepRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeLabel}>{index + 1}</Text>
                </View>
                <View style={styles.stepTexts}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepBody}>{step.body}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.privacyStrip}>
            <View style={styles.privacyDot} />
            <Text style={styles.privacyText}>
              회원가입 없이 이용 · 여행 정보는 이 기기에 보관
            </Text>
          </View>
        </ScrollView>

        <Pressable accessibilityRole="button" style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }} onPress={dismiss}><Text style={styles.stepBody}>건너뛰기</Text></Pressable>
        <Pressable accessibilityRole="button" style={styles.ctaButton} onPress={dismiss}>
          <Text style={styles.ctaLabel}>시작하기</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: TeumtaHybrid.canvas,
    flex: 1,
    paddingHorizontal: 24,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 520,
  },
  screenCompact: {
    paddingHorizontal: 20,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    gap: 20,
    justifyContent: 'center',
    paddingVertical: 32,
  },
  contentCompact: {
    gap: 11,
    paddingVertical: 16,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  brandName: {
    color: TeumtaHybrid.ink,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 32,
  },
  title: {
    color: TeumtaHybrid.ink,
    fontSize: 27,
    fontWeight: '900',
    lineHeight: 38,
  },
  titleCompact: {
    fontSize: 24,
    lineHeight: 34,
  },
  subtitle: {
    color: TeumtaHybrid.muted,
    fontSize: 15,
    lineHeight: 24,
  },
  steps: {
    gap: 20,
    marginTop: 16,
  },
  stepRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 8,
  },
  stepBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TeumtaHybrid.navySoft,
    borderRadius: 16,
    width: 48,
    height: 48,
  },
  stepBadgeLabel: {
    color: TeumtaHybrid.navy,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 24,
  },
  stepTexts: {
    flex: 1,
    gap: 5,
  },
  stepTitle: {
    color: TeumtaHybrid.ink,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 25,
  },
  stepBody: {
    color: TeumtaHybrid.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  privacyStrip: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  privacyDot: {
    backgroundColor: TeumtaHybrid.slate,
    height: 8,
    width: 8,
  },
  privacyText: {
    color: TeumtaHybrid.muted,
    flex: 1,
    fontSize: 12,
    lineHeight: 20,
  },
  ctaButton: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.navy,
    borderRadius: 16,
    justifyContent: 'center',
    marginBottom: 12,
    minHeight: 56,
    paddingVertical: 14,
  },
  ctaLabel: {
    color: TeumtaHybrid.white,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 24,
  },
});
