import { Image } from 'expo-image';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { TeumtaHybrid, TeumtaLayout } from '@/constants/theme';

const TABS = [
  {
    key: 'index',
    label: '홈',
    activeIcon: require('@/assets/images/icons/tab-home.svg'),
    inactiveIcon: require('@/assets/images/icons/tab-home-inactive.svg'),
  },
  {
    key: 'search',
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

export function TeumtaTabBar({ state, navigation }: BottomTabBarProps) {
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.bar}>
      {TABS.map((tab) => {
        const route = state.routes.find((item) => item.name === tab.key);
        if (!route) return null;
        const isActive = state.routes[state.index].key === route.key;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityLabel={`${tab.label} 탭`}
            accessibilityState={{ selected: isActive }}
            style={styles.item}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!isActive && !event.defaultPrevented) {
                Keyboard.dismiss();
                navigation.navigate(route.name, route.params);
              }
            }}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}>
            <Image
              source={isActive ? tab.activeIcon : tab.inactiveIcon}
              style={styles.icon}
              contentFit="contain"
            />
            <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: TeumtaHybrid.paper,
    flexShrink: 0,
  },
  bar: {
    alignItems: 'center',
    backgroundColor: TeumtaHybrid.paper,
    borderTopColor: TeumtaHybrid.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: TeumtaLayout.tabBarMinHeight,
    justifyContent: 'space-around',
    paddingHorizontal: TeumtaLayout.screenGutter,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 14,
    gap: 4,
    minWidth: 58,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  icon: {
    height: 24,
    width: 24,
  },
  label: {
    color: TeumtaHybrid.faint,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 18,
  },
  labelActive: {
    color: TeumtaHybrid.forest,
    fontWeight: '700',
  },
});
