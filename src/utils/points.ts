export const calculateBonusPoints = (formTypeId: number, product_quantity: number, isAuraEdition: boolean = false): number => {
  let bonus_points = 0;

  if (formTypeId === 1) {
    if (product_quantity >= 1 && product_quantity <= 50) {
      bonus_points = 10;
    } else if (product_quantity > 50 && product_quantity <= 300) {
      bonus_points = 20;
    } else if (product_quantity > 300) {
      bonus_points = 40;
    }
  } else if (formTypeId === 4) {
    if (product_quantity >= 1 && product_quantity <= 50) {
      bonus_points = 20;
    } else if (product_quantity > 50 && product_quantity <= 300) {
      bonus_points = 50;
    } else if (product_quantity > 300) {
      bonus_points = 100;
    }
  } else if (formTypeId === 5) {
    if (product_quantity >= 1 && product_quantity <= 50) {
      bonus_points = 50;
    } else if (product_quantity > 50 && product_quantity <= 300) {
      bonus_points = 100;
    } else if (product_quantity > 300) {
      bonus_points = 200;
    }
  } else if (formTypeId === 6) {
    if (product_quantity >= 1 && product_quantity <= 50) {
      bonus_points = 100;
    } else if (product_quantity > 50 && product_quantity <= 300) {
      bonus_points = 200;
    } else if (product_quantity > 300) {
      bonus_points = 400;
    }
  } else if (formTypeId === 7) {
    if (product_quantity >= 1 && product_quantity <= 50) {
      bonus_points = 5;
    } else if (product_quantity > 50 && product_quantity <= 300) {
      bonus_points = 10;
    } else if (product_quantity > 300) {
      bonus_points = 20;
    }
  } else if (formTypeId === 8) {
    if (product_quantity >= 1 && product_quantity <= 50) {
      bonus_points = 10;
    } else if (product_quantity > 50 && product_quantity <= 300) {
      bonus_points = 25;
    } else if (product_quantity > 300) {
      bonus_points = 50;
    }
  } else if (formTypeId === 9) {
    if (product_quantity >= 1 && product_quantity <= 50) {
      bonus_points = 25;
    } else if (product_quantity > 50 && product_quantity <= 300) {
      bonus_points = 50;
    } else if (product_quantity > 300) {
      bonus_points = 100;
    }
  } else if (formTypeId === 10) {
    if (product_quantity >= 1 && product_quantity <= 50) {
      bonus_points = 50;
    } else if (product_quantity > 50 && product_quantity <= 300) {
      bonus_points = 100;
    } else if (product_quantity > 300) {
      bonus_points = 200;
    }
  }

  // Apply Aura Edition or TKDN Product multiplier if applicable
  if (isAuraEdition) {
    let multiplier = 5; // Default multiplier for 1-50 quantity
    if (product_quantity > 50 && product_quantity <= 300) {
      multiplier = 7;
    } else if (product_quantity > 300) {
      multiplier = 10;
    }
    bonus_points *= multiplier;
  }

  return bonus_points;
};

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