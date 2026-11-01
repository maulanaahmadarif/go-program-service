const test = require('node:test');
const assert = require('node:assert/strict');

const { calculateBonusPoints, hasMultiplierProduct } = require('../dist/src/utils/points');

const formData = (product) => [{ label: 'products', value: [product] }];

test('ThinkBook 14x qualifies only as a Notebook/Laptop product', () => {
  assert.equal(hasMultiplierProduct(formData({ productCategory: 'Notebook/Laptop', productType: 'ThinkBook 14x' })), true);
  assert.equal(hasMultiplierProduct(formData({ productCategory: 'Notebook/Laptop', productType: 'Other' })), false);
  assert.equal(hasMultiplierProduct(formData({ productCategory: 'PC/Desktop', productType: 'ThinkBook 14x' })), false);
  assert.equal(hasMultiplierProduct(formData({ productCategory: 'Aura Edition' })), true);
  assert.equal(hasMultiplierProduct(formData({ productCategory: 'TKDN Product' })), true);
});

test('ThinkBook multiplier applies to PO and Invoice for each user role', () => {
  const eligible = hasMultiplierProduct(formData({ productCategory: 'Notebook/Laptop', productType: 'ThinkBook 14x' }));

  assert.equal(calculateBonusPoints(5, 11, eligible, 'T2'), 150);
  assert.equal(calculateBonusPoints(6, 11, eligible, 'T2'), 300);
  assert.equal(calculateBonusPoints(9, 11, eligible, 'T1'), 75);
  assert.equal(calculateBonusPoints(10, 11, eligible, 'T1'), 120);
  assert.equal(calculateBonusPoints(4, 11, eligible, 'T2'), 20);
  assert.equal(calculateBonusPoints(5, 11, eligible, 'T1'), 50);
  assert.equal(calculateBonusPoints(5, 10, eligible, 'T2'), 0);
});

test('ThinkBook uses the existing quantity tier multipliers', () => {
  assert.equal(calculateBonusPoints(5, 51, true, 'T2'), 500);
  assert.equal(calculateBonusPoints(5, 301, true, 'T2'), 3500);
  assert.equal(calculateBonusPoints(5, 501, true, 'T2'), 10000);
});
