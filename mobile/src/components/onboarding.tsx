import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TeumtaHybrid } from '@/constants/theme';

/** 봤는지 여부만 기기에 남긴다 — 다른 저장 데이터와 달리 지워도 다시 뜨는 것뿐이라 전체 삭제에 안 묶는다. */
const STORAGE_KEY = 'teumta:onboarding-seen:v1';

const STEPS = [
  {
    key: 'check',
    title: '혼잡도 확인',
    body: '목적지의 현재 상태를 봅니다.',
  },
  {
    key: 'detour',
    title: '주변으로 우회',
    body: '남는 시간에 맞춰 걸어봅니다.',
  },
  {
    key: 'return',
    title: '제시간에 복귀',
    body: '복귀시각을 계속 다시 계산합니다.',
  },
] as const;

/**
 * 첫 실행 1장짜리 온보딩.
 *
 * 홈 위에 모달로 덮는다 — 라우트로 만들면 첫 프레임에 홈이 번쩍였다가 전환된다.
 * 저장값을 읽기 전에는 아무것도 띄우지 않는다(이미 본 사용자에게 깜빡임 방지).
 */
export function Onboarding() {
  const [visible, setVisible] = useState(false);

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
    AsyncStorage.setItem(STORAGE_KEY, 'true').catch(() => {});
  };

  if (!visible) {
    return null;
  }

  return (
    <Modal animationType="fade" transparent={false} onRequestClose={dismiss}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.content}>
          <View style={styles.brandRow}>
            <Image
              source={require('@/assets/images/teumta-logo.svg')}
              style={styles.brandLogo}
              contentFit="contain"
            />
            <Text style={styles.brandName}>틈타</Text>
          </View>

          <Text style={styles.title}>붐비는 시간은 비켜가고,{'\n'}여행은 그대로.</Text>
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
              로그인 없이 사용 · 위치는 기기에서만 처리
            </Text>
          </View>
        </View>

        <Pressable style={styles.ctaButton} onPress={dismiss}>
          <Text style={styles.ctaLabel}>시작하기</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: TeumtaHybrid.paper,
    flex: 1,
    paddingHorizontal: 24,
  },
  content: {
    flex: 1,
    gap: 14,
    justifyContent: 'center',
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  brandLogo: {
    height: 25,
    width: 32,
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
  subtitle: {
    color: TeumtaHybrid.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  steps: {
    gap: 12,
    marginTop: 10,
  },
  stepRow: {
    alignItems: 'center',
    borderBottomColor: TeumtaHybrid.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  stepBadge: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.signalSoft,
    borderRadius: TeumtaHybrid.radius.small,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  stepBadgeLabel: {
    color: TeumtaHybrid.navy,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  stepTexts: {
    flex: 1,
    gap: 2,
  },
  stepTitle: {
    color: TeumtaHybrid.ink,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  stepBody: {
    color: TeumtaHybrid.muted,
    fontSize: 11,
    lineHeight: 16,
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
    fontSize: 11,
    lineHeight: 15,
  },
  ctaButton: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.ink,
    borderRadius: TeumtaHybrid.radius.small,
    height: 52,
    justifyContent: 'center',
    marginBottom: 12,
  },
  ctaLabel: {
    color: TeumtaHybrid.white,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
});
