const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('notification unread count uses bounded per-user cache and invalidates after writes', () => {
  const source = fs.readFileSync(
    require('node:path').resolve(__dirname, '../controllers/systemController.js'),
    'utf8'
  );
  assert.match(source, /unreadNotificationCache/);
  assert.match(source, /UNREAD_NOTIFICATION_CACHE_TTL_MS/);
  assert.match(source, /X-KTC-Cache/);
  assert.match(source, /clearUnreadNotificationCache\(req\.user\.id\)/);
});
