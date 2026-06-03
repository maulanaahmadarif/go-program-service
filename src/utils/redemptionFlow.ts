import { Op, WhereOptions } from 'sequelize';

/** Matches `fortune-wheel` claim payload */
export const REDEMPTION_NOTE_SPIN_WHEEL = 'Wheel Spin Voucher';

/** Matches `redeemReferralPoint` */
export const REDEMPTION_NOTE_REFERRAL = 'REFERRAL';

/** Matches `BLITZ_KICK_OFF_NOTE` in user controller */
export const REDEMPTION_NOTE_BLITZ = 'Blitz Kick-Off';

/** Query param values for admin redeem list / download (`?flow=`) */
export const REDEMPTION_FLOW_FILTER_VALUES = [
  'spin_wheel',
  'referral',
  'coin',
  'points',
] as const;

export type RedemptionFlowFilter = (typeof REDEMPTION_FLOW_FILTER_VALUES)[number];

export function isValidRedemptionFlowFilter(value: string): value is RedemptionFlowFilter {
  return (REDEMPTION_FLOW_FILTER_VALUES as readonly string[]).includes(value);
}

/** Sequelize `where` fragment aligned with `getRedemptionFlowLabel` priority. */
export function redemptionFlowWhereClause(flow: RedemptionFlowFilter): WhereOptions {
  const fixedNoteFlows = [
    REDEMPTION_NOTE_SPIN_WHEEL,
    REDEMPTION_NOTE_REFERRAL,
    REDEMPTION_NOTE_BLITZ,
  ];

  switch (flow) {
    case 'spin_wheel':
      return { notes: REDEMPTION_NOTE_SPIN_WHEEL };
    case 'referral':
      return { notes: REDEMPTION_NOTE_REFERRAL };
    case 'coin':
      return { coins_spent: { [Op.gt]: 0 } };
    case 'points':
      return {
        [Op.and]: [
          { points_spent: { [Op.gt]: 0 } },
          {
            [Op.or]: [{ coins_spent: { [Op.lte]: 0 } }, { coins_spent: null }],
          },
          {
            [Op.or]: [
              { notes: null },
              { notes: { [Op.notIn]: fixedNoteFlows } },
            ],
          },
        ],
      };
    default:
      return {};
  }
}

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
