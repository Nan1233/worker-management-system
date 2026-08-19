'use strict';
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { createDecodedStream, verifyBackupArtifact } = (() => {
  const svc = require('../services/disasterBackupArtifactService');
  // decoded stream is intentionally kept private in the service; low-level restore re-opens with local decoder below.
  return { verifyBackupArtifact: svc.verifyBackupArtifact };
})();
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const fsp = require('node:fs/promises');
const db = require('../config/db');

function arg(name){ const i=process.argv.indexOf(name); return i>=0 ? process.argv[i+1] : null; }
async function decoded(file){
  let input=fs.createReadStream(file);
  if(file.endsWith('.enc')){
    const secret=String(process.env.KTC_BACKUP_ENCRYPTION_KEY||''); if(!secret) throw new Error('BACKUP_ENCRYPTION_KEY_REQUIRED');
    const meta=JSON.parse(await fsp.readFile(`${file}.crypto.json`,'utf8'));
    const key=crypto.scryptSync(secret,Buffer.from(meta.salt,'base64'),32);
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(meta.iv,'base64'));
    decipher.setAuthTag(Buffer.from(meta.auth_tag,'base64')); input=input.pipe(decipher);
  }
  return input.pipe(zlib.createGunzip());
}
async function main(){
  const file=path.resolve(arg('--file')||'');
  if(!arg('--file')) throw new Error('BACKUP_FILE_REQUIRED');
  if(process.env.KTC_RESTORE_LOW_LEVEL!=='YES') throw new Error('RESTORE_LOW_LEVEL_GUARD');
  // Mandatory complete verification before first schema/data mutation.
  await verifyBackupArtifact(file);
  await db.testConnection();
  const connection=await db.promise().getConnection();
  const schemas=new Map(); const counts=new Map(); let currentTable=null, buffer=[];
  const flush=async()=>{
    if(!currentTable||!buffer.length){buffer=[];return;}
    const columns=Object.keys(buffer[0]);
    if(buffer.some((row)=>Object.keys(row).join('\0')!==columns.join('\0'))) throw new Error(`BACKUP_ROW_SHAPE_MISMATCH:${currentTable}`);
    const placeholders=buffer.map(()=>`(${columns.map(()=>'?').join(',')})`).join(',');
    const values=buffer.flatMap((row)=>columns.map((c)=>row[c]));
    await connection.query(`INSERT INTO \`${currentTable.replace(/`/g,'``')}\` (${columns.map((c)=>`\`${c.replace(/`/g,'``')}\``).join(',')}) VALUES ${placeholders}`,values);
    buffer=[];
  };
  try{
    const stream=await decoded(file); const rl=readline.createInterface({input:stream,crlfDelay:Infinity}); let prepared=false;
    for await(const line of rl){ if(!line.trim()) continue; const item=JSON.parse(line);
      if(item.type==='schema') schemas.set(item.table,item.create_sql);
      if(item.type==='row'){
        if(!prepared){ prepared=true; await connection.query('SET FOREIGN_KEY_CHECKS=0').catch(()=>{}); for(const [,sql] of schemas){ if(sql) await connection.query(sql.replace(/^CREATE TABLE /i,'CREATE TABLE IF NOT EXISTS ')); } }
        if(currentTable&&currentTable!==item.table) await flush(); currentTable=item.table; buffer.push(item.data); counts.set(item.table,(counts.get(item.table)||0)+1); if(buffer.length>=200) await flush();
      }
    }
    await flush();
    if(!prepared){ await connection.query('SET FOREIGN_KEY_CHECKS=0').catch(()=>{}); for(const [,sql] of schemas){ if(sql) await connection.query(sql.replace(/^CREATE TABLE /i,'CREATE TABLE IF NOT EXISTS ')); } }
    await connection.query('SET FOREIGN_KEY_CHECKS=1').catch(()=>{});
    console.log(JSON.stringify({success:true,rows:Object.fromEntries(counts)},null,2));
  } finally { connection.release(); await db.closePool().catch(()=>{}); }
}
main().catch((e)=>{ console.error(`[KTC] Low-level staged restore failed: ${e.code||e.message}`); process.exitCode=1; });
