'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.resolve(__dirname,'../src/pages/worker/reportEditTypes.ts'),'utf8');
const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const mod={exports:{}};
new Function('module','exports','require',compiled)(mod,mod.exports,require);
const {unwrapReportEditResponse}=mod.exports;
const valid={id:3,process_id:6,work_date:'2026-11-20',shift:'A',tt_ok:40,operation_mode:'MANUAL'};
test('edit response accepts real calendar dates and preserves approved OK',()=>{
  assert.equal(unwrapReportEditResponse({data:valid}).tt_ok,40);
  assert.equal(unwrapReportEditResponse({...valid,work_date:'2026-11-20T00:00:00.000Z'}).id,3);
});
test('invalid calendar dates and malformed machine payloads are rejected',()=>{
  for(const work_date of ['2026-02-30','2026-13-01','invalid','2026-11-20junk'])assert.equal(unwrapReportEditResponse({...valid,work_date}),null);
  assert.equal(unwrapReportEditResponse({...valid,machine_lines:{}}),null);
  assert.equal(unwrapReportEditResponse({...valid,machine_lines:[{ok_quantity:'bad'}]}),null);
});
