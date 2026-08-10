require('dotenv').config();
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const readline = require('node:readline');
const db = require('../config/db');
const { sha256File } = require('./backup/backupUtils');

function arg(name){ const i=process.argv.indexOf(name); return i>=0 ? process.argv[i+1] : null; }
const has=(name)=>process.argv.includes(name);
async function main(){
  const file=path.resolve(arg('--file')||'');
  if(!arg('--file')) throw new Error('Thiếu --file <backup.jsonl.gz>');
  if(arg('--confirm')!=='KTC_RESTORE') throw new Error('Restore bị chặn. Phải truyền --confirm KTC_RESTORE');
  const replace=has('--replace');
  const dryRun=has('--dry-run');
  const expected=(await fsp.readFile(`${file}.sha256`,'utf8')).trim().split(/\s+/)[0];
  const actual=await sha256File(file);
  if(expected!==actual) throw new Error('Checksum backup không hợp lệ; hủy restore.');
  await db.testConnection();
  const connection=await db.promise().getConnection();
  const schemas=new Map(), counts=new Map();
  try{
    let input=fs.createReadStream(file);
    if(file.endsWith('.enc')){
      const secret=String(process.env.KTC_BACKUP_ENCRYPTION_KEY || '');
      if(!secret) throw new Error('Backup đã mã hóa nhưng thiếu KTC_BACKUP_ENCRYPTION_KEY');
      const meta=JSON.parse(await fsp.readFile(`${file}.crypto.json`,'utf8'));
      const key=crypto.scryptSync(secret,Buffer.from(meta.salt,'base64'),32);
      const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(meta.iv,'base64'));
      decipher.setAuthTag(Buffer.from(meta.auth_tag,'base64'));
      input=input.pipe(decipher);
    }
    const rl=readline.createInterface({input:input.pipe(zlib.createGunzip()),crlfDelay:Infinity});
    let prepared=false,currentTable=null,buffer=[];
    const flush=async()=>{
      if(!currentTable||!buffer.length||dryRun){buffer=[];return;}
      const columns=Object.keys(buffer[0]);
      const placeholders=buffer.map(()=>`(${columns.map(()=>'?').join(',')})`).join(',');
      const values=buffer.flatMap((row)=>columns.map((c)=>row[c]));
      await connection.query(`INSERT INTO \`${currentTable.replace(/`/g,'``')}\` (${columns.map((c)=>`\`${c.replace(/`/g,'``')}\``).join(',')}) VALUES ${placeholders}`,values);
      buffer=[];
    };
    for await(const line of rl){
      if(!line.trim()) continue; const item=JSON.parse(line);
      if(item.type==='schema') schemas.set(item.table,item.create_sql);
      if(item.type==='row'){
        if(!prepared){
          prepared=true;
          if(!dryRun){
            await connection.query('SET FOREIGN_KEY_CHECKS=0').catch(()=>{});
            for(const [table,sql] of schemas){ if(sql) await connection.query(sql.replace(/^CREATE TABLE /i,'CREATE TABLE IF NOT EXISTS ')); }
            if(replace){
              for(const table of [...schemas.keys()].reverse()) await connection.query(`DELETE FROM \`${table.replace(/`/g,'``')}\``);
            } else {
              const nonEmpty=[];
              for(const table of schemas.keys()){ const [rows]=await connection.query(`SELECT 1 FROM \`${table.replace(/`/g,'``')}\` LIMIT 1`); if(rows.length) nonEmpty.push(table); }
              if(nonEmpty.length) throw new Error(`DB đích không rỗng (${nonEmpty.slice(0,5).join(', ')}...). Dùng --replace nếu thực sự muốn thay toàn bộ dữ liệu.`);
            }
          }
        }
        if(currentTable && currentTable!==item.table) await flush();
        currentTable=item.table; buffer.push(item.data); counts.set(item.table,(counts.get(item.table)||0)+1);
        if(buffer.length>=200) await flush();
      }
    }
    await flush();
    if(!dryRun) await connection.query('SET FOREIGN_KEY_CHECKS=1').catch(()=>{});
    console.log(JSON.stringify({success:true,dry_run:dryRun,replace,file,sha256:actual,rows:Object.fromEntries(counts)},null,2));
  } finally { connection.release(); await db.closePool().catch(()=>{}); }
}
main().catch((e)=>{console.error('[KTC] Restore failed:',e.message);process.exitCode=1;});
