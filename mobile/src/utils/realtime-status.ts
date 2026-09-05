const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function toKstParts(date: Date): DateParts {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** 원본 측정 시각을 짧고 명확한 KST 기준 문구로 만든다. */
export function realtimeBasisLabel(
  measuredAt: string | null,
  now: Date = new Date(),
): string {
  if (!measuredAt) {
    return '실시간 · 기준 시각 확인 불가';
  }

  const measured = new Date(measuredAt);
  if (Number.isNaN(measured.getTime())) {
    return '실시간 · 기준 시각 확인 불가';
  }

  const measuredParts = toKstParts(measured);
  const todayParts = toKstParts(now);
  const isToday =
    measuredParts.year === todayParts.year &&
    measuredParts.month === todayParts.month &&
    measuredParts.day === todayParts.day;
  const dateLabel = isToday
    ? '오늘'
    : `${measuredParts.month}월 ${measuredParts.day}일`;
  const timeLabel = `${String(measuredParts.hour).padStart(2, '0')}:${String(
    measuredParts.minute,
  ).padStart(2, '0')}`;

  return `실시간 · ${dateLabel} ${timeLabel} 기준`;
}
