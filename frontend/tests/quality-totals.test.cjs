const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const quality = fs.readFileSync(path.join(__dirname, '../src/pages/worker/processQualityLogic.ts'), 'utf8');
assert.match(quality, /calculateNgTotal/);
assert.match(quality, /const ttNg = calculateNgTotal\(next, options\)/);
assert.match(quality, /next\.ttNg = String\(ttNg\)/);
assert.match(quality, /next\.actualOutput = String\(calc\(next\)\)/);
assert.doesNotMatch(quality, /next\.ttNg\s*=\s*String\(calc\(next\)\)/);
assert.match(quality, /Number\.isFinite\(quantity\) && quantity > 0/);
console.log('quality totals contract: PASS');
