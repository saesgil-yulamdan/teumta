import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TeumtaHybrid } from '@/constants/theme';

export type TeumtaTab = 'home' | 'explore' | 'trips' | 'my';

const TABS = [
  {
    key: 'home',
    label: '홈',
    activeIcon: require('@/assets/images/icons/tab-home.svg'),
    inactiveIcon: require('@/assets/images/icons/tab-home-inactive.svg'),
  },
  {
    key: 'explore',
    label: '탐색',
    activeIcon: require('@/assets/images/icons/tab-explore-active.svg'),
    inactiveIcon: require('@/assets/images/icons/tab-explore.svg'),
  },
  {
    key: 'trips',
    label: '내 여행',
    activeIcon: require('@/assets/images/icons/tab-trips-active.svg'),
    inactiveIcon: require('@/assets/images/icons/tab-trips.svg'),
  },
  {
    key: 'my',
    label: '마이',
    activeIcon: require('@/assets/images/icons/tab-my-active.svg'),
    inactiveIcon: require('@/assets/images/icons/tab-my.svg'),
  },
] as const;

export function TeumtaTabBar({ active }: { active: TeumtaTab }) {
  const router = useRouter();

  const goTo = (tab: TeumtaTab) => {
    if (tab === active) {
      return;
    }
    switch (tab) {
      case 'home':
        router.dismissTo('/');
        break;
      case 'explore':
        router.push('/search');
        break;
      case 'trips':
        router.push('/trips');
        break;
      case 'my':
        router.push('/my');
        break;
    }
  };

  return (
    <View style={styles.bar}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable key={tab.key} accessibilityRole="tab" accessibilityLabel={`${tab.label} 탭`} accessibilityState={{ selected: isActive }} style={styles.item} onPress={() => goTo(tab.key)}>
            <Image
              source={isActive ? tab.activeIcon : tab.inactiveIcon}
              style={[styles.icon, isActive && styles.iconActive]}
              contentFit="contain"
            />
            <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.paper,
    borderTopColor: TeumtaHybrid.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    height: 70,
    justifyContent: 'space-between',
    paddingHorizontal: 38,
  },
  item: {
    alignItems: 'center',
    gap: 3,
  },
  icon: {
    height: 20,
    width: 20,
  },
  iconActive: {
    tintColor: TeumtaHybrid.navy,
  },
  label: {
    color: TeumtaHybrid.faint,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  labelActive: {
    color: TeumtaHybrid.navy,
  },
});
