'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../scripts/stagingReleaseGate.cjs'),'utf8');
function execute(env,reply){
 const calls=[],logs=[],exit={code:null};
 const child={spawnSync(cmd,args,options){calls.push({cmd,args,options});return reply(calls.length);}};
 const processStub={env,execPath:'/usr/bin/node',exit(code){exit.code=code;throw new Error('EXIT:'+code)}};
 try{
  vm.runInNewContext(source,{require(name){if(name==='node:child_process')return child;if(name==='node:path')return path;throw Error(name)},__dirname:path.resolve(__dirname,'../scripts'),process:processStub,console:{error:(...a)=>logs.push(a.join(' ')),log:(...a)=>logs.push(a.join(' '))}});
 }catch(error){if(!String(error.message).startsWith('EXIT:'))throw error;}
 return {calls,logs,exit};
}
test('gate runs all three steps using current Node and bounded timeout',()=>{
 const x=execute({},()=>({status:0}));
 assert.equal(x.calls.length,3);
 for(const call of x.calls){assert.equal(call.cmd,'/usr/bin/node');assert.equal(call.options.timeout,900000);assert.equal(call.options.killSignal,'SIGTERM');}
 assert.equal(x.exit.code,null);
 assert.ok(x.logs.some(s=>s.includes('KTC_STAGING_RELEASE_GATE=PASS')));
});
test('gate rejects invalid timeout before executing child processes',()=>{
 for(const value of ['0','NaN','3600001','1.5']){
  const x=execute({KTC_STAGING_GATE_STEP_TIMEOUT_MS:value},()=>({status:0}));
  assert.equal(x.calls.length,0);assert.equal(x.exit.code,2);
 }
});
test('gate stops on signal or spawn timeout and never prints PASS',()=>{
 for(const failure of [{status:null,signal:'SIGTERM'},{status:null,error:{message:'ETIMEDOUT'}},{status:1}]){
  const x=execute({},()=>failure);
  assert.equal(x.calls.length,1);assert.equal(x.exit.code,1);
  assert.ok(x.logs.some(s=>s.includes('KTC_STAGING_RELEASE_GATE_FAIL=')));
  assert.ok(!x.logs.some(s=>s.includes('KTC_STAGING_RELEASE_GATE=PASS')));
 }
});
