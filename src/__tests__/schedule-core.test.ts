import { describe, it, expect } from 'vitest';
import {
  parseHhMm, dueSchedules, minutesUntilNext, scheduleCommand, type LocalSchedule,
} from '../schedules/schedule-core.js';

const base: LocalSchedule = {
  id: 's1', deviceId: 'feeder-01', deviceType: 'feeder', time: '08:00', amount: 40, enabled: true,
};

describe('parseHhMm', () => {
  it('parses valid, rejects invalid', () => {
    expect(parseHhMm('08:00')).toBe(480);
    expect(parseHhMm('23:59')).toBe(1439);
    expect(parseHhMm('24:00')).toBeNull();
    expect(parseHhMm('8:00')).toBeNull();
    expect(parseHhMm('0800')).toBeNull();
  });
});

describe('dueSchedules', () => {
  const at = (hh: number, mm: number) => new Date(2026, 0, 5, hh, mm, 0); // Mon 2026-01-05

  it('fires within the window, not before, not long after', () => {
    expect(dueSchedules([base], at(7, 59))).toHaveLength(0);
    expect(dueSchedules([base], at(8, 0))).toHaveLength(1);
    expect(dueSchedules([base], at(8, 4))).toHaveLength(1);
    expect(dueSchedules([base], at(8, 6))).toHaveLength(0);
  });

  it('respects enabled + daysOfWeek', () => {
    expect(dueSchedules([{ ...base, enabled: false }], at(8, 0))).toHaveLength(0);
    expect(dueSchedules([{ ...base, daysOfWeek: [1] }], at(8, 0))).toHaveLength(1); // Monday
    expect(dueSchedules([{ ...base, daysOfWeek: [0, 6] }], at(8, 0))).toHaveLength(0);
  });

  it('de-dups against lastFiredAt', () => {
    const firedNow = { ...base, lastFiredAt: at(8, 0).getTime() };
    expect(dueSchedules([firedNow], at(8, 3))).toHaveLength(0);
    const firedYesterday = { ...base, lastFiredAt: at(8, 0).getTime() - 86_400_000 };
    expect(dueSchedules([firedYesterday], at(8, 2))).toHaveLength(1);
  });
});

describe('minutesUntilNext', () => {
  it('wraps to tomorrow', () => {
    const s = [{ ...base, time: '08:00' }, { ...base, id: 's2', time: '20:00' }];
    expect(minutesUntilNext(s, new Date(2026, 0, 5, 7, 0))).toBe(60);
    expect(minutesUntilNext(s, new Date(2026, 0, 5, 21, 0))).toBe(11 * 60); // to 08:00
  });
});

describe('scheduleCommand', () => {
  it('maps device type to the right command', () => {
    expect(scheduleCommand(base)).toEqual({ command: 'feed', params: { amount: 40 } });
    expect(scheduleCommand({ ...base, deviceType: 'water', amount: 6 }))
      .toEqual({ command: 'dispense', params: { seconds: 6 } });
  });
});
