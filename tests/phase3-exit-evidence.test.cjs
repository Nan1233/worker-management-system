'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const doc=fs.readFileSync(path.resolve(__dirname,'../docs/PHASE3_EXIT_GATE.md'),'utf8');
test('Phase 3 exit gate never declares live staging or production approved without evidence',()=>{
 assert.match(doc,/Phase 3 accepted:\s*\*\*NO/);
 assert.match(doc,/Live staging UAT completed:\s*\*\*NO/);
 assert.match(doc,/Production release authorized:\s*\*\*NO/);
 assert.match(doc,/PR-head CI and post-merge CI are distinct/);
});
test('latest documented source evidence includes merged E2E security changes',()=>{
 for(const pr of [284,285,286,287,288])assert.ok(doc.includes('/pull/'+pr),'missing PR #'+pr);
 assert.match(doc,/worker_management_e2e/);
 assert.match(doc,/24 write-capable E2E scenarios/);
 assert.match(doc,/Windows export/);
});

test('TiDB acceptance is explicitly deferred without claiming production approval',()=>{
 assert.match(doc,/User-approved sequence:/);
 assert.match(doc,/only after the development phases/);
 assert.match(doc,/Do not change production data/);
 assert.match(doc,/FINAL OPERATIONAL ACCEPTANCE DEFERRED/);
});
