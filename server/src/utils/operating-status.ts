const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const TIME_RANGE = /(\d{1,2}):(\d{2})\s*[~～\-–]\s*(\d{1,2}):(\d{2})/g;
const BREAK_RANGE =
  /(?:브레이크\s*타임|휴게\s*시간|쉬는\s*시간)[^0-9]{0,20}(\d{1,2}):(\d{2})\s*[~～\-–]\s*(\d{1,2}):(\d{2})/;

export type OperatingStatus = {
  state: 'open' | 'closed' | 'break' | 'unknown';
  label: string;
};

function kstParts(now: Date) {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  return {
    weekday: WEEKDAYS[shifted.getUTCDay()],
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

function minuteValue(hour: string, minute: string): number | null {
  const hours = Number(hour);
  const minutes = Number(minute);
  return hours >= 0 && hours <= 24 && minutes >= 0 && minutes < 60
    ? hours * 60 + minutes
    : null;
}

function includesMinute(now: number, start: number, end: number): boolean {
  return end > start ? now >= start && now < end : now >= start || now < end;
}

/** TourAPI 자유문자 중 명확하게 판정할 수 있는 운영시간·휴무일만 해석한다. */
export function evaluateOperatingStatus(
  input: { openHours?: string | null; restDays?: string | null },
  now: Date = new Date(),
): OperatingStatus {
  const { weekday, minutes } = kstParts(now);
  const restDays = input.restDays?.replace(/\s+/g, ' ').trim() ?? '';
  const weekdayStem = weekday.replace('요일', '');
  const clearlyAlwaysOpen = /연중\s*무휴|휴무\s*(?:일)?\s*없음/.test(restDays);
  const weeklyClosed = new RegExp(`매주\\s*${weekdayStem}(?:요일)?`).test(restDays);
  if (!clearlyAlwaysOpen && weeklyClosed) {
    return { state: 'closed', label: '예상 방문 시각에 휴무로 안내돼 있어요' };
  }

  const openHours = input.openHours?.replace(/\s+/g, ' ').trim() ?? '';
  if (!openHours) {
    return { state: 'unknown', label: '운영정보 확인 필요' };
  }
  if (/24\s*시간/.test(openHours)) {
    return restDays && !clearlyAlwaysOpen
      ? { state: 'unknown', label: '운영정보 확인 필요' }
      : { state: 'open', label: '예상 방문 시각에 운영 중이에요' };
  }

  const breakMatch = openHours.match(BREAK_RANGE);
  if (breakMatch) {
    const start = minuteValue(breakMatch[1], breakMatch[2]);
    const end = minuteValue(breakMatch[3], breakMatch[4]);
    if (start !== null && end !== null && includesMinute(minutes, start, end)) {
      return { state: 'break', label: '예상 방문 시각이 브레이크타임이에요' };
    }
  }

  const withoutBreak = breakMatch ? openHours.replace(breakMatch[0], '') : openHours;
  const ranges = [...withoutBreak.matchAll(TIME_RANGE)];
  const hasComplexWeekdaySchedule =
    WEEKDAYS.some((day) => withoutBreak.includes(day)) ||
    /[월화수목금토일]\s*(?:[~～\-–,/]|요일)/.test(withoutBreak);
  if (ranges.length !== 1 || hasComplexWeekdaySchedule) {
    return { state: 'unknown', label: '운영정보 확인 필요' };
  }

  const start = minuteValue(ranges[0][1], ranges[0][2]);
  const end = minuteValue(ranges[0][3], ranges[0][4]);
  if (start === null || end === null) {
    return { state: 'unknown', label: '운영정보 확인 필요' };
  }
  if (!includesMinute(minutes, start, end)) {
    return { state: 'closed', label: '예상 방문 시각이 운영시간 밖이에요' };
  }
  return restDays && !clearlyAlwaysOpen
    ? { state: 'unknown', label: '운영정보 확인 필요' }
    : { state: 'open', label: '예상 방문 시각에 운영 중이에요' };
}
