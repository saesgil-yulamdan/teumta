import { describe, expect, it } from 'vitest';

import { evaluateOperatingStatus } from './operating-status';

const MONDAY_NOON_KST = new Date('2026-09-07T03:00:00.000Z');

describe('evaluateOperatingStatus', () => {
  it('명확한 매주 휴무일만 휴무로 판정한다', () => {
    expect(
      evaluateOperatingStatus(
        { openHours: '10:00 ~ 20:00', restDays: '매주 월요일' },
        MONDAY_NOON_KST,
      ).state,
    ).toBe('closed');
  });

  it('명시된 브레이크타임 안이면 경고한다', () => {
    expect(
      evaluateOperatingStatus(
        { openHours: '10:00~22:00 (브레이크타임 11:30~13:30)', restDays: '연중무휴' },
        MONDAY_NOON_KST,
      ).state,
    ).toBe('break');
  });

  it('단순 운영시간 밖이면 닫힘으로 판정한다', () => {
    expect(
      evaluateOperatingStatus(
        { openHours: '13:00 ~ 20:00', restDays: null },
        MONDAY_NOON_KST,
      ).state,
    ).toBe('closed');
  });

  it('요일별 복합 문구와 미제공 값은 임의 판정하지 않는다', () => {
    expect(
      evaluateOperatingStatus(
        { openHours: '월요일 10:00~18:00 / 화요일 12:00~20:00', restDays: null },
        MONDAY_NOON_KST,
      ).state,
    ).toBe('unknown');
    expect(
      evaluateOperatingStatus(
        { openHours: '10:00~18:00', restDays: '매월 첫째·셋째 월요일' },
        MONDAY_NOON_KST,
      ).state,
    ).toBe('unknown');
    expect(
      evaluateOperatingStatus(
        { openHours: '월~금 10:00~18:00', restDays: null },
        MONDAY_NOON_KST,
      ).state,
    ).toBe('unknown');
    expect(evaluateOperatingStatus({ openHours: null, restDays: null }).state).toBe('unknown');
  });
});
