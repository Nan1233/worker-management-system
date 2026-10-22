'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const packageJson = require(path.join(__dirname, '..', 'package.json'));
const scripts = packageJson.scripts;

test('iOS doctor script invokes Capacitor CLI without recursively invoking itself', () => {
  assert.equal(scripts['ios:doctor'], 'cap doctor');
  assert.doesNotMatch(scripts['ios:doctor'], /npm run ios:doctor/);
});

test('Android release AAB script enters the Android directory exactly once', () => {
  const script = scripts['android:aab:release'];
  assert.equal((script.match(/\bcd android\b/g) || []).length, 1);
  assert.doesNotMatch(script, /cd android\s*&&\s*cd android/);
  assert.match(script, /gradlew\.bat bundleRelease$/);
});
