'use strict';
const db=require('../config/db');
const {verifyDatabaseSchema,toSafeSchemaDiagnostics}=require('../services/databaseSchemaService');
async function main(){ const result=await verifyDatabaseSchema(); const d=toSafeSchemaDiagnostics(result); if(result.ready){ console.log(`Database contract READY (v${d.contractVersion})`); return; } console.error('DATABASE_CONTRACT_INVALID'); console.error(`Status: ${d.status}`); if(d.missingTables.length) console.error(`Missing tables: ${d.missingTables.join(', ')}`); if(d.missingColumns.length) console.error(`Missing columns: ${d.missingColumns.join(', ')}`); process.exitCode=1; }
main().catch(e=>{console.error('DATABASE_CONTRACT_INVALID'); console.error(e.message); process.exitCode=1;}).finally(async()=>{await db.closePool().catch(()=>undefined);});
