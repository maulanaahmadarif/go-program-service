const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PHASE_7_SCORE_START,
  PHASE_8_SCORE_START,
  PHASE_8_SCORE_END_EXCLUSIVE,
} = require('../dist/src/constants/phaseScoreWindows');

test('Phase 7 includes 16 August and Phase 8 begins at Jakarta midnight on 17 August', () => {
  assert.equal(PHASE_7_SCORE_START.toISOString(), '2026-05-14T17:00:00.000Z');
  assert.equal(PHASE_8_SCORE_START.toISOString(), '2026-08-16T17:00:00.000Z');
  assert.ok(new Date('2026-08-16T23:59:59.999+07:00') < PHASE_8_SCORE_START);
  assert.equal(new Date('2026-08-17T00:00:00+07:00').getTime(), PHASE_8_SCORE_START.getTime());
});

test('Phase 8 includes 1 October and excludes 2 October onward', () => {
  assert.equal(PHASE_8_SCORE_END_EXCLUSIVE.toISOString(), '2026-10-01T17:00:00.000Z');
  assert.ok(new Date('2026-10-01T23:59:59.999+07:00') < PHASE_8_SCORE_END_EXCLUSIVE);
  assert.equal(new Date('2026-10-02T00:00:00+07:00').getTime(), PHASE_8_SCORE_END_EXCLUSIVE.getTime());
});
