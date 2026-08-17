import { Transaction } from 'sequelize';

import { sequelize } from '../db';
import { Campaign } from '../../models/Campaign';
import { User } from '../../models/User';

export type PointDelta = {
  earned?: number;
  remaining?: number;
  spent?: number;
};

function asInt(value: number | undefined): number {
  if (value == null) return 0;
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) {
    throw new Error('Invalid point amount');
  }
  return parsed;
}

export async function applyUserPointDelta(
  userId: number,
  delta: PointDelta,
  options: { transaction: Transaction; at?: Date }
): Promise<Campaign> {
  const earnedDelta = asInt(delta.earned);
  const remainingDelta = asInt(delta.remaining);
  const spentDelta = asInt(delta.spent);
  const campaign = await Campaign.resolveAt(options.at ?? new Date(), options.transaction);

  if (earnedDelta === 0 && remainingDelta === 0 && spentDelta === 0) {
    return campaign;
  }

  const userUpdates: Record<string, unknown> = {};
  if (remainingDelta !== 0) {
    userUpdates.total_points = sequelize.literal(`GREATEST(0, total_points + ${remainingDelta})`);
  }
  if (earnedDelta !== 0) {
    userUpdates.accomplishment_total_points = sequelize.literal(
      `GREATEST(0, accomplishment_total_points + ${earnedDelta})`
    );
    userUpdates.lifetime_total_points = sequelize.literal(
      `GREATEST(0, lifetime_total_points + ${earnedDelta})`
    );
  }

  if (Object.keys(userUpdates).length > 0) {
    await User.update(userUpdates as any, {
      where: { user_id: userId },
      transaction: options.transaction,
    });
  }

  await sequelize.query(
    `INSERT INTO user_phase_points
      (user_id, campaign_id, earned_points, remaining_points, spent_points, created_at, updated_at)
     VALUES
      (:userId, :campaignId, :earned, :remaining, :spent, NOW(), NOW())
     ON CONFLICT (user_id, campaign_id)
     DO UPDATE SET
       earned_points = user_phase_points.earned_points + EXCLUDED.earned_points,
       remaining_points = GREATEST(0, user_phase_points.remaining_points + EXCLUDED.remaining_points),
       spent_points = GREATEST(0, user_phase_points.spent_points + EXCLUDED.spent_points),
       updated_at = NOW()`,
    {
      replacements: {
        userId,
        campaignId: campaign.campaign_id,
        earned: earnedDelta,
        remaining: remainingDelta,
        spent: spentDelta,
      },
      transaction: options.transaction,
    }
  );

  return campaign;
}

export async function awardPoints(
  userId: number,
  points: number,
  options: { transaction: Transaction; at?: Date }
): Promise<Campaign> {
  return applyUserPointDelta(userId, { earned: points, remaining: points }, options);
}

export async function spendPoints(
  userId: number,
  points: number,
  options: { transaction: Transaction; at?: Date }
): Promise<Campaign> {
  return applyUserPointDelta(userId, { remaining: -points, spent: points }, options);
}

export async function restoreSpentPoints(
  userId: number,
  points: number,
  options: { transaction: Transaction; at?: Date }
): Promise<Campaign> {
  return applyUserPointDelta(userId, { remaining: points, spent: -points }, options);
}
