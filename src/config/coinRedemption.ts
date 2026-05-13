/**
 * Coin redemption catalog: only these product_ids appear in the daily-checkin / coin redeem UI
 * and are accepted by POST /api/coin/redeem when the whitelist is non-empty.
 *
 * Override with env: COIN_REDEMPTION_PRODUCT_IDS="23,1,24"
 */
export const DEFAULT_COIN_REDEMPTION_PRODUCT_IDS = [28, 1, 22] as const;

export function getCoinRedemptionProductIds(): number[] {
  const raw = process.env.COIN_REDEMPTION_PRODUCT_IDS?.trim();
  if (!raw) return [...DEFAULT_COIN_REDEMPTION_PRODUCT_IDS];
  return raw
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);
}
