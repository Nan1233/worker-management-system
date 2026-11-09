'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../scripts/securityRuntimeAudit.cjs'),'utf8');
test('runtime audit refuses unsafe API targets and uses bounded redirect-free requests',()=>{
 assert.match(source,/new URL\(base\)/);
 assert.match(source,/parsed\.username\|\|parsed\.password/);
 assert.match(source,/parsed\.protocol==='http:'/);
 assert.match(source,/redirect:'error'/);
 assert.match(source,/AbortSignal\.timeout\(10000\)/);
 assert.doesNotMatch(source,/await fetch\(base\+/);
});
test('runtime audit rejects credentials, paths, and insecure remote hosts before fetching',()=>{
 const prelude=source.slice(0,source.indexOf('const results=[]'));
 for(const url of ['http://example.com','https://user:pass@example.com','https://example.com/path','https://example.com/?token=abc','file:///tmp/x']){
  assert.throws(()=>vm.runInNewContext(prelude,{require:(name)=>name==='node:fs'?{}:{},process:{env:{KTC_RUNTIME_API_URL:url}},URL,AbortSignal,console}),/KTC_RUNTIME_API_URL/);
 }
});
