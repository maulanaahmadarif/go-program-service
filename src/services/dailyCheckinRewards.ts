import { Op, type WhereOptions } from 'sequelize';

import { DailyCheckinRewardTier } from '../../models/DailyCheckinRewardTier';
import type { CoinTransactionAttributes } from '../../models/CoinTransaction';

/** Fallback when DB has no rows (pre-migration or empty seed). Matches UI defaults. */
export const DEFAULT_CHECK_IN_COINS = [5, 10, 10, 15, 20] as const;
export const DEFAULT_MILESTONE_BONUS_COINS = [50, 50, 50, 50, 100] as const;

export type RewardTierRow = {
  day_index: number;
  check_in_coins: number;
  milestone_bonus_coins: number;
};

export async function listDailyCheckinRewardTiers(): Promise<RewardTierRow[]> {
  const rows = await DailyCheckinRewardTier.findAll({
    order: [['day_index', 'ASC']],
  });

  if (rows.length >= 5) {
    return rows.map((r) => ({
      day_index: r.day_index,
      check_in_coins: r.check_in_coins,
      milestone_bonus_coins: r.milestone_bonus_coins,
    }));
  }

  return [0, 1, 2, 3, 4].map((i) => ({
    day_index: i + 1,
    check_in_coins: DEFAULT_CHECK_IN_COINS[i],
    milestone_bonus_coins: DEFAULT_MILESTONE_BONUS_COINS[i],
  }));
}

export async function getCheckInCoinsForDay(day1to5: number): Promise<number> {
  if (day1to5 < 1 || day1to5 > 5) return 0;
  const row = await DailyCheckinRewardTier.findOne({ where: { day_index: day1to5 } });
  if (row) return row.check_in_coins;
  return DEFAULT_CHECK_IN_COINS[day1to5 - 1];
}

export async function getMilestoneBonusCoinsForDay(day1to5: number): Promise<number> {
  if (day1to5 < 1 || day1to5 > 5) return 0;
  const row = await DailyCheckinRewardTier.findOne({ where: { day_index: day1to5 } });
  if (row) return row.milestone_bonus_coins;
  return DEFAULT_MILESTONE_BONUS_COINS[day1to5 - 1];
}

/** Normalize JSON column from DB into sorted unique streak-day indices 1–5. */
export function normalizeMilestoneBonusClaimedDays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 1 && d <= 5))].sort(
    (a, b) => a - b
  );
}

export function mergeMilestoneBonusClaimedDay(existing: unknown, day1to5: number): number[] {
  const base = normalizeMilestoneBonusClaimedDays(existing);
  if (day1to5 < 1 || day1to5 > 5) return base;
  if (base.includes(day1to5)) return base;
  return [...base, day1to5].sort((a, b) => a - b);
}

/** Coin rows for “milestone form bonus” earned today for a specific streak day (1–5). */
export function milestoneBonusEarnedTodayWhere(
  userId: number,
  streakDay1to5: number,
  startOfToday: Date,
  endOfToday: Date,
  /** If set (e.g. last check-in time), ignore bonus txs created before this moment on the same local day. */
  sessionLowerBound?: Date | null
): WhereOptions<CoinTransactionAttributes> | null {
  if (streakDay1to5 < 1 || streakDay1to5 > 5) return null;
  const lower =
    sessionLowerBound != null && sessionLowerBound.getTime() > startOfToday.getTime()
      ? sessionLowerBound
      : startOfToday;
  return {
    user_id: userId,
    transaction_type: 'earn' as const,
    createdAt: { [Op.between]: [lower, endOfToday] },
    [Op.and]: [
      { description: { [Op.like]: 'Daily Check-In Form Submission Bonus%' } },
      { description: { [Op.like]: `%(Day ${streakDay1to5})%` } },
    ],
  };
}
