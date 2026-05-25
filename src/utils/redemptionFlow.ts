/** Matches `fortune-wheel` claim payload */
export const REDEMPTION_NOTE_SPIN_WHEEL = 'Wheel Spin Voucher';

/** Matches `redeemReferralPoint` */
export const REDEMPTION_NOTE_REFERRAL = 'REFERRAL';

/** Matches `BLITZ_KICK_OFF_NOTE` in user controller */
export const REDEMPTION_NOTE_BLITZ = 'Blitz Kick-Off';

/**
 * Human-readable source of a redemption row for admin reports.
 * Order matters: fixed `notes` markers first, then coin vs points balance.
 */
export function getRedemptionFlowLabel(args: {
  notes?: string | null;
  points_spent?: number | null;
  coins_spent?: number | null;
}): string {
  const notes = (args.notes ?? '').trim();
  const points = Number(args.points_spent ?? 0);
  const coins = Number(args.coins_spent ?? 0);

  if (notes === REDEMPTION_NOTE_SPIN_WHEEL) return 'Spin wheel';
  if (notes === REDEMPTION_NOTE_REFERRAL) return 'Referral';
  if (notes === REDEMPTION_NOTE_BLITZ) return 'Blitz Kick-Off';
  if (coins > 0) return 'Coin redemption';
  if (points > 0) return 'Points redemption';

  if (notes) return `Other (${notes})`;
  return 'Other';
}
