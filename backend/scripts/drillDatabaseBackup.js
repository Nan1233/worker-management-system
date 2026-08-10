const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const zlib=require('node:zlib');
const crypto=require('node:crypto');
const readline=require('node:readline');
const {sha256File}=require('./backup/backupUtils');
async function main(){
 const file=path.resolve(process.argv[2]||''); if(!process.argv[2]) throw new Error('Cách dùng: node scripts/drillDatabaseBackup.js <backup.jsonl.gz|enc>');
 const expected=(await fsp.readFile(`${file}.sha256`,'utf8')).trim().split(/\s+/)[0]; const actual=await sha256File(file); if(expected!==actual) throw new Error('Checksum không khớp');
 const manifest=JSON.parse(await fsp.readFile(`${file}.manifest.json`,'utf8')); let input=fs.createReadStream(file);
 if(file.endsWith('.enc')){ const secret=String(process.env.KTC_BACKUP_ENCRYPTION_KEY||''); if(!secret) throw new Error('Thiếu KTC_BACKUP_ENCRYPTION_KEY'); const meta=JSON.parse(await fsp.readFile(`${file}.crypto.json`,'utf8')); const key=crypto.scryptSync(secret,Buffer.from(meta.salt,'base64'),32); const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(meta.iv,'base64')); decipher.setAuthTag(Buffer.from(meta.auth_tag,'base64')); input=input.pipe(decipher); }
 const rl=readline.createInterface({input:input.pipe(zlib.createGunzip()),crlfDelay:Infinity}); const counts={}; const schemas=new Set(); let end=null;
 for await(const line of rl){ if(!line.trim()) continue; const item=JSON.parse(line); if(item.type==='schema') schemas.add(item.table); if(item.type==='row') counts[item.table]=(counts[item.table]||0)+1; if(item.type==='end') end=item; }
 if(!end) throw new Error('Backup thiếu marker end; file có thể bị cắt giữa chừng');
 const mismatches=[]; for(const [table,meta] of Object.entries(manifest.tables||{})){ if(!schemas.has(table)) mismatches.push(`${table}:missing-schema`); if(Number(counts[table]||0)!==Number(meta.rows||0)) mismatches.push(`${table}:rows ${counts[table]||0} != ${meta.rows||0}`); }
 if(mismatches.length) throw new Error(`Backup drill FAIL: ${mismatches.slice(0,20).join('; ')}`);
 console.log(JSON.stringify({success:true,file,sha256:actual,tables:Object.keys(manifest.tables||{}).length,rows:Object.values(counts).reduce((a,b)=>a+b,0),created_at:manifest.created_at},null,2));
}
main().catch(e=>{console.error('[KTC] Backup drill failed:',e.message);process.exitCode=1;});
