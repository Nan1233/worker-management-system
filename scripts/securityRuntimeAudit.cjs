#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const base=String(process.env.KTC_RUNTIME_API_URL||process.env.LOCAL_BACKEND_URL||'').replace(/\/$/,'');
if(!base)throw new Error('KTC_RUNTIME_API_URL or LOCAL_BACKEND_URL is required');
const results=[];async function check(name,fn){try{const r=await fn();results.push({name,result:r?'PASS':'FAIL'});if(!r)process.exitCode=1}catch(e){results.push({name,result:'FAIL',evidence:e.message});process.exitCode=1}}
async function main(){
 await check('live endpoint',async()=>{const r=await fetch(base+'/api/health/live');return r.status===200});
 await check('ready endpoint does not leak secrets',async()=>{const r=await fetch(base+'/api/health/ready');const t=await r.text();return r.status===200&&!/password|secret|token|authorization/i.test(t)});
 await check('security headers',async()=>{const r=await fetch(base+'/api/health/live');return ['content-security-policy','x-content-type-options','x-frame-options','referrer-policy'].every(h=>r.headers.has(h))});
 await check('unauthenticated protected endpoint',async()=>{const r=await fetch(base+'/api/production-temp/pending');return [401,403].includes(r.status)});
 await check('invalid auth rejected',async()=>{const r=await fetch(base+'/api/production-temp/pending',{headers:{Authorization:'Bearer invalid.invalid.invalid'}});return [401,403].includes(r.status)});
 await check('method abuse rejected',async()=>{const r=await fetch(base+'/api/auth/login',{method:'TRACE'});return [404,405].includes(r.status)});
 await check('oversized query rejected or bounded',async()=>{const r=await fetch(base+'/api/health/live?'+('x'.repeat(10000)));return [200,400,414].includes(r.status)});
 const out=path.resolve(process.env.KTC_VALIDATION_DIR||'validation-artifacts');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'security-runtime-audit.json'),JSON.stringify({base,results,generatedAt:new Date().toISOString()},null,2));console.table(results);console.log(`KTC_SECURITY_RUNTIME=${results.every(x=>x.result==='PASS')?'PASS':'FAIL'}`);
}
main().catch(e=>{console.error('KTC_SECURITY_RUNTIME_FATAL',e.stack||e.message);process.exit(1)});
