const test = require('node:test');
const assert = require('node:assert/strict');

const { THINKBOOK_14X_QUOTATION_END_EXCLUSIVE } = require('../dist/src/constants/campaigns');

test('ThinkBook quotations include 20 December 2026 and stop at Jakarta midnight', () => {
  const end = THINKBOOK_14X_QUOTATION_END_EXCLUSIVE.getTime();

  assert.equal(THINKBOOK_14X_QUOTATION_END_EXCLUSIVE.toISOString(), '2026-12-20T17:00:00.000Z');
  assert.equal(new Date('2026-12-20T23:59:59.999+07:00').getTime() < end, true);
  assert.equal(new Date('2026-12-21T00:00:00+07:00').getTime() < end, false);
});
