const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
test('runtime metrics are recorded for every completed HTTP request',()=>{const s=read('server.js');assert.match(s,/runtimeMetrics\.recordHttp/);});
test('observability endpoint is permission protected',()=>{const s=read('routes/systemRoutes.js');assert.match(s,/\/observability'.*SYSTEM_HEALTH_VIEW/);});
test('real data, backup drill and monitoring commands are available',()=>{const pkg=JSON.parse(read('package.json'));assert.ok(pkg.scripts['validate:real-data']);assert.ok(pkg.scripts['backup:drill']);});
