import { StyleSheet } from 'react-native';
import { TeumtaHybrid, TeumtaLayout } from '@/constants/theme';
export const detailStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: TeumtaHybrid.canvas },
  content: { padding: TeumtaLayout.screenGutter, paddingBottom: 32, gap: 20 },
  heading: { fontSize: 24, fontWeight: '800', color: TeumtaHybrid.ink, lineHeight: 34 },
  title: { fontSize: 17, fontWeight: '700', color: TeumtaHybrid.ink, lineHeight: 26 },
  body: { fontSize: 14, color: TeumtaHybrid.muted, lineHeight: 23 },
  row: { minHeight: 52, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  card: { backgroundColor: TeumtaHybrid.paper, borderRadius: 16, padding: 16, gap: 10 },
  link: { fontSize: 14, color: TeumtaHybrid.navy, fontWeight: '700', lineHeight: 23 },
  button: { minHeight: 52, borderRadius: 16, padding: 16, backgroundColor: TeumtaHybrid.navy, alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { color: TeumtaHybrid.white, fontSize: 16, fontWeight: '700', lineHeight: 24 },
});
