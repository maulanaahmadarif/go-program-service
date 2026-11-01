const test = require('node:test');
const assert = require('node:assert/strict');

const { CAMPAIGN_SEED } = require('../dist/src/constants/campaigns');

test('Phase 7, 8, and 9 use the agreed Jakarta boundaries without overlap', () => {
  const windows = new Map(CAMPAIGN_SEED.map((campaign) => [campaign.phase, campaign]));
  const phase7 = windows.get(7);
  const phase8 = windows.get(8);
  const phase9 = windows.get(9);

  assert.equal(phase7.ends_at.toISOString(), '2026-08-16T17:00:00.000Z');
  assert.equal(phase8.starts_at.getTime(), phase7.ends_at.getTime());
  assert.equal(phase8.ends_at.toISOString(), '2026-10-01T17:00:00.000Z');
  assert.equal(phase9.starts_at.toISOString(), '2026-10-31T17:00:00.000Z');
  assert.equal(phase9.ends_at.toISOString(), '2026-12-31T17:00:00.000Z');

  assert.ok(new Date('2026-10-01T23:59:59.999+07:00') < phase8.ends_at);
  assert.ok(new Date('2026-10-02T00:00:00+07:00') < phase9.starts_at);
  assert.ok(new Date('2026-12-31T23:59:59.999+07:00') < phase9.ends_at);
  assert.equal(new Date('2027-01-01T00:00:00+07:00').getTime(), phase9.ends_at.getTime());
});
