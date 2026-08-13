'use strict';
const path=require('node:path');
const {verifyBackupArtifact}=require('../services/disasterBackupArtifactService');
async function main(){ const file=path.resolve(process.argv[2]||''); if(!process.argv[2]) throw Object.assign(new Error('Cách dùng: node scripts/verifyDatabaseBackup.js <backup>'),{code:'BACKUP_FILE_REQUIRED'}); const result=await verifyBackupArtifact(file); console.log(JSON.stringify({success:true,file:result.file,sha256:result.sha256,format:result.format,created_at:result.createdAt,database:result.database,tables:result.tableCount,rows:result.rowCount,metadata:result.metadata},null,2)); }
main().catch(e=>{console.error(`[KTC] Backup verify failed: ${e.code||e.message}`);process.exitCode=1;});
