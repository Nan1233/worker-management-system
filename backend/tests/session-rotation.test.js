'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const svc = require('../services/refreshSessionService');
const { hashRefreshToken } = require('../utils/refreshTokenHash');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root,p),'utf8');

class FakeDb {
  constructor() { this.sessions=[]; this.users=new Map(); this.nextId=1; this.lock=Promise.resolve(); this.failInsert=false; this.failConsume=false; this.failRevoke=false; }
  addUser(u){this.users.set(Number(u.user_id), {...u});}
  addSession(s){ const row={id:this.nextId++,...s}; this.sessions.push(row); return row; }
  pool(){ const self=this; return { promise(){return { async getConnection(){ return new FakeConn(self); }}}}; }
}
class FakeConn {
  constructor(db){this.db=db;this.snapshot=null;this.releaseLock=null;}
  async beginTransaction(){ let release; const prev=this.db.lock; this.db.lock=new Promise(r=>release=r); await prev; this.releaseLock=release; this.snapshot=structuredClone(this.db.sessions); }
  async commit(){this.snapshot=null; this.releaseLock?.(); this.releaseLock=null;}
  async rollback(){if(this.snapshot)this.db.sessions=this.snapshot; this.snapshot=null; this.releaseLock?.(); this.releaseLock=null;}
  release(){this.releaseLock?.();this.releaseLock=null;}
  async query(sql, params=[]){
    const q=sql.replace(/\s+/g,' ').trim();
    if(q.includes('FROM user_sessions') && q.includes('FOR UPDATE')){
      const [hash, raw]=params; const rows=this.db.sessions.filter(s=>s.refresh_token===hash||s.refresh_token===raw).sort((a,b)=>(a.refresh_token===hash?-1:1)-(b.refresh_token===hash?-1:1)||b.id-a.id); return [[rows[0]].filter(Boolean),[]];
    }
    if(q.includes('FROM users u')){ const u=this.db.users.get(Number(params[0])); return [[u].filter(Boolean),[]]; }
    if(q.startsWith('INSERT INTO user_sessions')){ if(this.db.failInsert) throw new Error('insert fail'); const row=this.db.addSession({user_id:params[0],refresh_token:params[1],family_id:params[2],device_id:params[3],device_name:params[4],user_agent:params[5],ip_address:params[6],expires_at:params[7],revoked_at:null,consumed_at:null,replaced_by_id:null,reuse_detected_at:null}); return [{insertId:row.id,affectedRows:1},[]]; }
    if(q.includes('SET consumed_at=NOW()')){ if(this.db.failConsume) throw new Error('consume fail'); const row=this.db.sessions.find(s=>s.id===Number(params[1])); if(!row||row.consumed_at||row.replaced_by_id||row.revoked_at) return [{affectedRows:0},[]]; row.consumed_at='now';row.replaced_by_id=Number(params[0]);row.last_used_at='now'; return [{affectedRows:1},[]]; }
    if(q.includes('reuse_detected_at=COALESCE')){ const row=this.db.sessions.find(s=>s.id===Number(params[0])); if(row)row.reuse_detected_at='now'; return [{affectedRows:row?1:0},[]]; }
    if(q.includes('WHERE family_id=?')){ if(this.db.failRevoke) throw new Error('revoke fail'); let n=0; for(const s of this.db.sessions)if(s.family_id===params[0]){if(!s.revoked_at){s.revoked_at='now';n++;}} return [{affectedRows:n},[]]; }
    if(q.includes('WHERE id=?') && q.includes('revoked_at=COALESCE')){const r=this.db.sessions.find(s=>s.id===Number(params[0]));if(r&&!r.revoked_at)r.revoked_at='now';return [{affectedRows:r?1:0},[]];}
    if(q.includes('SELECT id, user_id, family_id')){const [hash,raw]=params;const r=this.db.sessions.filter(s=>s.refresh_token===hash||s.refresh_token===raw).sort((a,b)=>b.id-a.id)[0];return [[r].filter(Boolean),[]];}
    if(q.includes('WHERE user_id=?') && q.startsWith('UPDATE user_sessions')){let n=0;for(const s of this.db.sessions)if(s.user_id===Number(params[0])&&!s.revoked_at){s.revoked_at='now';n++;}return [{affectedRows:n},[]];}
    throw new Error('Unhandled SQL '+q);
  }
}
function setup(){ const db=new FakeDb(); db.addUser({user_id:1,username:'m',full_name:'M',role:'manager',status:'active',worker_id:null,worker_code:null,worker_status:null}); const raw='a'.repeat(64); db.addSession({user_id:1,refresh_token:hashRefreshToken(raw),family_id:'fam1',device_id:'d1',device_name:'dev',user_agent:'ua',ip_address:'ip',expires_at:'2099-01-01 00:00:00',revoked_at:null,consumed_at:null,replaced_by_id:null,reuse_detected_at:null}); return {db,raw}; }

// Functional lifecycle tests.
test('01 valid refresh rotates R1 to R2', async()=>{const {db,raw}=setup();const r=await svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool(),successorToken:'b'.repeat(64)});assert.equal(r.refreshToken,'b'.repeat(64));});
test('02 R1 is marked consumed', async()=>{const {db,raw}=setup();await svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool(),successorToken:'b'.repeat(64)});assert.equal(db.sessions[0].consumed_at,'now');});
test('03 R2 stored as SHA-256 only', async()=>{const {db,raw}=setup();await svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool(),successorToken:'b'.repeat(64)});assert.equal(db.sessions[1].refresh_token,hashRefreshToken('b'.repeat(64)));assert.notEqual(db.sessions[1].refresh_token,'b'.repeat(64));});
test('04 successor inherits family', async()=>{const {db,raw}=setup();await svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool(),successorToken:'b'.repeat(64)});assert.equal(db.sessions[1].family_id,'fam1');});
test('05 successor inherits absolute expiry', async()=>{const {db,raw}=setup();await svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool(),successorToken:'b'.repeat(64)});assert.equal(db.sessions[1].expires_at,'2099-01-01 00:00:00');});
test('06 R2 rotates to R3', async()=>{const {db,raw}=setup();await svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool(),successorToken:'b'.repeat(64)});const r=await svc.rotateRefreshToken({refreshToken:'b'.repeat(64)},{pool:db.pool(),successorToken:'c'.repeat(64)});assert.equal(r.refreshToken,'c'.repeat(64));});
test('07 expired refresh fails', async()=>{const {db,raw}=setup();db.sessions[0].expires_at='2000-01-01 00:00:00';await assert.rejects(()=>svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool()}),e=>e.code==='REFRESH_TOKEN_EXPIRED');});
test('08 expiry boundary fails', async()=>{const {db,raw}=setup();db.sessions[0].expires_at='2026-01-01 00:00:00';await assert.rejects(()=>svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool(),now:new Date('2026-01-01T00:00:00Z')}),e=>e.code==='REFRESH_TOKEN_EXPIRED');});
test('09 revoked token fails', async()=>{const {db,raw}=setup();db.sessions[0].revoked_at='now';await assert.rejects(()=>svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool()}),e=>e.code==='REFRESH_TOKEN_REVOKED');});
test('10 inactive user fails and family revoked', async()=>{const {db,raw}=setup();db.users.get(1).status='inactive';await assert.rejects(()=>svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool()}),e=>e.code==='SESSION_USER_DISABLED');assert.ok(db.sessions[0].revoked_at);});
test('11 deleted user fails and family revoked', async()=>{const {db,raw}=setup();db.users.delete(1);await assert.rejects(()=>svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool()}),e=>e.code==='SESSION_USER_DISABLED');assert.ok(db.sessions[0].revoked_at);});
test('12 R1 reuse detects compromise', async()=>{const {db,raw}=setup();await svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool(),successorToken:'b'.repeat(64)});await assert.rejects(()=>svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool()}),e=>e.code==='REFRESH_TOKEN_REUSE_DETECTED');});
test('13 R1 reuse revokes R2', async()=>{const {db,raw}=setup();await svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool(),successorToken:'b'.repeat(64)});await assert.rejects(()=>svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool()}));assert.ok(db.sessions[1].revoked_at);});
test('14 R2 fails after reuse family revoke', async()=>{const {db,raw}=setup();await svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool(),successorToken:'b'.repeat(64)});await assert.rejects(()=>svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool()}));await assert.rejects(()=>svc.rotateRefreshToken({refreshToken:'b'.repeat(64)},{pool:db.pool()}),e=>e.code==='REFRESH_TOKEN_REVOKED');});
test('15 ordinary logout revocation is not reuse', async()=>{const {db,raw}=setup();await svc.revokeFamilyByRefreshToken(raw,{executor:new FakeConn(db)});await assert.rejects(()=>svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool()}),e=>e.code==='REFRESH_TOKEN_REVOKED');});
test('16 concurrent R1 yields one success', async()=>{const {db,raw}=setup();const rs=await Promise.allSettled([svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool(),successorToken:'b'.repeat(64)}),svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool(),successorToken:'c'.repeat(64)})]);assert.equal(rs.filter(x=>x.status==='fulfilled').length,1);});
test('17 concurrent loser is reuse-detected', async()=>{const {db,raw}=setup();const rs=await Promise.allSettled([svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool(),successorToken:'b'.repeat(64)}),svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool(),successorToken:'c'.repeat(64)})]);assert.equal(rs.filter(x=>x.status==='rejected'&&x.reason.code==='REFRESH_TOKEN_REUSE_DETECTED').length,1);});
test('18 no two unrevoked successors survive race', async()=>{const {db,raw}=setup();await Promise.allSettled([svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool(),successorToken:'b'.repeat(64)}),svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool(),successorToken:'c'.repeat(64)})]);assert.ok(db.sessions.filter(s=>s.id>1&&!s.revoked_at).length<=1);});
test('19 successor insert failure rolls back R1 consumption', async()=>{const {db,raw}=setup();db.failInsert=true;await assert.rejects(()=>svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool()}));assert.equal(db.sessions[0].consumed_at,null);});
test('20 consume update failure rolls back successor', async()=>{const {db,raw}=setup();db.failConsume=true;await assert.rejects(()=>svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool(),successorToken:'b'.repeat(64)}));assert.equal(db.sessions.length,1);assert.equal(db.sessions[0].consumed_at,null);});
test('21 family revoke failure never issues token', async()=>{const {db,raw}=setup();await svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool(),successorToken:'b'.repeat(64)});db.failRevoke=true;await assert.rejects(()=>svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool()}));});
test('22 legacy familyless session requires relogin', async()=>{const {db,raw}=setup();db.sessions[0].family_id=null;await assert.rejects(()=>svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool()}),e=>e.code==='REFRESH_TOKEN_RELOGIN_REQUIRED');});
test('23 legacy session gets revoked not upgraded', async()=>{const {db,raw}=setup();db.sessions[0].family_id=null;await assert.rejects(()=>svc.rotateRefreshToken({refreshToken:raw},{pool:db.pool()}));assert.ok(db.sessions[0].revoked_at);assert.equal(db.sessions.length,1);});
test('24 revoke-all affects only target user', async()=>{const {db}=setup();db.addUser({user_id:2,status:'active'});db.addSession({user_id:2,refresh_token:'x',family_id:'f2'});await svc.revokeAllUserFamilies(1,{executor:new FakeConn(db)});assert.ok(db.sessions[0].revoked_at);assert.equal(db.sessions[1].revoked_at,undefined);});
test('25 fresh family ID is UUID-shaped',()=>assert.match(svc.generateFamilyId(),/^[0-9a-f-]{36}$/i));
test('26 refresh token uses crypto randomness shape',()=>assert.match(svc.generateRefreshToken(),/^[0-9a-f]{64}$/));
test('27 isExpired rejects invalid date',()=>assert.equal(svc.isExpired('bad'),true));

// Static/security contracts for controller, migration, hooks and compatibility plumbing.
const service=read('services/refreshSessionService.js'), auth=read('controllers/authController.js'), user=read('controllers/userController.js'), admin=read('controllers/adminMasterController.js'), migration=read('migrations/023_refresh_session_rotation_20260813.sql'), reset=read('database/KTC_RESET_FULL_DATABASE_LATEST_20260810.sql');
test('28 authoritative refresh lookup locks generation FOR UPDATE',()=>assert.match(service,/FROM user_sessions[\s\S]*FOR UPDATE/));
test('29 expiry is explicitly checked in refresh path',()=>assert.match(service,/isExpired\(generation\.expires_at/));
test('30 consumed generation has reuse path',()=>assert.match(service,/REFRESH_TOKEN_REUSE_DETECTED/));
test('31 family revoke updates all family rows',()=>assert.match(service,/WHERE family_id=\?/));
test('32 process scope is not added to JWT',()=>{const jwtBlock=auth.slice(auth.indexOf('function generateAccessToken'),auth.indexOf('async function issueLoginSession'));assert.doesNotMatch(jwtBlock,/process_ids|allowed_processes|manager_processes/);});
test('33 browser refresh does not always expose body refresh token',()=>assert.match(auth,/shouldReturnRefreshToken\(req\) \? \{ refreshToken: rotated\.refreshToken \} : \{\}/));
test('34 Electron-compatible refresh returns successor token conditionally',()=>assert.match(auth,/electron[\s\S]*refreshToken: rotated\.refreshToken/i));
test('35 successful refresh rotates cookie to successor',()=>assert.match(auth,/setRefreshCookie\(res, rotated\.refreshToken, rotated\.expiresAt\)/));
test('36 invalid refresh clears cookie',()=>assert.match(auth,/securityCodes\.has\(code\)[\s\S]*clearRefreshCookie\(res\)/));
test('37 logout revokes family not one generation',()=>assert.match(auth,/logout[\s\S]*revokeFamilyByRefreshToken/));
test('38 password change hook revokes all families',()=>assert.match(user,/payload, 'password'[\s\S]*revokeAllUserFamilies/));
test('39 user disable hook revokes all families',()=>assert.match(user,/payload\.status === 'inactive'[\s\S]*revokeAllUserFamilies/));
test('40 worker disable hook revokes all families',()=>assert.match(admin,/payload\.status === 'inactive'[\s\S]*revokeAllUserFamilies/));
test('41 migration adds family lineage fields',()=>{for(const x of ['family_id','consumed_at','replaced_by_id','reuse_detected_at'])assert.match(migration,new RegExp(x));});
test('42 migration revokes legacy active sessions',()=>assert.match(migration,/WHERE family_id IS NULL[\s\S]*revoked_at IS NULL/));
test('43 reset schema includes F11 fields',()=>{for(const x of ['family_id','consumed_at','replaced_by_id','reuse_detected_at'])assert.match(reset,new RegExp(x));});
test('44 no Math.random token generation in F11 service',()=>assert.doesNotMatch(service,/Math\.random/));
test('45 new family session stores hash not raw token',()=>{assert.match(service,/hashRefreshToken\(rawToken\)/);assert.match(service,/tokenHash,[\s\S]*familyId/);});
