import { appAlert as Alert } from '@/utils/app-alert';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { travel, useTravel, storageError } from '@/stores/travel';
import { courseStopId } from '@/utils/trip-summary';
import { detailStyles as s } from '@/components/detail-styles';
export default function HistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { records, ready, cleanupPending } = useTravel();
  const record = records.find(v => v.id === id);
  return <SafeAreaView style={s.screen}>
    <ScrollView contentContainerStyle={s.content}>
      <Pressable accessibilityRole="button" style={s.row} onPress={() => router.navigate({ pathname: '/trips', params: { section: 'history' } })}><Text style={s.link}>‹ 내 여행</Text></Pressable>
      <Text style={s.heading}>여행 기록</Text>
      {!record ? <Text style={s.body}>{ready ? '삭제되었거나 없는 기록이에요.' : '기록을 불러오고 있어요.'}</Text> : <>
        <View style={s.card}>
          <Text style={s.title}>{record.selected.destination.name}</Text>
          <Text style={s.body}>{record.endedAt === null ? '날짜 미기록' : new Date(record.endedAt).toLocaleString('ko-KR')}</Text>
          <Text style={s.title}>{record.status === 'legacy' ? '이전 버전 기록' : record.status === 'interrupted' ? '중간 종료' : record.completedAll ? '모든 장소 방문 · 복귀 완료' : '복귀 완료 · 일부 장소 미방문'}</Text>
          <Text style={s.body}>{cleanupPending ? '결과는 저장됐지만 알림 정리가 필요해요. 설정에서 다시 시도해 주세요.' : '이 기기에 저장된 기록입니다.'}</Text>
        </View>
        {cleanupPending && <Pressable accessibilityRole="button" style={s.row} onPress={() => void travel.retry().catch(storageError)}><Text style={s.link}>예약 알림 정리 다시 시도</Text></Pressable>}
        <View style={s.card}>
          <Text style={s.title}>회차 결과</Text>
          <Text style={s.body}>계획 당시 예상 {record.selected.course.totalMinutes}분</Text>
          <Text style={s.body}>{record.startedAt !== null && record.endedAt !== null ? '실제 경과 ' + Math.max(0, Math.round((record.endedAt - record.startedAt) / 60000)) + '분' : '실제 경과시간 · 미기록'}</Text>
          {record.status === 'legacy' && <Text style={s.body}>이전 저장 방식에서는 회차·방문 결과를 구분하지 않았어요. 여행 횟수나 방문 수에 포함하지 않습니다.</Text>}
          {record.selected.course.stops.map((stop, index) => {
            const outcome = record.outcomes[courseStopId(stop, index)];
            return <View key={courseStopId(stop, index)} style={s.row}><Text style={[s.body, { flex: 1 }]}>{stop.name}</Text><Text style={s.title}>{record.status === 'legacy' ? '미기록' : outcome === 'visited' ? '방문' : outcome === 'skipped' ? '건너뜀' : outcome === 'unavailable' ? '방문 불가' : '미방문'}</Text></View>;
          })}
        </View>
        <Pressable accessibilityRole="button" style={s.button} onPress={() => router.push({ pathname: '/detours', params: { ...record.selected.destinationParams, name: record.selected.destination.name } })}><Text style={s.buttonLabel}>같은 출발지에서 새 코스 만들기</Text></Pressable>
        <Pressable accessibilityRole="button" style={s.row} onPress={() => Alert.alert('이 기록을 삭제할까요?', '현재 진행 중인 여행은 바뀌지 않아요.', [
          { text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => void travel.deleteRecord(record.id).then(() => router.replace({ pathname: '/trips', params: { section: 'history' } })).catch(storageError) },
        ])}><Text style={s.link}>이 여행 기록 삭제</Text></Pressable>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
