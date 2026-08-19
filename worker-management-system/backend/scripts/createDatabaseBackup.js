require('dotenv').config();
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { once } = require('node:events');
const db = require('../config/db');
const { backupRoot, backupFileName, sha256File, pruneRetention } = require('./backup/backupUtils');
const backendPkg = require('../package.json');

const CHUNK_SIZE = Math.max(100, Math.min(2000, Number(process.env.KTC_BACKUP_CHUNK_SIZE) || 500));
const json = (value) => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item);
async function writeLine(stream, object) { if (!stream.write(`${json(object)}\n`)) await once(stream, 'drain'); }

async function main() {
  await db.testConnection();
  const root=backupRoot(); await fsp.mkdir(root,{recursive:true});
  const encryptionSecret=String(process.env.KTC_BACKUP_ENCRYPTION_KEY || '');
  const encrypted=Boolean(encryptionSecret);
  const finalPath=path.join(root,backupFileName(new Date(), encrypted));
  const tempPath=`${finalPath}.partial`;
  const output=fs.createWriteStream(tempPath,{flags:'wx'});
  const gzip=zlib.createGzip({level:6});
  let cryptoMeta=null;
  let cipher=null;
  if(encrypted){
    const salt=crypto.randomBytes(16), iv=crypto.randomBytes(12);
    const key=crypto.scryptSync(encryptionSecret,salt,32);
    cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
    gzip.pipe(cipher).pipe(output);
    cryptoMeta={algorithm:'aes-256-gcm',kdf:'scrypt',salt:salt.toString('base64'),iv:iv.toString('base64')};
  } else {
    console.warn('[KTC] WARNING: KTC_BACKUP_ENCRYPTION_KEY chưa được đặt; backup DB sẽ không mã hóa.');
    gzip.pipe(output);
  }
  const connection=await db.promise().getConnection();
  const [versionRows]=await db.promise().query('SELECT VERSION() AS db_version, DATABASE() AS current_database');
  const manifest={format:'KTC_DB_JSONL_GZIP_V1',created_at:new Date().toISOString(),database:process.env.DB_NAME,db_version:String(versionRows[0]?.db_version||''),app_version:String(backendPkg.version||''),schema_contract_version:26,tables:{}};
  try {
    await connection.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ').catch(()=>{});
    await connection.beginTransaction();
    const [tableRows]=await connection.query('SHOW TABLES');
    const tables=tableRows.map((row)=>String(Object.values(row)[0])).sort();
    await writeLine(gzip,{type:'meta',...manifest,table_count:tables.length});
    for(const table of tables){
      const [createRows]=await connection.query(`SHOW CREATE TABLE \`${table.replace(/`/g,'``')}\``);
      const createSql=String(createRows[0]?.['Create Table'] || Object.values(createRows[0]||{})[1] || '');
      await writeLine(gzip,{type:'schema',table,create_sql:createSql});
    }
    for(const table of tables){
      let offset=0,count=0;
      while(true){
        const [rows]=await connection.query(`SELECT * FROM \`${table.replace(/`/g,'``')}\` LIMIT ? OFFSET ?`,[CHUNK_SIZE,offset]);
        if(!rows.length) break;
        for(const row of rows) await writeLine(gzip,{type:'row',table,data:row});
        count+=rows.length; offset+=rows.length;
        if(rows.length<CHUNK_SIZE) break;
      }
      manifest.tables[table]={rows:count};
      await writeLine(gzip,{type:'table_end',table,rows:count});
    }
    await connection.commit();
    await writeLine(gzip,{type:'end',tables:manifest.tables,completed_at:new Date().toISOString()});
    gzip.end(); await once(output,'close');
    await fsp.rename(tempPath,finalPath);
    if(cipher && cryptoMeta){
      cryptoMeta.auth_tag=cipher.getAuthTag().toString('base64');
      await fsp.writeFile(`${finalPath}.crypto.json`,JSON.stringify(cryptoMeta,null,2),'utf8');
    }
    const checksum=await sha256File(finalPath);
    await fsp.writeFile(`${finalPath}.sha256`,`${checksum}  ${path.basename(finalPath)}\n`,'utf8');
    await fsp.writeFile(`${finalPath}.manifest.json`,JSON.stringify({...manifest,sha256:checksum,encrypted},null,2),'utf8');
    const retention=await pruneRetention(root);
    console.log(JSON.stringify({success:true,file:finalPath,sha256:checksum,tables:manifest.tables,retention},null,2));
  } catch(error){
    await connection.rollback().catch(()=>{}); gzip.destroy(); output.destroy(); await fsp.rm(tempPath,{force:true}).catch(()=>{}); throw error;
  } finally { connection.release(); await db.closePool().catch(()=>{}); }
}
main().catch((error)=>{console.error('[KTC] Database backup failed:',error.message);process.exitCode=1;});
