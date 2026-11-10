const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../src/components/system/NetworkStatusBanner.tsx'), 'utf8');

test('network banner is visible on initial offline load', () => {
  assert.match(source, /useState\(\(\) => !navigator\.onLine\)/);
  assert.match(source, /window\.addEventListener\("offline", handleOffline\)/);
  assert.match(source, /window\.addEventListener\("online", handleOnline\)/);
});

test('offline warning does not promise unsubmitted data was persisted', () => {
  assert.match(source, /Kiểm tra báo cáo chờ đồng bộ trước khi đóng ứng dụng/);
  assert.doesNotMatch(source, /Báo cáo sẽ được giữ lại và đồng bộ khi có mạng/);
});
