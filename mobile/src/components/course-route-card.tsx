import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TeumtaHybrid } from '@/constants/theme';
import { courseDistanceMeters, courseStayMinutes, type CourseDestination, type GeneratedCourse } from '@/types/course';
import { courseCompositionLabel, courseTitle, formatKilometers } from '@/utils/course-labels';
import { timeLabelAfter } from '@/utils/time';

export function CourseRouteCard({ course, destination, routeIndex, selected, onSelect }: {
  course: GeneratedCourse;
  destination: CourseDestination;
  routeIndex: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const photo = course.stops.find((stop) => stop.imageUrl)?.imageUrl;
  const stops = [...course.stops.map((stop) => stop.name), `${destination.name} 복귀`];
  const stats = [
    { value: timeLabelAfter(course.totalMinutes), label: '예상 복귀' },
    { value: `${courseStayMinutes(course)}분`, label: '추천 체류' },
    { value: formatKilometers(courseDistanceMeters(course)), label: '걷는 거리' },
  ];
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }}
      accessibilityLabel={`코스 ${routeIndex + 1}, ${courseTitle(course)}, ${course.totalMinutes}분`}
      onPress={onSelect} style={[styles.card, selected && styles.cardSelected]}>
      <View style={styles.topRow}>
        <Text style={styles.eyebrow}>{routeIndex === 0 ? '추천 코스' : `코스 ${routeIndex + 1}`}</Text>
        <View style={styles.selection}>
          {selected && <Text style={styles.selectedLabel}>선택됨</Text>}
          <View style={[styles.radio, selected && styles.radioSelected]}>
            {selected && <Text style={styles.check}>✓</Text>}
          </View>
        </View>
      </View>
      <View style={styles.titleRow}>
        <View style={styles.titleTexts}>
          <Text style={styles.duration}>{course.totalMinutes}<Text style={styles.durationUnit}>분</Text></Text>
          <Text style={styles.title}>{courseTitle(course)}</Text>
          <Text style={styles.description}>{courseCompositionLabel(course)}</Text>
        </View>
        {photo && <Image source={{ uri: photo }} recyclingKey={photo} style={styles.photo} contentFit="cover" />}
      </View>
      {!!course.recommendationTags?.length && (
        <View style={styles.tags}>
          {course.recommendationTags.map((tag) => (
            <Text key={tag} style={styles.tag}>{tag}</Text>
          ))}
        </View>
      )}
      <View>
        {stops.map((name, index) => (
          <View key={`${name}-${index}`} style={styles.stopRow}>
            <View style={styles.stopRail}>
              <View style={[styles.dot, index === stops.length - 1 && styles.destinationDot]} />
              {index < stops.length - 1 && <View style={styles.connector} />}
            </View>
            <Text style={styles.stopName}>{name}</Text>
          </View>
        ))}
      </View>
      <View style={styles.stats}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.stat}>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: TeumtaHybrid.paper,
    borderColor: 'transparent',
    borderWidth: 2,
    borderRadius: 24,
    padding: 20,
    gap: 18,
  },
  cardSelected: {
    borderColor: TeumtaHybrid.navy,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: TeumtaHybrid.navy,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  selection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectedLabel: {
    color: TeumtaHybrid.navy,
    fontSize: 12,
    fontWeight: '700',
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: TeumtaHybrid.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: TeumtaHybrid.navy,
    backgroundColor: TeumtaHybrid.navy,
  },
  check: {
    color: TeumtaHybrid.white,
    fontSize: 14,
    fontWeight: '800',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  titleTexts: {
    flex: 1,
    gap: 5,
  },
  duration: {
    color: TeumtaHybrid.ink,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 40,
  },
  durationUnit: {
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: TeumtaHybrid.ink,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 28,
  },
  description: {
    color: TeumtaHybrid.muted,
    fontSize: 13,
    lineHeight: 21,
  },
  photo: {
    width: 76,
    height: 90,
    borderRadius: 4,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    color: TeumtaHybrid.navy,
    backgroundColor: TeumtaHybrid.navySoft,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 12,
    lineHeight: 18,
  },
  stopRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'stretch',
  },
  stopRail: {
    width: 12,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: TeumtaHybrid.navy,
    marginTop: 7,
  },
  destinationDot: {
    backgroundColor: TeumtaHybrid.ink,
  },
  connector: {
    width: 1,
    backgroundColor: TeumtaHybrid.line,
    flex: 1,
    marginTop: 4,
    marginBottom: -3,
  },
  stopName: {
    flex: 1,
    color: TeumtaHybrid.ink,
    fontSize: 14,
    lineHeight: 22,
    paddingBottom: 12,
  },
  stats: {
    flexDirection: 'row',
    gap: 12,
  },
  stat: {
    flex: 1,
    gap: 5,
  },
  statValue: {
    color: TeumtaHybrid.ink,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 23,
  },
  statLabel: {
    color: TeumtaHybrid.muted,
    fontSize: 12,
    lineHeight: 18,
  },
});
