import { Request, Response } from 'express';
import { Op } from 'sequelize';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

import { DailyCheckin } from '../../models/DailyCheckin';
import { User } from '../../models/User';
import { CoinTransaction } from '../../models/CoinTransaction';
import { UserAction } from '../../models/UserAction';
import { sequelize } from '../db';
import { REDEMPTION_TIMEZONE } from '../services/redemptionWindow';
import { getDailyCheckinProgramEndIso, isDailyCheckinProgramOpen } from '../services/dailyCheckinWindow';
import { getCheckInCoinsForDay, listDailyCheckinRewardTiers, normalizeMilestoneBonusClaimedDays, milestoneBonusEarnedTodayWhere } from '../services/dailyCheckinRewards';

dayjs.extend(utc);
dayjs.extend(timezone);

function resolveUserId(req: Request): number | null {
  const u = (req as any).user;
  const id = u?.userId ?? u?.user_id;
  if (id == null || Number.isNaN(Number(id))) return null;
  return Number(id);
}

function todayDateKey(): string {
  return dayjs().tz(REDEMPTION_TIMEZONE).format('YYYY-MM-DD');
}

function dateKeyInTz(input: Date | string): string {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input;
  }
  return dayjs(input).tz(REDEMPTION_TIMEZONE).format('YYYY-MM-DD');
}

export const getCheckinStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const user_id = resolveUserId(req);
    if (!user_id) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    let checkin = await DailyCheckin.findOne({ where: { user_id } });
    const user = await User.findByPk(user_id);

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const todayStr = todayDateKey();

    let can_checkin = true;
    let next_streak = 1;
    let diffDays = 0;

    if (checkin) {
      const lastStr = dateKeyInTz(checkin.last_checkin_date);
      diffDays = dayjs(todayStr).diff(dayjs(lastStr), 'day');

      if (diffDays === 0) {
        can_checkin = false;
        next_streak = checkin.current_streak < 5 ? checkin.current_streak + 1 : 1;
      } else if (diffDays === 1) {
        can_checkin = true;
        next_streak = checkin.current_streak < 5 ? checkin.current_streak + 1 : 1;
      } else {
        can_checkin = true;
        next_streak = 1;
      }
    }

    const daily_checkin_program_active = isDailyCheckinProgramOpen();
    if (!daily_checkin_program_active) {
      can_checkin = false;
    }

    let milestone_bonus_claimed_days = normalizeMilestoneBonusClaimedDays(checkin?.milestone_bonus_claimed_days);

    /**
     * If the user has not checked in yet today but the next check-in will start a new milestone cycle
     * (missed day(s) → day 1, or day 5 → day 1), clear stale `milestone_bonus_claimed_days` so the UI
     * does not show "Claimed" from the previous cycle before `performCheckin` runs.
     */
    if (checkin && can_checkin && diffDays > 0) {
      const carryForNext = diffDays === 1 ? checkin.current_streak : 0;
      const nextAfterCheckin = carryForNext < 5 ? carryForNext + 1 : 1;
      const willResetMilestonesOnNextCheckin =
        nextAfterCheckin === 1 && (carryForNext === 0 || carryForNext === 5);
      if (willResetMilestonesOnNextCheckin && milestone_bonus_claimed_days.length > 0) {
        checkin.milestone_bonus_claimed_days = [];
        await checkin.save();
        milestone_bonus_claimed_days = [];
      }
    }

    const startOfToday = dayjs().tz(REDEMPTION_TIMEZONE).startOf('day').toDate();
    const endOfToday = dayjs().tz(REDEMPTION_TIMEZONE).endOf('day').toDate();

    const lastCheckinStr = checkin ? dateKeyInTz(checkin.last_checkin_date) : '';
    const checkedInToday = Boolean(checkin && lastCheckinStr === todayStr);
    const claimedCurrentStreakSlot =
      checkedInToday && checkin && milestone_bonus_claimed_days.includes(checkin.current_streak);

    let milestoneBonusForCurrentStreakToday = 0;
    if (checkedInToday && checkin && checkin.current_streak >= 1 && checkin.current_streak <= 5) {
      const bonusWhere = milestoneBonusEarnedTodayWhere(
        user_id,
        checkin.current_streak,
        startOfToday,
        endOfToday,
        checkin.checkin_session_at ?? null
      );
      if (bonusWhere) {
        milestoneBonusForCurrentStreakToday = await CoinTransaction.count({ where: bonusWhere });
      }
    }

    /**
     * True when today’s **current streak-day** milestone bonus was claimed (persisted array or
     * legacy coin row for that same `(Day N)` today). Not true just because another day’s bonus
     * was earned earlier the same calendar day.
     */
    const milestone_bonus_claimed_today = Boolean(
      checkedInToday &&
        checkin &&
        (claimedCurrentStreakSlot || milestoneBonusForCurrentStreakToday > 0)
    );

    res.status(200).json({
      status: 'success',
      data: {
        can_checkin,
        current_streak: checkin ? checkin.current_streak : 0,
        next_streak,
        total_coins: user.total_coins || 0,
        last_checkin_date: checkin ? checkin.last_checkin_date : null,
        milestone_bonus_claimed_today,
        milestone_bonus_claimed_days,
        daily_checkin_program_active,
        daily_checkin_program_ends_at: getDailyCheckinProgramEndIso(),
        daily_checkin_timezone: REDEMPTION_TIMEZONE,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const performCheckin = async (req: Request, res: Response): Promise<void> => {
  const transaction = await sequelize.transaction();

  try {
    const user_id = resolveUserId(req);
    if (!user_id) {
      await transaction.rollback();
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const user = await User.findByPk(user_id, { transaction, lock: transaction.LOCK.UPDATE });

    if (!user) {
      await transaction.rollback();
      res.status(404).json({ message: 'User not found' });
      return;
    }

    let checkin = await DailyCheckin.findOne({
      where: { user_id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!isDailyCheckinProgramOpen()) {
      await transaction.rollback();
      res.status(400).json({ message: 'Daily check-in program has ended' });
      return;
    }

    const todayStr = todayDateKey();

    let carryStreak = 0;

    if (checkin) {
      const lastStr = dateKeyInTz(checkin.last_checkin_date);
      const diffDays = dayjs(todayStr).diff(dayjs(lastStr), 'day');

      if (diffDays === 0) {
        await transaction.rollback();
        res.status(400).json({ message: 'Already checked in today' });
        return;
      }
      if (diffDays === 1) {
        carryStreak = checkin.current_streak;
      } else {
        carryStreak = 0;
      }
    }

    const current_streak = carryStreak < 5 ? carryStreak + 1 : 1;
    const resetMilestoneClaims = current_streak === 1 && (carryStreak === 0 || carryStreak === 5);
    const coinsToReward = await getCheckInCoinsForDay(current_streak);

    const sessionAt = new Date();

    if (!checkin) {
      checkin = await DailyCheckin.create(
        {
          user_id,
          last_checkin_date: todayStr,
          current_streak,
          milestone_bonus_claimed_days: [],
          checkin_session_at: sessionAt,
        },
        { transaction }
      );
    } else {
      checkin.last_checkin_date = todayStr;
      checkin.current_streak = current_streak;
      checkin.checkin_session_at = sessionAt;
      if (resetMilestoneClaims) {
        checkin.milestone_bonus_claimed_days = [];
      }
      await checkin.save({ transaction });
    }

    user.total_coins = (user.total_coins || 0) + coinsToReward;
    user.lifetime_total_coins = (user.lifetime_total_coins || 0) + coinsToReward;
    await user.save({ transaction });

    const coinTx = await CoinTransaction.create(
      {
        user_id,
        coins: coinsToReward,
        transaction_type: 'earn',
        description: `Day ${current_streak} Check-In Reward`,
      },
      { transaction }
    );

    await UserAction.create(
      {
        user_id,
        entity_type: 'COIN',
        action_type: 'CHECKIN_REWARD',
        coin_transaction_id: coinTx.transaction_id,
        note: `Earned ${coinsToReward} coins — Day ${current_streak} check-in`,
      },
      { transaction }
    );

    await transaction.commit();

    res.status(200).json({
      status: 'success',
      data: {
        current_streak,
        coins_earned: coinsToReward,
        total_coins: user.total_coins,
      },
    });
  } catch (error: any) {
    await transaction.rollback();
    res.status(500).json({ message: error.message });
  }
};

export const getDailyCheckinRewards = async (_req: Request, res: Response): Promise<void> => {
  try {
    const tiers = await listDailyCheckinRewardTiers();
    res.status(200).json({
      status: 'success',
      data: tiers,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
