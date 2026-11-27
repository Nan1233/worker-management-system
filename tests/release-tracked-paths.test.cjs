'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {inspectTrackedPaths}=require('../scripts/lib/releaseTrackedPaths.cjs');
test('release audit permits only intentionally tracked public env profiles',()=>{
 assert.deepEqual(inspectTrackedPaths(['.env.example','backend/.env.example','frontend/.env.example','frontend/.env.test','frontend/.env.production','backend/server.js']),[]);
 assert.deepEqual(inspectTrackedPaths(['backend/.env','frontend/.env.local','private/.env.production','backup.sql.bak','draft.tmp','old.js~']),['backend/.env','backup.sql.bak','draft.tmp','frontend/.env.local','old.js~','private/.env.production']);
});
