/**
 * Pure schedule maths for the Pet Hub local runner. No I/O — unit tested.
 *
 * The hub is the *authority* for time-based feeding/dispensing on its LAN: it
 * fires device commands on the local wall-clock whether or not the cloud is up.
 */

export interface LocalSchedule {
  id: string;
  deviceId: string;
  deviceType: 'feeder' | 'water' | string;
  /** "HH:MM" 24h local */
  time: string;
  /** grams (feeder) or seconds (water) */
  amount: number;
  enabled: boolean;
  /** 0..6 Sun..Sat; empty = every day */
  daysOfWeek?: number[];
  /** epoch ms of the last time this schedule fired (persisted) */
  lastFiredAt?: number | null;
}

export function parseHhMm(s: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Schedules due to fire at `now`, given a `windowMinutes` tolerance (covers a
 * missed tick / clock jitter) and de-dup against `lastFiredAt` within the last
 * `dedupMinutes`.
 */
export function dueSchedules(
  schedules: LocalSchedule[],
  now: Date,
  windowMinutes = 5,
  dedupMinutes = 30
): LocalSchedule[] {
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const dow = now.getDay();
  const nowMs = now.getTime();
  const out: LocalSchedule[] = [];

  for (const s of schedules) {
    if (!s.enabled) continue;
    if (s.daysOfWeek && s.daysOfWeek.length > 0 && !s.daysOfWeek.includes(dow)) continue;
    const target = parseHhMm(s.time);
    if (target == null) continue;

    const delta = minutesNow - target;
    if (delta < 0 || delta > windowMinutes) continue;

    if (s.lastFiredAt && nowMs - s.lastFiredAt < dedupMinutes * 60_000) continue;
    out.push(s);
  }
  return out;
}

/** Minutes until the next enabled schedule (wraps to tomorrow). null if none. */
export function minutesUntilNext(schedules: LocalSchedule[], now: Date): number | null {
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  let best: number | null = null;
  for (const s of schedules) {
    if (!s.enabled) continue;
    const t = parseHhMm(s.time);
    if (t == null) continue;
    let diff = t - minutesNow;
    if (diff <= 0) diff += 24 * 60;
    if (best == null || diff < best) best = diff;
  }
  return best;
}

/** Command params for a schedule fire, per device type. */
export function scheduleCommand(s: LocalSchedule): { command: string; params: Record<string, number> } {
  if (s.deviceType === 'water') return { command: 'dispense', params: { seconds: s.amount } };
  return { command: 'feed', params: { amount: s.amount } };
}
