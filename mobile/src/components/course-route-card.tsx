import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TeumtaHybrid } from '@/constants/theme';
import {
  courseDistanceMeters,
  courseStayMinutes,
  type CourseDestination,
  type GeneratedCourse,
} from '@/types/course';
import { courseCompositionLabel, courseTitle, formatKilometers } from '@/utils/course-labels';
import { timeLabelAfter } from '@/utils/time';

export function CourseRouteCard(props: {
  course: GeneratedCourse;
  destination: CourseDestination;
  routeIndex: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const { course, destination, routeIndex, selected, onSelect } = props;
  const distanceLabel = formatKilometers(courseDistanceMeters(course));
  const stats = [
    { value: timeLabelAfter(course.totalMinutes), label: '예상 복귀' },
    { value: `${courseStayMinutes(course)}분`, label: '추천 체류' },
    { value: distanceLabel, label: '걷는 거리' },
  ];
  const stopNames = [...course.stops.map((stop) => stop.name), `${destination.name} 복귀`];

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onSelect}
      style={[styles.card, selected ? styles.cardSelected : styles.cardAlternative]}>
      <View style={styles.cardHeader}>
        <View style={[styles.routeCode, selected && styles.routeCodeSelected]}>
          <Text style={styles.routeCodeLabel}>R{routeIndex + 1}</Text>
        </View>
        <View style={styles.routeHeaderTexts}>
          <Text style={styles.routeKind}>{selected ? '추천 경로' : '대안 경로'}</Text>
          <Text style={styles.headerDuration}>{course.totalMinutes}분 · {distanceLabel}</Text>
        </View>
        <View style={selected ? styles.radioOn : styles.radioOff} />
      </View>

      <View style={[styles.cardBody, selected ? styles.cardBodySelected : styles.cardBodyAlternative]}>
        <View style={styles.cardTitleRow}>
          <View style={styles.cardTexts}>
            <Text
              numberOfLines={1}
              style={selected ? styles.cardName : styles.cardNameAlternative}>
              {courseTitle(course)}
            </Text>
            <Text
              numberOfLines={1}
              style={selected ? styles.cardDescription : styles.cardDescriptionAlternative}>
              {courseCompositionLabel(course)}
            </Text>
          </View>
        </View>

        {(course.recommendationTags?.length ?? 0) > 0 && (
          <View style={styles.reasonRow}>
            {course.recommendationTags?.map((tag, index) => (
              <View key={tag} style={styles.reasonChip}>
                {index > 0 && <Text style={styles.reasonDivider}>/</Text>}
                <Text style={styles.reasonChipLabel}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.stopsRow}>
          {stopNames.map((stop, index) => (
            <View key={`${stop}-${index}`} style={styles.stopRow}>
              <View style={styles.stopCode}>
                <Text style={styles.stopCodeLabel}>
                  {index === stopNames.length - 1 ? 'D' : String(index + 1).padStart(2, '0')}
                </Text>
              </View>
              <Text style={styles.stopName}>{stop}</Text>
            </View>
          ))}
        </View>

        <View style={styles.statsRow}>
          {stats.map((stat, index) => (
            <View
              key={stat.label}
              style={[
                styles.statTile,
                index === 2 && styles.statTileLast,
                selected ? styles.statTileSelected : styles.statTileAlternative,
              ]}>
              <Text style={selected ? styles.statValue : styles.statValueAlternative}>
                {stat.value}
              </Text>
              <Text style={selected ? styles.statLabel : styles.statLabelAlternative}>
                {stat.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: TeumtaHybrid.paper, borderColor: TeumtaHybrid.line, borderRadius: 16, elevation: 2, overflow: 'hidden', shadowColor: TeumtaHybrid.ink, shadowOffset: { height: 2, width: 0 }, shadowOpacity: 0.08, shadowRadius: 8 },
  cardSelected: { borderColor: TeumtaHybrid.forest, borderWidth: 2, shadowOpacity: 0.14 },
  cardAlternative: { borderWidth: 1 },
  cardHeader: { alignItems: 'center', borderBottomColor: TeumtaHybrid.line, borderBottomWidth: 1, flexDirection: 'row', minHeight: 72 },
  routeCode: { alignItems: 'center', alignSelf: 'stretch', backgroundColor: TeumtaHybrid.canvas, justifyContent: 'center', width: 62 },
  routeCodeSelected: { backgroundColor: TeumtaHybrid.forestSoft },
  routeCodeLabel: { color: TeumtaHybrid.forest, fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  routeHeaderTexts: { flex: 1, gap: 3, paddingHorizontal: 14 },
  routeKind: { color: TeumtaHybrid.forest, fontSize: 10, fontWeight: '800', letterSpacing: 0.9, lineHeight: 14 },
  headerDuration: { color: TeumtaHybrid.navy, fontSize: 13, fontWeight: '900', lineHeight: 18 },
  radioOn: { backgroundColor: TeumtaHybrid.forest, borderColor: TeumtaHybrid.forestSoft, borderWidth: 5, borderRadius: 999, height: 22, marginRight: 16, width: 22 },
  radioOff: { borderColor: TeumtaHybrid.line, borderRadius: 999, borderWidth: 2, height: 22, marginRight: 16, width: 22 },
  cardBody: { backgroundColor: TeumtaHybrid.paper, paddingHorizontal: 16 },
  cardBodySelected: { gap: 14, paddingVertical: 16 },
  cardBodyAlternative: { gap: 12, paddingVertical: 14 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cardTexts: { flex: 1, gap: 3 },
  cardName: { color: TeumtaHybrid.ink, fontSize: 18, fontWeight: '800', lineHeight: 24 },
  cardNameAlternative: { color: TeumtaHybrid.ink, fontSize: 17, fontWeight: '800', lineHeight: 23 },
  cardDescription: { color: TeumtaHybrid.muted, fontSize: 12, lineHeight: 17 },
  cardDescriptionAlternative: { color: TeumtaHybrid.muted, fontSize: 12, lineHeight: 17 },
  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  reasonChip: { alignItems: 'center', backgroundColor: TeumtaHybrid.forestSoft, borderRadius: 999, flexDirection: 'row', gap: 4, paddingHorizontal: 9, paddingVertical: 5 },
  reasonChipLabel: { color: TeumtaHybrid.forest, fontSize: 11, fontWeight: '700', lineHeight: 15 },
  reasonDivider: { color: TeumtaHybrid.forest, fontSize: 11 },
  stopsRow: { borderBottomColor: TeumtaHybrid.line, borderTopColor: TeumtaHybrid.line, borderTopWidth: 1 },
  stopRow: { alignItems: 'center', borderBottomColor: TeumtaHybrid.line, borderBottomWidth: 1, flexDirection: 'row', minHeight: 38 },
  stopCode: { alignItems: 'center', borderRightColor: TeumtaHybrid.line, borderRightWidth: 1, justifyContent: 'center', width: 42 },
  stopCodeLabel: { color: TeumtaHybrid.terracotta, fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  stopName: { color: TeumtaHybrid.ink, flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 17, paddingHorizontal: 11 },
  statsRow: { borderBottomColor: TeumtaHybrid.line, borderBottomWidth: 1, borderTopColor: TeumtaHybrid.line, borderTopWidth: 1, flexDirection: 'row' },
  statTile: { borderRightColor: TeumtaHybrid.line, borderRightWidth: 1, flex: 1, gap: 2, paddingHorizontal: 10 },
  statTileLast: { borderRightWidth: 0 },
  statTileSelected: { paddingVertical: 10 },
  statTileAlternative: { paddingVertical: 9 },
  statValue: { color: TeumtaHybrid.slate, fontSize: 13, fontWeight: '900', lineHeight: 18 },
  statValueAlternative: { color: TeumtaHybrid.slate, fontSize: 12, fontWeight: '900', lineHeight: 17 },
  statLabel: { color: TeumtaHybrid.muted, fontSize: 10, lineHeight: 14 },
  statLabelAlternative: { color: TeumtaHybrid.muted, fontSize: 10, lineHeight: 14 },
});
