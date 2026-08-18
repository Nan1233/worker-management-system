const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const manifest = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');

test('Android app disables OS backup of WebView/auth application state', () => {
  assert.match(manifest, /android:allowBackup="false"/);
  assert.doesNotMatch(manifest, /android:allowBackup="true"/);
});

test('Android manifest does not enable cleartext traffic or add unnecessary permissions', () => {
  assert.doesNotMatch(manifest, /usesCleartextTraffic="true"/);
  const permissions = [...manifest.matchAll(/uses-permission[^>]+android:name="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(permissions, ['android.permission.INTERNET']);
});
