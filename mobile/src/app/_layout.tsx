import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import '@/global.css';
import { TeumtaHybrid } from '@/constants/theme';
import { BookmarksProvider } from '@/hooks/use-bookmarks';
import { CourseLogProvider } from '@/hooks/use-course-log';

SplashScreen.preventAutoHideAsync();

// 디자인이 라이트 모드 전용이라 앱 전체를 라이트로 고정한다(app.json userInterfaceStyle 참고).
export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <ThemeProvider value={DefaultTheme}>
      <BookmarksProvider>
        <CourseLogProvider>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: TeumtaHybrid.paper },
              headerTintColor: TeumtaHybrid.ink,
              headerShadowVisible: false,
              contentStyle: { backgroundColor: TeumtaHybrid.paper },
            }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="places/[id]"
              options={{ title: '관광지 상세', headerShown: false }}
            />
            <Stack.Screen
              name="local-places/[id]"
              options={{ title: '로컬 장소 상세', headerShown: false }}
            />
            <Stack.Screen name="detours" options={{ title: '틈타 코스', headerShown: false }} />
            <Stack.Screen name="course-map" options={{ title: '코스 상세', headerShown: false }} />
            <Stack.Screen name="trip" options={{ title: '코스 진행', headerShown: false }} />
          </Stack>
        </CourseLogProvider>
      </BookmarksProvider>
    </ThemeProvider>
  );
}
