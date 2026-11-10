const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../src/components/system/OfflineReportSync.tsx'), 'utf8');

test('offline queue does not attempt network writes while navigator reports offline', () => {
  const guard = source.indexOf('if (!navigator.onLine)');
  const flush = source.indexOf('await flushOfflineReportQueue');
  assert.ok(guard >= 0 && guard < flush);
  assert.match(source, /if \(manual\) showToast\("Thiết bị đang mất mạng/);
});
test('manual sync control reacts to connectivity changes', () => {
  assert.match(source, /useState\(\(\) => navigator.onLine\)/);
  assert.match(source, /addEventListener\("offline", onOffline\)/);
  assert.match(source, /removeEventListener\("offline", onOffline\)/);
  assert.match(source, /disabled=\{!online\}/);
  assert.match(source, /"Đang mất mạng"/);
});
