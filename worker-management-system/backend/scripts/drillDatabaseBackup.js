'use strict';
const path=require('node:path');
const {verifyBackupArtifact}=require('../services/disasterBackupArtifactService');
async function main(){ const file=path.resolve(process.argv[2]||''); if(!process.argv[2]) throw Object.assign(new Error('Cách dùng: node scripts/drillDatabaseBackup.js <backup>'),{code:'BACKUP_FILE_REQUIRED'}); const result=await verifyBackupArtifact(file); console.log(JSON.stringify({success:true,file:result.file,sha256:result.sha256,format:result.format,tables:result.tableCount,rows:result.rowCount,created_at:result.createdAt},null,2)); }
main().catch(e=>{console.error(`[KTC] Backup drill failed: ${e.code||e.message}`);process.exitCode=1;});
