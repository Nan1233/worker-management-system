const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/worker/ProcessPage.tsx'), 'utf8');
test('validation focus targets time minutes and quality NG errors', () => {
  assert.match(source, /normalized\.includes\("số phút"\)/);
  assert.match(source, /selector = '#ttNg'/);
  assert.match(source, /focusValidationTarget\(validationMessage\)/);
});
test('NG section is not expanded by every Vietnamese word containing ng', () => {
  assert.doesNotMatch(source, /if \(normalized\.includes\("ng"\)\) setShowNg\(true\)/);
  assert.match(source, /setShowNg\(true\)/);
});
