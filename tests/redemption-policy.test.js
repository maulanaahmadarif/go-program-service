const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canTransitionRedemption,
  getPointRedemptionEligibilityError,
  getRedemptionStockFlowType,
} = require('../dist/src/services/redemptionPolicy');
const {
  REDEMPTION_NOTE_REFERRAL,
  REDEMPTION_NOTE_SPIN_WHEEL,
  REDEMPTION_NOTE_THREE_DAY_QUEST,
  REDEMPTION_NOTE_BLITZ,
} = require('../dist/src/utils/redemptionFlow');

test('only pending redemptions can move to a terminal state', () => {
  assert.equal(canTransitionRedemption('active', 'approved'), true);
  assert.equal(canTransitionRedemption('active', 'rejected'), true);
  assert.equal(canTransitionRedemption('approved', 'rejected'), false);
  assert.equal(canTransitionRedemption('rejected', 'approved'), false);
  assert.equal(canTransitionRedemption('rejected', 'rejected'), false);
});

test('points redemption accepts active point, both, and legacy products with a positive price', () => {
  for (const currency_type of ['point', 'both', null]) {
    assert.equal(
      getPointRedemptionEligibilityError({ is_active: true, currency_type, points_required: 100 }),
      null
    );
  }
});

test('points redemption rejects inactive, coin-only, free, and invalid products', () => {
  assert.match(
    getPointRedemptionEligibilityError({ is_active: false, currency_type: 'point', points_required: 100 }),
    /not available/
  );
  assert.match(
    getPointRedemptionEligibilityError({ is_active: true, currency_type: 'coin', points_required: 100 }),
    /points redemption/
  );
  assert.match(
    getPointRedemptionEligibilityError({ is_active: true, currency_type: 'point', points_required: 0 }),
    /valid points price/
  );
  assert.match(
    getPointRedemptionEligibilityError({ is_active: true, currency_type: 'point', points_required: undefined }),
    /valid points price/
  );
});

test('stock restoration selects the originating flow, with coin spend taking precedence', () => {
  assert.equal(getRedemptionStockFlowType(undefined, 10), 'coin');
  assert.equal(getRedemptionStockFlowType(REDEMPTION_NOTE_SPIN_WHEEL, 0), 'spin_wheel');
  assert.equal(getRedemptionStockFlowType(REDEMPTION_NOTE_REFERRAL, 0), 'referral');
  assert.equal(getRedemptionStockFlowType(REDEMPTION_NOTE_THREE_DAY_QUEST, 0), 'three_day_quest');
  assert.equal(getRedemptionStockFlowType(REDEMPTION_NOTE_BLITZ, 0), 'signup');
  assert.equal(getRedemptionStockFlowType(undefined, 0), 'redeem');
});
