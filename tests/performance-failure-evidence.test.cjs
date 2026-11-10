'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../scripts/performanceLargeData.cjs'),'utf8');
test('performance runner always closes verified DB even when identity or query fails',()=>{
 const start=source.indexOf('  try {\n  db=await mysql.createConnection');
 const catchAt=source.indexOf('  } catch(error) {\n    executionError=error;',start);
 const closeAt=source.indexOf('    await db.end();',catchAt);
 assert.ok(start>=0&&catchAt>start&&closeAt>catchAt);
 assert.ok(source.indexOf('SELECT DATABASE() AS database_name')<source.indexOf('for(const [name,sql]'));
 assert.doesNotMatch(source.slice(start,catchAt),/await db\.end\(\)/);
});
test('performance runner persists failure evidence and never prints PASS for failed queries',()=>{
 assert.match(source,/result:executionError\?'FAIL':'PASS'/);
 assert.match(source,/error:executionError\?\.message\|\|null/);
 assert.ok(source.indexOf("fs.writeFileSync(path.join(outDir,'performance-large-data.json')")<source.indexOf('if(executionError)throw executionError'));
 assert.ok(source.indexOf('if(executionError)throw executionError')<source.indexOf("console.log('KTC_PERFORMANCE_LARGE_DATA=PASS')"));
});

test('connection failures are caught and recorded without closing a nonexistent connection',()=>{
 const tryAt=source.indexOf('  try {\n  db=await mysql.createConnection');
 const catchAt=source.indexOf('  } catch(error) {\\n    executionError=error;',tryAt);
 assert.ok(tryAt>=0&&catchAt>tryAt,'connection must be inside evidence-producing try/catch');
 assert.match(source,/let db=null;/);
 assert.match(source,/if\(db\)await db\.end\(\)/);
});
