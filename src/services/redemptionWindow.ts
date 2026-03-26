import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

export const REDEMPTION_TIMEZONE = process.env.REDEMPTION_TIMEZONE || 'Asia/Jakarta';

/** Inclusive window: 2026-03-27 00:00 through end of 2026-03-31 (WIB), overridable via env */
function getWindowBounds() {
  const tz = REDEMPTION_TIMEZONE;

  const start = process.env.REDEMPTION_WINDOW_START
    ? dayjs.tz(process.env.REDEMPTION_WINDOW_START, tz)
    : dayjs.tz('2026-03-27 00:00:00', tz);

  const end = process.env.REDEMPTION_WINDOW_END
    ? dayjs.tz(process.env.REDEMPTION_WINDOW_END, tz)
    : dayjs.tz('2026-03-31', tz).endOf('day');

  return { start, end, tz };
}

export type RedemptionWindowInfo = {
  is_open: boolean;
  start_at: string;
  end_at: string;
  timezone: string;
};

/**
 * Single source of truth for redemption scheduling (Asia/Jakarta by default).
 */
export function getRedemptionWindowInfo(): RedemptionWindowInfo {
  const { start, end, tz } = getWindowBounds();
  const now = dayjs().tz(tz);

  const is_open = !now.isBefore(start) && !now.isAfter(end);

  return {
    is_open,
    start_at: start.format('YYYY-MM-DDTHH:mm:ssZ'),
    end_at: end.format('YYYY-MM-DDTHH:mm:ssZ'),
    timezone: tz,
  };
}

export function isRedemptionWindowOpen(): boolean {
  return getRedemptionWindowInfo().is_open;
}
