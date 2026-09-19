import { Tabs } from 'expo-router';

import { TeumtaTabBar } from '@/components/teumta-tab-bar';
import { TeumtaHybrid } from '@/constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="index"
      backBehavior="initialRoute"
      tabBar={(props) => <TeumtaTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: TeumtaHybrid.canvas } }}>
      <Tabs.Screen name="index" options={{ title: '둘러보기' }} />
      <Tabs.Screen name="trips" options={{ title: '내 여행' }} />
    </Tabs>
  );
}
