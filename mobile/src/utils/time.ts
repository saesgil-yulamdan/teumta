/** 현재 시각에서 offsetMinutes 뒤의 시각을 "HH:MM" 라벨로 만든다. */
export function timeLabelAfter(offsetMinutes: number) {
  return timeLabelAt(Date.now() + offsetMinutes * 60 * 1000);
}

/** 타임스탬프를 "HH:MM" 라벨로 만든다. */
export function timeLabelAt(timestamp: number) {
  const at = new Date(timestamp);
  const hours = String(at.getHours()).padStart(2, '0');
  const minutes = String(at.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/** ISO 시각 → "M월 D일". 값이 이상하면 빈 문자열. */
export function dateLabel(iso: string) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return '';
  }
  return `${at.getMonth() + 1}월 ${at.getDate()}일`;
}
