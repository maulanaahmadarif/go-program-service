import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

import { REDEMPTION_TIMEZONE } from './redemptionWindow';

dayjs.extend(utc);
dayjs.extend(timezone);

/** End of last eligible day for daily check-in and coin redemption (inclusive), in REDEMPTION_TIMEZONE. Override with `DAILY_CHECKIN_PROGRAM_END` (e.g. `2026-06-07`). */
function dailyCheckinProgramEnd() {
  const tz = REDEMPTION_TIMEZONE;
  if (process.env.DAILY_CHECKIN_PROGRAM_END) {
    return dayjs.tz(process.env.DAILY_CHECKIN_PROGRAM_END, tz).endOf('day');
  }
  return dayjs.tz('2026-06-07', tz).endOf('day');
}

export function isDailyCheckinProgramOpen(now: Date = new Date()): boolean {
  const end = dailyCheckinProgramEnd();
  const nowTz = dayjs(now).tz(REDEMPTION_TIMEZONE);
  return !nowTz.isAfter(end);
}

export function getDailyCheckinProgramEndIso(): string {
  return dailyCheckinProgramEnd().toISOString();
}
