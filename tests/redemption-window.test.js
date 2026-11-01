const test = require('node:test');
const assert = require('node:assert/strict');

const { getRedemptionWindowInfo } = require('../dist/src/services/redemptionWindow');

test('redemption opens on both inclusive Jakarta date ranges and closes between them', () => {
  const cases = [
    ['2026-11-26T16:59:59.999Z', false],
    ['2026-11-26T17:00:00.000Z', true],
    ['2026-11-30T16:59:59.999Z', true],
    ['2026-11-30T17:00:00.000Z', false],
    ['2026-12-27T16:59:59.999Z', false],
    ['2026-12-27T17:00:00.000Z', true],
    ['2026-12-31T16:59:59.999Z', true],
    ['2026-12-31T17:00:00.000Z', false],
  ];

  for (const [at, expected] of cases) {
    assert.equal(getRedemptionWindowInfo(new Date(at)).is_open, expected, at);
  }
});

test('status exposes both windows and selects the active or upcoming one', () => {
  const before = getRedemptionWindowInfo(new Date('2026-11-01T00:00:00Z'));
  const between = getRedemptionWindowInfo(new Date('2026-12-01T00:00:00Z'));
  const duringDecember = getRedemptionWindowInfo(new Date('2026-12-28T00:00:00Z'));

  assert.equal(before.timezone, 'Asia/Jakarta');
  assert.deepEqual(before.windows.map((window) => window.start_at), [
    '2026-11-27T00:00:00+07:00',
    '2026-12-28T00:00:00+07:00',
  ]);
  assert.equal(before.start_at, before.windows[0].start_at);
  assert.equal(between.start_at, before.windows[1].start_at);
  assert.equal(duringDecember.start_at, before.windows[1].start_at);
});
