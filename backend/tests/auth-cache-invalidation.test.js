const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getCachedAuthUser,
  setCachedAuthUser,
  deleteCachedAuthUser,
  getOrLoadAuthUser,
} = require('../utils/authUserCache');

test('deleting auth user cache immediately removes an active cached identity', () => {
  setCachedAuthUser({ id: 91001, username: 'user', role: 'manager', status: 'active' });
  assert.equal(getCachedAuthUser(91001)?.status, 'active');
  deleteCachedAuthUser(91001);
  assert.equal(getCachedAuthUser(91001), undefined);
});

test('an in-flight stale auth load cannot repopulate cache after account invalidation', async () => {
  const userId = 91002;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const pending = getOrLoadAuthUser(userId, async () => {
    await gate;
    return { id: userId, username: 'stale', role: 'manager', status: 'active' };
  });

  await Promise.resolve();
  deleteCachedAuthUser(userId);
  release();
  const staleResult = await pending;
  assert.equal(staleResult.status, 'active'); // the already-started request may finish
  assert.equal(getCachedAuthUser(userId), undefined); // but it must not poison later requests

  const fresh = await getOrLoadAuthUser(userId, async () => ({
    id: userId, username: 'fresh', role: 'manager', status: 'inactive'
  }));
  assert.equal(fresh.status, 'inactive');
  assert.equal(getCachedAuthUser(userId)?.status, 'inactive');
});
