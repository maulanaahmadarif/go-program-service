import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

export const REDEMPTION_TIMEZONE = process.env.REDEMPTION_TIMEZONE || 'Asia/Jakarta';

// Dates are inclusive in the configured timezone.
const REDEMPTION_DATES = [
  { start: '2026-11-27', end: '2026-11-30' },
  { start: '2026-12-28', end: '2026-12-31' },
] as const;

export type RedemptionWindow = {
  start_at: string;
  end_at: string;
};

export type RedemptionWindowInfo = RedemptionWindow & {
  is_open: boolean;
  timezone: string;
  windows: RedemptionWindow[];
};

/** Single source of truth for redemption scheduling (Asia/Jakarta by default). */
export function getRedemptionWindowInfo(at: Date = new Date()): RedemptionWindowInfo {
  const tz = REDEMPTION_TIMEZONE;
  const now = dayjs(at).tz(tz);
  const windows = REDEMPTION_DATES.map(({ start, end }) => ({
    start: dayjs.tz(start, tz).startOf('day'),
    end: dayjs.tz(end, tz).endOf('day'),
  }));

  const active = windows.find((window) => !now.isBefore(window.start) && !now.isAfter(window.end));
  const currentOrNext = active ?? windows.find((window) => now.isBefore(window.start)) ?? windows[windows.length - 1];

  return {
    is_open: Boolean(active),
    start_at: currentOrNext.start.format('YYYY-MM-DDTHH:mm:ssZ'),
    end_at: currentOrNext.end.format('YYYY-MM-DDTHH:mm:ssZ'),
    timezone: tz,
    windows: windows.map((window) => ({
      start_at: window.start.format('YYYY-MM-DDTHH:mm:ssZ'),
      end_at: window.end.format('YYYY-MM-DDTHH:mm:ssZ'),
    })),
  };
}

export function isRedemptionWindowOpen(at?: Date): boolean {
  return getRedemptionWindowInfo(at).is_open;
}
