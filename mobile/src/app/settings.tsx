import { appAlert as Alert } from '@/utils/app-alert';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useRouter, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import { AppState, Linking, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ReportModal } from '@/components/report-modal';
import { detailStyles as s } from '@/components/detail-styles';
import { travel, useTravel, storageError } from '@/stores/travel';
import { clearSelectedCourse } from '@/stores/selected-course';

export default function SettingsScreen() {
  const router = useRouter();
  const { active, remember, error } = useTravel();
  const [showReport, setShowReport] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [permissions, setPermissions] = useState({ location: '확인 중', notifications: '확인 중' });
  useFocusEffect(useCallback(() => {
    let alive = true;
    const refresh = async () => {
      const [location, notifications] = await Promise.allSettled([Location.getForegroundPermissionsAsync(), Platform.OS === 'web' ? Promise.resolve(null) : Notifications.getPermissionsAsync()]);
      const label = (result: PromiseSettledResult<{ status: string } | null>) => result.status === 'rejected' || !result.value ? '지원되지 않음' : result.value.status === 'granted' ? '허용' : result.value.status === 'denied' ? '허용 안 함' : '아직 요청하지 않음';
      if (alive) setPermissions({ location: label(location), notifications: label(notifications) });
    };
    void refresh();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { alive = false; listener.remove(); };
  }, []));
  const clear = () => Alert.alert('여행 데이터 모두 삭제', '저장 장소·최근 검색·최근 본 코스·여행 기록을 삭제합니다.' + (active ? ' 진행 중인 여행도 종료되고 복귀 알림이 취소됩니다.' : '') + ' 첫 실행 안내와 표시 설정은 유지됩니다.', [
    { text: '취소', style: 'cancel' }, { text: '모두 삭제', style: 'destructive', onPress: async () => {
      setDeleting(true);
      try { await travel.deleteAll(); clearSelectedCourse(); Alert.alert('삭제 완료', '기기 여행 데이터와 예약 알림을 삭제했어요.'); }
      catch (e) { storageError(e); }
      finally { setDeleting(false); }
    } },
  ]);
  return <SafeAreaView style={s.screen}>
    <ScrollView contentContainerStyle={s.content}>
      <Pressable accessibilityRole="button" style={s.row} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}><Text style={s.link}>‹ 돌아가기</Text></Pressable>
      <Text style={s.heading}>설정·도움</Text>
      <View style={s.card}><Text style={s.title}>회원가입 없이, 이 기기에만</Text>
        <Text style={s.body}>저장 장소·여행 진행·기록은 기기에 보관합니다. 서버 백업이나 다른 기기 동기화는 제공하지 않습니다.</Text>
        <Text style={s.body}>조회할 검색어·공개 장소 코드·시간 조건은 API로 전송합니다. 실제 GPS·여행 회차 식별자·여행 기록은 전송하지 않습니다. 위치 권한 없이도 검색과 수동 여행 완료가 가능합니다.</Text>
      </View>
      <View style={s.card}>
        <View style={s.row}><Text style={[s.title, { flex: 1 }]}>최근 검색·열람 기록 남기기</Text><Switch accessibilityLabel="최근 검색·열람 기록 남기기" value={remember} onValueChange={value => void travel.remember(value).catch(storageError)} /></View>
        <Text style={s.body}>끄면 새 자동 기록을 남기지 않아요. 저장 장소와 여행 결과는 별도로 보관됩니다.</Text>
        {error && <Pressable style={s.row} onPress={() => void travel.retry().catch(storageError)}><Text style={s.body}>{error} · 다시 시도</Text></Pressable>}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: deleting, busy: deleting }} disabled={deleting} style={s.row} onPress={clear}><Text style={s.link}>{deleting ? '삭제·알림 정리 중…' : '여행 데이터 모두 삭제'}</Text></Pressable>
      </View>
      <View style={s.card}><Text style={s.title}>권한</Text><Text style={s.body}>위치 · {permissions.location}</Text><Text style={s.body}>알림 · {permissions.notifications}</Text><Text style={s.body}>진행 화면에서 필요할 때 켤 수 있어요. 허용하지 않아도 직접 도착·복귀를 기록할 수 있어요.</Text>
        <Pressable accessibilityRole="button" style={s.row} onPress={() => Platform.OS === 'web' ? Alert.alert('브라우저 사이트 설정', '주소창의 사이트 권한 설정에서 변경하세요.') : void Linking.openSettings().catch(() => Alert.alert('설정 앱에서 틈타를 선택해 주세요.'))}><Text style={s.link}>OS 권한 설정 열기</Text></Pressable>
      </View>
      <View style={s.card}>
        <Pressable accessibilityRole="button" style={s.row} onPress={() => setShowReport(true)}><Text style={s.link}>앱 오류·의견 보내기</Text></Pressable>
        <Text style={s.body}>메일 초안을 확인한 뒤 직접 전송합니다. 위치·여행 이력·기기 식별자는 자동 첨부하지 않습니다. 장소 정보 수정은 해당 장소 상세에서 제보해 주세요.</Text>
        <Pressable accessibilityRole="link" style={s.row} onPress={() => void Linking.openURL('https://saesgil-yulamdan.github.io/teumta/')}><Text style={s.link}>도움·문의</Text></Pressable>
        <Pressable accessibilityRole="link" style={s.row} onPress={() => void Linking.openURL('https://saesgil-yulamdan.github.io/teumta/privacy.html')}><Text style={s.link}>개인정보처리방침</Text></Pressable>
      </View>
      <Text style={s.body}>틈타 · 버전 {Constants.expoConfig?.version ?? '1.0.0'}</Text>
    </ScrollView>
    <ReportModal visible={showReport} onClose={() => setShowReport(false)} kind="app" />
  </SafeAreaView>;
}
