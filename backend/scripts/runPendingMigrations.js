'use strict';

const DEFAULT_REPOSITORY = 'Nan1233/worker-management-system';
const isCloudflareWorker = process.env.KTC_CLOUDFLARE_WORKER === 'true' || Boolean(globalThis.__KTC_CLOUDFLARE_WORKER);
const migrationRef = String(process.env.KTC_MIGRATION_REF || (isCloudflareWorker ? 'test' : 'main')).trim();
const repository = String(process.env.KTC_MIGRATION_REPOSITORY || DEFAULT_REPOSITORY).trim();
const rawBase = `https://raw.githubusercontent.com/${repository}/${migrationRef.replace(/[^A-Za-z0-9._-]/g, '')}`;

const EMBEDDED_MIGRATION_NAMES = [
  '001_core_master_schema.sql','002_production_schema.sql','003_machine_and_session_schema.sql','004_sync_and_export_schema.sql',
  '005_entry_date_compatibility.sql','006_extra_data_compatibility.sql','007_production_formula_settings.sql',
  '027_notifications_runtime_columns.sql','028_report_edit_proposals.sql','029_temp_report_updated_by.sql',
  '030_report_kpi_calculated_columns.sql','031_mai_standard_data_20260903.sql','032_add_2801_lt_long_machine_20260908.sql',
  '034_non_product_work_process_20260907.sql','035_gc_late_early_deduction_20260907.sql','036_notifications_runtime_columns_20260908.sql',
  '037_production_reports_logical_duplicate_key_20260909.sql','038_gc_deduction_types_exact_20260910.sql',
  '039_cvk_deduction_types_20260911.sql','039_machine_adjustment_fields_20260914.sql','040_cvk_deduction_types_repair_20260914.sql',
  '046_reset_gc_cut_long_master_20260924.sql','047_gc_aliases_from_excel_20260924.sql',
  '048_gc_products_defects_from_excel_20260924.sql','049_gc_machines_from_excel_20260924.sql'
];

function getMigrationError(error){
  const message = String(error?.message || error || 'Unknown migration error');
  const cause = error?.cause ? `; cause=${String(error.cause?.message || error.cause)}` : '';
  return `${message}${cause}`;
}

async function fetchText(url){
  const response=await fetch(url,{headers:{Accept:'text/plain','User-Agent':'ktc-migration-runner'}});
  if(!response.ok) throw new Error(`Migration SQL request failed: HTTP ${response.status} ${response.statusText}: ${url}`);
  return response.text();
}

function normalizeMigrationEntries(entries){
  if(!Array.isArray(entries)) throw new Error('Bundled migration manifest is not an array.');
  return entries
    .filter(e => e && e.type === 'file' && /^\d+_.+\.sql$/i.test(String(e.name || '')))
    .map((e,index) => ({
      filename: String(e.name),
      number: index + 1,
      downloadUrl: String(e.download_url || `${rawBase}/backend/migrations/${encodeURIComponent(e.name)}`)
    }));
}

function validateMigrationInventory(migrations){
  const seen = new Set();
  for(const migration of migrations){
    if(seen.has(migration.filename)) throw new Error(`Duplicate migration filename: ${migration.filename}`);
    seen.add(migration.filename);
  }
  if(!migrations.length) throw new Error('Migration inventory is empty.');
  return { entries: migrations, versions: migrations.map((_, index) => index + 1) };
}

function loadMigrationManifest(){
  let names = EMBEDDED_MIGRATION_NAMES;
  try {
    const manifest = require('../migrations/manifest.json');
    const manifestNames = Array.isArray(manifest?.migrations) ? manifest.migrations : manifest;
    if(Array.isArray(manifestNames) && manifestNames.length) names = manifestNames;
  } catch(error) {
    console.warn(`[KTC][MIGRATION] using embedded inventory: ${getMigrationError(error)}`);
  }
  return validateMigrationInventory(normalizeMigrationEntries(
    names.map(name => ({name:String(name),type:'file',download_url:`${rawBase}/backend/migrations/${encodeURIComponent(String(name))}`}))
  ));
}

function splitSql(sql){
  const statements=[]; let start=0,quote=null,lineComment=false;
  for(let i=0;i<sql.length;i++){
    const ch=sql[i],next=sql[i+1];
    if(lineComment){if(ch==='\n') lineComment=false; continue;}
    if(quote){if(ch===quote&&next===quote){i++;continue;} if(ch===quote&&sql[i-1]!=='\\') quote=null; continue;}
    if(ch==='-'&&next==='-'&&(i+2>=sql.length||/\s/.test(sql[i+2]))){lineComment=true;i++;continue;}
    if(ch==='/'&&next==='*'){const end=sql.indexOf('*/',i+2);if(end<0)break;i=end+1;continue;}
    if(ch==="'"||ch==='"'||ch==='`'){quote=ch;continue;}
    if(ch===';'){const statement=sql.slice(start,i+1).trim();if(statement)statements.push(statement);start=i+1;}
  }
  const tail=sql.slice(start).trim(); if(tail) statements.push(tail); return statements;
}

function stripLeadingSqlComments(statement){
  let value=String(statement||'').trim(),previous='';
  while(value&&value!==previous){
    previous=value;
    value=value.replace(/^(?:\s*--[^\r\n]*(?:\r?\n|$))+/, '').trim();
    value=value.replace(/^(?:\s*\/\*[\s\S]*?\*\/\s*)+/, '').trim();
  }
  return value;
}

const GC_PROCESS_ID_EXPR="(SELECT id FROM processes WHERE UPPER(TRIM(process_code)) = 'GC' LIMIT 1)";
function normalizeCloudflareMigrationStatements(sql,migrationFilename=''){
  return splitSql(sql).map(stripLeadingSqlComments).filter(Boolean)
    .filter(statement=>!/^(?:START\s+TRANSACTION|BEGIN|COMMIT|ROLLBACK)\s*;?$/i.test(statement.trim()))
    .filter(statement=>!/^SET\s+@gc_process_id\s*:=/i.test(statement.trim()))
    .map(statement=>statement
      .replace(/@gc_process_id\b/g,GC_PROCESS_ID_EXPR)
      .replace(/\bCREATE\s+(?:GLOBAL\s+)?TEMPORARY\s+TABLE\b/gi,'CREATE TABLE')
      .replace(/\bDROP\s+(?:GLOBAL\s+)?TEMPORARY\s+TABLE\b/gi,'DROP TABLE')
      .replace(/^INSERT\s+INTO\s+product_aliases\b/i,migrationFilename==='041_sync_gc_cut_long_from_ma_hoa_xlsx_20260922.sql'?'INSERT IGNORE INTO product_aliases':'INSERT INTO product_aliases')
    );
}

async function sha256(value){
  const bytes=new TextEncoder().encode(value);
  const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}

// Cloudflare Free allows 50 external subrequests per invocation. A migration
// statement uses one TiDB subrequest and each checkpoint uses one more. Keep
// a conservative batch so a single request can advance several statements
// without ever approaching the platform limit.
const MIGRATION_STATEMENTS_PER_INVOCATION = Math.max(1, Math.min(8, Number.parseInt(process.env.KTC_MIGRATION_BATCH_SIZE || '8', 10) || 8));

async function runPendingMigrations(){
  const {entries,versions}=loadMigrationManifest();
  const db=require('../config/db');
  const missingDb=typeof db.getMissingDatabaseVariables==='function'?db.getMissingDatabaseVariables():[];
  if(missingDb.length) throw new Error(`Migration database configuration missing: ${missingDb.join(', ')}`);
  const connection=await db.promise().getConnection();
  try{
    await connection.query('CREATE TABLE IF NOT EXISTS schema_migrations (migration_id VARCHAR(160) NOT NULL PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    await connection.query('CREATE TABLE IF NOT EXISTS schema_migration_steps (id TINYINT NOT NULL PRIMARY KEY, migration_id VARCHAR(160) NOT NULL, checksum CHAR(64) NOT NULL, statement_index INT NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)');
    console.log(`[KTC][MIGRATION] manifest loaded: ${entries.length} SQL files / ${versions.length} ordered migrations, ref=${migrationRef}`);

    let processedStatements=0;
    while(processedStatements < MIGRATION_STATEMENTS_PER_INVOCATION){
      const [appliedRows]=await connection.query('SELECT migration_id, checksum FROM schema_migrations');
      const appliedById=new Map(appliedRows.map(r=>[String(r.migration_id),String(r.checksum||'')]));
      const pending=entries.filter(m=>!appliedById.has(m.filename));

      const [stepRows]=await connection.query('SELECT id, migration_id, checksum, statement_index FROM schema_migration_steps WHERE id=1 LIMIT 1');
      let activeStep=stepRows[0] || null;
      let migration;

      if(activeStep){
        migration=entries.find(item=>item.filename===String(activeStep.migration_id));
        if(!migration) throw new Error(`Migration step state references unknown migration: ${activeStep.migration_id}`);
        if(!pending.some(item=>item.filename===migration.filename)) throw new Error(`Migration step state references an already applied migration: ${migration.filename}`);
      } else {
        migration=pending[0];
      }

      if(!migration){
        console.log(`[KTC][MIGRATION] complete: ${entries.length} ordered migrations processed`);
        return true;
      }

      const sql=await fetchText(migration.downloadUrl);
      const checksum=await sha256(sql);
      const statements=normalizeCloudflareMigrationStatements(sql,migration.filename);
      if(!statements.length) throw new Error(`Migration has no executable SQL statements: ${migration.filename}`);

      let statementIndex=activeStep ? Number(activeStep.statement_index) : 0;
      if(!Number.isInteger(statementIndex) || statementIndex < 0 || statementIndex >= statements.length){
        throw new Error(`Invalid migration statement progress for ${migration.filename}: ${statementIndex}`);
      }
      if(activeStep && String(activeStep.checksum||'') !== checksum){
        throw new Error(`Migration checksum changed while in progress: ${migration.filename}`);
      }

      console.log(`[KTC][MIGRATION] applying ${migration.filename}: statement ${statementIndex + 1}/${statements.length}`);
      try{
        await connection.query(statements[statementIndex]);
      }catch(error){
        throw new Error(`Migration failed: ${migration.filename}: statement ${statementIndex + 1}/${statements.length}: ${statements[statementIndex].slice(0,500)} | ${getMigrationError(error)}`);
      }

      processedStatements += 1;
      const nextStatementIndex=statementIndex+1;
      if(nextStatementIndex < statements.length){
        await connection.query(
          'INSERT INTO schema_migration_steps (id, migration_id, checksum, statement_index) VALUES (1, ?, ?, ?) ON DUPLICATE KEY UPDATE migration_id=VALUES(migration_id), checksum=VALUES(checksum), statement_index=VALUES(statement_index)',
          [migration.filename, checksum, nextStatementIndex]
        );
        console.log(`[KTC][MIGRATION] progress saved: ${migration.filename} statement ${nextStatementIndex}/${statements.length}`);
        continue;
      }

      await connection.query('INSERT INTO schema_migrations (migration_id, checksum) VALUES (?, ?)',[migration.filename,checksum]);
      await connection.query('DELETE FROM schema_migration_steps WHERE id=1');
      const [remainingRows]=await connection.query('SELECT COUNT(*) AS count FROM schema_migrations WHERE migration_id IN (' + entries.map(()=>'?').join(',') + ')',[...entries.map(m=>m.filename)]);
      const appliedCount=Number(remainingRows?.[0]?.count || 0);
      const remaining=Math.max(0,entries.length-appliedCount);
      console.log(`[KTC][MIGRATION] applied: ${migration.filename}; remaining=${remaining}`);
    }

    console.log(`[KTC][MIGRATION] batch complete: processed=${processedStatements}; continue on next request`);
    return false;
  }finally{await connection.release();}
}

let cloudflareBootMigrationPromise=null;
function getCloudflareBootMigrationPromise(){
  const enabled=String(process.env.KTC_RUN_BUILD_DB_MIGRATIONS||'').toLowerCase()==='true';
  if(!isCloudflareWorker||!enabled) return null;
  if(!cloudflareBootMigrationPromise){
    cloudflareBootMigrationPromise=runPendingMigrations()
      .then(ok=>{
        cloudflareBootMigrationPromise=null;
        return ok;
      })
      .catch(error=>{
        cloudflareBootMigrationPromise=null;
        console.error(`[KTC][MIGRATION] Cloudflare boot migration failed: ${getMigrationError(error)}`,error);
        throw error;
      });
  }
  return cloudflareBootMigrationPromise;
}

async function runPendingMigrationsForRuntime(){
  const boot=getCloudflareBootMigrationPromise();
  return boot?boot:runPendingMigrations();
}

module.exports=runPendingMigrationsForRuntime;
if(require.main===module) runPendingMigrations().then(()=>process.exit(0)).catch(error=>{
  console.error(`[KTC][MIGRATION] fatal: ${getMigrationError(error)}`,error); process.exit(1);
});