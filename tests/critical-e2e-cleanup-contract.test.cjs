'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../scripts/zero-cost/critical-e2e.cjs'),'utf8');
test('critical E2E cleanup failures cannot be silently ignored',()=>{
  assert.match(source,/KTC_E2E_CLEANUP_FAILED/);
  assert.match(source,/if\(errors\.length\)throw new Error/);
  assert.doesNotMatch(source,/console\.warn\(\`\[KTC\] E2E cleanup skipped/);
});
