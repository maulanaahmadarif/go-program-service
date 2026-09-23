const test = require('node:test');
const assert = require('node:assert/strict');

const controllerPath = require.resolve('../dist/src/controllers/redeem');
const cachePath = require.resolve('../dist/src/middleware/cache');

const handler = (name) => Object.defineProperty((_req, _res) => {}, 'name', { value: name });
require.cache[controllerPath] = {
  id: controllerPath,
  filename: controllerPath,
  loaded: true,
  exports: {
    redeemPoint: handler('redeemPoint'),
    redeemReferralPoint: handler('redeemReferralPoint'),
    redeemList: handler('redeemList'),
    getUserRedemptionList: handler('getUserRedemptionList'),
    rejectRedeem: handler('rejectRedeem'),
    approveRedeem: handler('approveRedeem'),
    checkUserRedeemStatus: handler('checkUserRedeemStatus'),
    downloadRedeem: handler('downloadRedeem'),
    getRedemptionWindowStatus: handler('getRedemptionWindowStatus'),
  },
};
require.cache[cachePath] = {
  id: cachePath,
  filename: cachePath,
  loaded: true,
  exports: {
    cacheGet: () => handler('cacheGet'),
  },
};

const router = require('../dist/src/routes/redeem').default;

const middlewareNames = (path, method) => {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route?.methods?.[method]
  );
  assert.ok(layer, `${method.toUpperCase()} ${path} route must exist`);
  return layer.route.stack.map((entry) => entry.handle.name);
};

test('redemption administration routes enforce authentication and internal authorization', () => {
  for (const [path, method] of [
    ['/list', 'get'],
    ['/download', 'get'],
    ['/reject', 'post'],
    ['/approve', 'post'],
  ]) {
    const names = middlewareNames(path, method);
    assert.deepEqual(names.slice(0, 2), ['authenticate', 'requireInternal']);
  }
});

test('customer redemption routes remain authenticated without requiring internal access', () => {
  for (const [path, method] of [
    ['/redeem', 'post'],
    ['/redeem-referral', 'post'],
    ['/user-list', 'get'],
    ['/check-status', 'get'],
  ]) {
    const names = middlewareNames(path, method);
    assert.equal(names[0], 'authenticate');
    assert.equal(names.includes('requireInternal'), false);
  }
});
