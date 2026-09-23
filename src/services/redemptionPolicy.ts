import { ProductStockFlowType } from './productStockAllocation';
import {
  REDEMPTION_NOTE_REFERRAL,
  REDEMPTION_NOTE_SPIN_WHEEL,
  REDEMPTION_NOTE_THREE_DAY_QUEST,
  REDEMPTION_NOTE_BLITZ,
} from '../utils/redemptionFlow';

export type RedemptionTargetStatus = 'approved' | 'rejected';

type PointRedemptionProduct = {
  is_active?: boolean;
  currency_type?: string | null;
  points_required?: number | null;
};

export const canTransitionRedemption = (
  currentStatus: string,
  _targetStatus: RedemptionTargetStatus
) => currentStatus === 'active';

export const getPointRedemptionEligibilityError = (
  product: PointRedemptionProduct
): string | null => {
  if (!product.is_active) return 'Product is not available for redemption';

  // Older product rows can have a null currency type; those historically belonged
  // to the points catalog, so keep them eligible for backwards compatibility.
  if (product.currency_type && !['point', 'both'].includes(product.currency_type)) {
    return 'Product is not available for points redemption';
  }

  if (!Number.isFinite(product.points_required) || Number(product.points_required) <= 0) {
    return 'Product does not have a valid points price';
  }

  return null;
};

export const getRedemptionStockFlowType = (
  notes?: string | null,
  coinsSpent = 0
): ProductStockFlowType => {
  if (coinsSpent > 0) return 'coin';
  if (notes === REDEMPTION_NOTE_SPIN_WHEEL) return 'spin_wheel';
  if (notes === REDEMPTION_NOTE_REFERRAL) return 'referral';
  if (notes === REDEMPTION_NOTE_THREE_DAY_QUEST) return 'three_day_quest';
  if (notes === REDEMPTION_NOTE_BLITZ) return 'signup';
  return 'redeem';
};
