const test = require('node:test');
const assert = require('node:assert/strict');

const { User } = require('../dist/models/User');
const requireInternal = require('../dist/src/middleware/requireInternal').default;

const invoke = async (account) => {
  const originalFindByPk = User.findByPk;
  User.findByPk = async () => account;

  const result = { statusCode: 200, body: undefined, nextCalled: false };
  const req = {
    user: { userId: 42 },
    log: { error() {} },
  };
  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };

  try {
    await requireInternal(req, res, () => {
      result.nextCalled = true;
    });
    return result;
  } finally {
    User.findByPk = originalFindByPk;
  }
};

test('active internal users can enter redemption administration', async () => {
  const result = await invoke({ level: 'INTERNAL', is_active: true });
  assert.equal(result.nextCalled, true);
  assert.equal(result.statusCode, 200);
});

test('customers cannot enter redemption administration', async () => {
  const result = await invoke({ level: 'CUSTOMER', is_active: true });
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 403);
  assert.deepEqual(result.body, { message: 'Internal access required' });
});

test('inactive internal users cannot enter redemption administration', async () => {
  const result = await invoke({ level: 'INTERNAL', is_active: false });
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 403);
});
