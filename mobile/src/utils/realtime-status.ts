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
    return '관측 시각 미제공';
  }

  const measured = new Date(measuredAt);
  if (Number.isNaN(measured.getTime())) {
    return '관측 시각 미제공';
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

  const basis = now.getTime() - measured.getTime() > 30 * 60_000 ? '이전 관측' : '최근 관측';
  return `${basis} · ${dateLabel} ${timeLabel} 기준`;
}

/** Timestamp freshness is explicit; fetchedAt is never used as an observation time. */
export function isFreshObservation(measuredAt: string | null, now = Date.now()) {
  const at = measuredAt ? Date.parse(measuredAt) : NaN;
  return Number.isFinite(at) && now - at <= 30 * 60_000 && now >= at;
}
