type QuantityTier = '11-50' | '51-300' | '301-500' | '>500';

function getQuantityTier(productQuantity: number): QuantityTier | null {
  if (productQuantity < 11) return null;
  if (productQuantity <= 50) return '11-50';
  if (productQuantity <= 300) return '51-300';
  if (productQuantity <= 500) return '301-500';
  return '>500';
}

/** Fill bonus points per form type and quantity tier. Qty 1-10 always scores 0. */
const BONUS_POINTS_BY_FORM_TYPE: Record<number, Record<QuantityTier, number>> = {
  1: { '11-50': 10, '51-300': 20, '301-500': 40, '>500': 100 },
  4: { '11-50': 20, '51-300': 50, '301-500': 100, '>500': 150 },
  5: { '11-50': 50, '51-300': 100, '301-500': 500, '>500': 1250 },
  6: { '11-50': 100, '51-300': 200, '301-500': 600, '>500': 1500 },
  7: { '11-50': 5, '51-300': 10, '301-500': 20, '>500': 50 },
  8: { '11-50': 10, '51-300': 25, '301-500': 50, '>500': 75 },
  9: { '11-50': 25, '51-300': 50, '301-500': 300, '>500': 500 },
  10: { '11-50': 40, '51-300': 100, '301-500': 400, '>500': 500 },
};

/** Fill Aura Edition / TKDN multipliers per quantity tier. */
const AURA_MULTIPLIER_BY_TIER: Record<QuantityTier, number> = {
  '11-50': 3,
  '51-300': 5,
  '301-500': 7,
  '>500': 8,
};

export const calculateBonusPoints = (
  formTypeId: number,
  product_quantity: number,
  isAuraEdition: boolean = false
): number => {
  const tier = getQuantityTier(product_quantity);
  if (!tier) return 0;

  const pointsByTier = BONUS_POINTS_BY_FORM_TYPE[formTypeId];
  if (!pointsByTier) return 0;

  let bonus_points = pointsByTier[tier] ?? 0;

  if (isAuraEdition) {
    bonus_points *= AURA_MULTIPLIER_BY_TIER[tier] ?? 1;
  }

  return bonus_points;
};

/** Points awarded to the referred user when they submit their first form. */
export const REFERRAL_FIRST_SUBMISSION_BONUS = 400;

/** Points awarded to the referrer when a referred user submits their first form. */
export const REFERRAL_REFERRER_BONUS = 2000;

export const getReferralBonusPointsFromSubmissionCount = (referredUsersWithForms: number): number =>
  Math.max(0, referredUsersWithForms) * REFERRAL_REFERRER_BONUS;

/**
 * Calculate referral milestone bonus points based on the number of referred users with form submissions
 * @param referralCount - Current count of referred users who have submitted forms
 * @returns Object containing bonus points and milestone achieved
 */
export const calculateReferralMilestoneBonus = (referralCount: number): { bonusPoints: number; milestone: number | null } => {
  // Define milestone thresholds and their corresponding bonus points
  const milestones = [
    { threshold: 8, bonus: 1500 },
    { threshold: 16, bonus: 3500 },
    { threshold: 21, bonus: 5000 },
  ];

  // Find the milestone that was just reached
  for (const milestone of milestones) {
    if (referralCount === milestone.threshold) {
      return {
        bonusPoints: milestone.bonus,
        milestone: milestone.threshold
      };
    }
  }

  return {
    bonusPoints: 0,
    milestone: null
  };
}; 