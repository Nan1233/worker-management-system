'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../scripts/stagingReleaseGate.cjs'),'utf8');
function execute(env,reply){
 const calls=[],logs=[],files=[],exit={code:null};
 const child={spawnSync(cmd,args,options){calls.push({cmd,args,options});return reply(calls.length);}};
 const processStub={env,execPath:'/usr/bin/node',exit(code){exit.code=code;throw new Error('EXIT:'+code)}};
 try{
  vm.runInNewContext(source,{require(name){if(name==='node:child_process')return child;if(name==='node:path')return path;if(name==='node:fs')return {mkdirSync(){},writeFileSync(p,content){files.push({p,content:JSON.parse(content)})}};throw Error(name)},__dirname:path.resolve(__dirname,'../scripts'),process:processStub,console:{error:(...a)=>logs.push(a.join(' ')),log:(...a)=>logs.push(a.join(' '))}});
 }catch(error){if(!String(error.message).startsWith('EXIT:'))throw error;}
 return {calls,logs,exit,files};
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

test('gate writes sanitized PASS manifest only after all checks succeed',()=>{
 const x=execute({},()=>({status:0}));
 assert.equal(x.files.length,1);
 assert.equal(x.files[0].content.status,'PASS');
 assert.equal(x.files[0].content.steps.length,3);
 assert.ok(x.files[0].content.steps.every(s=>s.status==='PASS'));
 assert.ok(!JSON.stringify(x.files[0].content).includes('DB_PASSWORD'));
});
test('gate writes FAIL manifest with only completed steps when child fails',()=>{
 const x=execute({},n=>n===2?{status:null,signal:'SIGTERM',error:{code:'ETIMEDOUT',message:'timeout'}}:{status:0});
 assert.equal(x.exit.code,1);
 assert.equal(x.files.length,1);
 assert.equal(x.files[0].content.status,'FAIL');
 assert.equal(x.files[0].content.steps.length,2);
 assert.equal(x.files[0].content.steps[1].errorCode,'ETIMEDOUT');
 assert.equal(x.files[0].content.steps[1].signal,'SIGTERM');
});
