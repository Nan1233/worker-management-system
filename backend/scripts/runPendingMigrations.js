'use strict';

const DEFAULT_REPOSITORY = 'Nan1233/worker-management-system';
const isCloudflareWorker = process.env.KTC_CLOUDFLARE_WORKER === 'true' || Boolean(globalThis.__KTC_CLOUDFLARE_WORKER);
// Outside the Worker this defaults to 'main', so a local `npm run db:migrate`
// with no KTC_MIGRATION_REF pulls migration SQL from the main branch and can
// apply it to whatever database .env points at. Both facts are invisible in the
// current output, so the resolved target is logged before anything is applied
// and a defaulted ref is called out.
const migrationRefExplicit = Boolean(String(process.env.KTC_MIGRATION_REF || '').trim());
const migrationRef = String(process.env.KTC_MIGRATION_REF || (isCloudflareWorker ? 'test' : 'main')).trim();
const repository = String(process.env.KTC_MIGRATION_REPOSITORY || DEFAULT_REPOSITORY).trim();
const rawBase = `https://raw.githubusercontent.com/${repository}/${migrationRef.replace(/[^A-Za-z0-9._-]/g, '')}`;

const EMBEDDED_MIGRATION_NAMES = [
  '001_core_master_schema.sql',
  '002_production_schema.sql',
  '003_machine_and_session_schema.sql',
  '004_sync_and_export_schema.sql',
  '005_entry_date_compatibility.sql',
  '006_extra_data_compatibility.sql',
  '007_production_formula_settings.sql',
  '026_product_standard_versions_prerequisite.sql',
  '027_notifications_runtime_columns.sql',
  '028_report_edit_proposals.sql',
  '029_temp_report_updated_by.sql',
  '030_report_kpi_calculated_columns.sql',
  '031_mai_standard_data_20260903.sql',
  '032_add_2801_lt_long_machine_20260908.sql',
  '034_non_product_work_process_20260907.sql',
  '035_gc_late_early_deduction_20260907.sql',
  '036_notifications_runtime_columns_20260908.sql',
  '037_production_reports_logical_duplicate_key_20260909.sql',
  '038_gc_deduction_types_exact_20260910.sql',
  '039_cvk_deduction_types_20260911.sql',
  '040_cvk_deduction_types_repair_20260914.sql',
  '041_machine_adjustment_fields_20260914.sql',
  '042_product_aliases_prerequisite.sql',
  '046_reset_gc_cut_long_master_20260924.sql',
  '047_gc_aliases_from_excel_20260924.sql',
  '048_gc_products_defects_from_excel_20260924.sql',
  '049_gc_machines_from_excel_20260924.sql',
  '050_remove_legacy_2801_lt_20260925.sql',
  '051_gc_long_no_standard_work_20260928.sql',
  '052_organization_accounts_and_positions_20261006.sql',
  '053_restore_gc_deduction_types_16_20261007.sql'
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

function migrationNumber(filename){
  return Number.parseInt(String(filename).split('_', 1)[0], 10);
}

// KTC_MIGRATION_MAX is a ceiling, not a target: migrations numbered above it are
// dropped from the inventory entirely, so they are never pending and never run.
// This is what makes unattended migration safe to switch on - the runner can be
// allowed to advance on its own up to a reviewed point and stop there, instead
// of running every remaining migration including the destructive master-data
// ones. Raise the ceiling once the next batch has been reviewed and backed up.
function resolveMigrationCeiling(){
  const raw = String(process.env.KTC_MIGRATION_MAX || '').trim();
  if(!raw) return null;
  const ceiling = Number.parseInt(raw, 10);
  if(!Number.isInteger(ceiling) || ceiling <= 0) throw new Error(`Invalid KTC_MIGRATION_MAX: ${raw}`);
  return ceiling;
}

// KTC_MIGRATION_INCLUDE is an explicit, reviewed allowlist of migration numbers
// (comma separated) that may run in addition to everything at or below the
// ceiling. It lets one reviewed, idempotent migration through without raising the
// ceiling past the unreviewed destructive ones in between.
function resolveMigrationIncludes(){
  const raw = String(process.env.KTC_MIGRATION_INCLUDE || '').trim();
  if(!raw) return new Set();
  const numbers = raw.split(',').map(part => part.trim()).filter(Boolean).map(part => Number.parseInt(part, 10));
  if(numbers.some(value => !Number.isInteger(value) || value <= 0)) throw new Error(`Invalid KTC_MIGRATION_INCLUDE: ${raw}`);
  return new Set(numbers);
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

  const ceiling = resolveMigrationCeiling();
  const includes = resolveMigrationIncludes();
  const totalNames = names.length;
  if(ceiling !== null){
    names = names.filter(name => {
      const number = migrationNumber(name);
      return Number.isInteger(number) && (number <= ceiling || includes.has(number));
    });
    if(!names.length) throw new Error(`KTC_MIGRATION_MAX=${ceiling} excluded every migration in the inventory of ${totalNames}.`);
    console.log(`[KTC][MIGRATION] ceiling KTC_MIGRATION_MAX=${ceiling}: ${names.length}/${totalNames} migrations eligible${includes.size ? ` (explicit include: ${[...includes].join(',')})` : ''}; the rest will not run`);
  }

  const inventory = validateMigrationInventory(normalizeMigrationEntries(
    names.map(name => ({name:String(name),type:'file',download_url:`${rawBase}/backend/migrations/${encodeURIComponent(String(name))}`}))
  ));
  return { ...inventory, ceiling };
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

// Statements that must share one connection: from a `SET @ktc_…` assignment through the closing
// `DEALLOCATE PREPARE`. A group that starts with `SET @ktc_` but cannot be closed is an error, not
// something to fall back from: running its statements one by one on whatever connection comes next
// would silently skip or break the conditional DDL.
const SESSION_GROUP_MEMBER=/^(?:SET\s+@ktc_|PREPARE\b|EXECUTE\b)/i;
const SESSION_GROUP_CLOSE=/^DEALLOCATE\s+PREPARE\b/i;
function findSessionGroup(statements,startIndex,migrationFilename=''){
  let first=startIndex;
  // Progress saved by an older runner may point into the middle of a group: restart at the group start
  // (the groups are idempotent: they re-read information_schema before changing anything).
  const isGroupStatement=(index)=>SESSION_GROUP_MEMBER.test(String(statements[index]||'').trim()) || SESSION_GROUP_CLOSE.test(String(statements[index]||'').trim());
  while(first>0 && isGroupStatement(first) && SESSION_GROUP_MEMBER.test(String(statements[first-1]||'').trim())) first-=1;
  if(!/^SET\s+@ktc_/i.test(String(statements[first]||'').trim())) return {first:startIndex,last:startIndex};
  for(let index=first+1; index<statements.length; index+=1){
    const statement=String(statements[index]||'').trim();
    if(SESSION_GROUP_CLOSE.test(statement)) return {first,last:index};
    if(!SESSION_GROUP_MEMBER.test(statement)) break;
  }
  throw new Error(`Migration ${migrationFilename}: statement ${first + 1} opens a session-bound SET @ktc_… group that is not closed by DEALLOCATE PREPARE`);
}

async function sha256(value){
  const bytes=new TextEncoder().encode(value);
  const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}

const MIGRATION_STATEMENTS_PER_INVOCATION = Math.max(1, Math.min(8, Number.parseInt(process.env.KTC_MIGRATION_BATCH_SIZE || '8', 10) || 8));

// KTC_MIGRATION_DRY_RUN=true: report which migrations a real run would apply, then stop. It only issues
// SELECT statements (it does not even create the tracking tables) and never executes migration SQL, so it can
// be pointed at a database to confirm "pending = exactly the reviewed migration" before anything is applied.
// Anything unexpected (unreadable state, a half-applied migration, a checksum that no longer matches) throws.
function isDryRunRequested(){
  return String(process.env.KTC_MIGRATION_DRY_RUN || '').trim().toLowerCase() === 'true';
}

async function dryRunPendingMigrations(connection,{entries,ceiling}){
  const read=async (sql,params)=>{
    if(!/^\s*SELECT\b/i.test(sql)) throw new Error(`Dry-run refuses to run a non-SELECT statement: ${String(sql).slice(0,80)}`);
    return connection.query(sql,params);
  };
  const tag='[KTC][MIGRATION][DRY-RUN]';
  let databaseName='unknown';
  try{
    const [rows]=await read('SELECT DATABASE() AS db_name');
    databaseName=String(rows?.[0]?.db_name || 'unknown');
  }catch(error){
    throw new Error(`${tag} cannot read the target database name: ${getMigrationError(error)}`);
  }
  console.log(`${tag} target: database=${databaseName} repository=${repository} ref=${migrationRef} ceiling=${ceiling === null ? 'none' : ceiling}`);

  let appliedRows;
  let stepRows;
  try{
    [appliedRows]=await read('SELECT migration_id, checksum FROM schema_migrations');
    [stepRows]=await read('SELECT id, migration_id, checksum, statement_index FROM schema_migration_steps WHERE id=1 LIMIT 1');
  }catch(error){
    throw new Error(`${tag} cannot read migration state (schema_migrations / schema_migration_steps): ${getMigrationError(error)}. Dry-run does not create these tables.`);
  }
  if(stepRows && stepRows[0]){
    throw new Error(`${tag} migration ${stepRows[0].migration_id} is half-applied (statement ${stepRows[0].statement_index}); finish or inspect it before planning anything else.`);
  }

  const appliedById=new Map((appliedRows || []).map(row=>[String(row.migration_id),String(row.checksum || '')]));
  const mismatched=[];
  for(const migration of entries){
    if(!appliedById.has(migration.filename)) continue;
    const stored=appliedById.get(migration.filename);
    if(!stored) throw new Error(`${tag} applied migration ${migration.filename} has no recorded checksum; stop and inspect migration history before planning anything else.`);
    const checksum=await sha256(await fetchText(migration.downloadUrl));
    if(checksum !== stored) mismatched.push(migration.filename);
  }
  if(mismatched.length){
    throw new Error(`${tag} checksum differs from what was applied for: ${mismatched.join(', ')} (ref=${migrationRef}). Stop and review before running anything.`);
  }

  const pending=entries.filter(migration=>!appliedById.has(migration.filename));
  console.log(`${tag} applied=${entries.length - pending.length} pending=${pending.length}`);
  let position=0;
  for(const migration of pending){
    position += 1;
    const sql=await fetchText(migration.downloadUrl);
    const statements=normalizeCloudflareMigrationStatements(sql,migration.filename);
    if(!statements.length) throw new Error(`${tag} migration has no executable SQL statements: ${migration.filename}`);
    for(let index=0; index<statements.length;){ index=findSessionGroup(statements,index,migration.filename).last + 1; }
    console.log(`${tag} pending[${position}]=${migration.filename} checksum=${await sha256(sql)} statements=${statements.length}`);
  }
  console.log(`${tag} nothing was executed`);
  return false;
}

async function runPendingMigrations(){
  const {entries,versions,ceiling}=loadMigrationManifest();
  const db=require('../config/db');
  const missingDb=typeof db.getMissingDatabaseVariables==='function'?db.getMissingDatabaseVariables():[];
  if(missingDb.length) throw new Error(`Migration database configuration missing: ${missingDb.join(', ')}`);
  const connection=await db.promise().getConnection();
  try{
    if(isDryRunRequested()) return await dryRunPendingMigrations(connection,{entries,ceiling});
    await connection.query('CREATE TABLE IF NOT EXISTS schema_migrations (migration_id VARCHAR(160) NOT NULL PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    await connection.query('CREATE TABLE IF NOT EXISTS schema_migration_steps (id TINYINT NOT NULL PRIMARY KEY, migration_id VARCHAR(160) NOT NULL, checksum CHAR(64) NOT NULL, statement_index INT NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)');
    console.log(`[KTC][MIGRATION] manifest loaded: ${entries.length} SQL files / ${versions.length} ordered migrations, ref=${migrationRef}`);

    let targetDatabase = 'unknown';
    try {
      const [databaseRows] = await connection.query('SELECT DATABASE() AS db_name');
      targetDatabase = String(databaseRows?.[0]?.db_name || 'unknown');
    } catch (_) {}
    console.log(`[KTC][MIGRATION] target: database=${targetDatabase} repository=${repository} ref=${migrationRef} batchSize=${MIGRATION_STATEMENTS_PER_INVOCATION} ceiling=${ceiling === null ? 'none' : ceiling}`);
    if (!migrationRefExplicit) {
      console.warn(`[KTC][MIGRATION] WARNING: KTC_MIGRATION_REF was not set and defaulted to "${migrationRef}". Set it explicitly so another branch's migrations cannot be applied to this database.`);
    }

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
        if(!migration){
          const stepNumber=migrationNumber(activeStep.migration_id);
          // Distinguish a genuinely unknown migration from one the ceiling hid:
          // resuming a half-applied migration that KTC_MIGRATION_MAX excludes
          // needs the ceiling raised, not the step state repaired.
          if(ceiling !== null && Number.isInteger(stepNumber) && stepNumber > ceiling){
            throw new Error(`Migration ${activeStep.migration_id} is half-applied but sits above KTC_MIGRATION_MAX=${ceiling}; raise the ceiling to finish it.`);
          }
          throw new Error(`Migration step state references unknown migration: ${activeStep.migration_id}`);
        }
        if(!pending.some(item=>item.filename===migration.filename)) throw new Error(`Migration step state references an already applied migration: ${migration.filename}`);
      } else {
        migration=pending[0];
      }

      if(!migration){
        console.log(ceiling === null
          ? `[KTC][MIGRATION] complete: ${entries.length} ordered migrations processed`
          : `[KTC][MIGRATION] complete up to ceiling KTC_MIGRATION_MAX=${ceiling}: ${entries.length} migrations applied; later migrations are held back`);
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

      // 032 was already partially executed on the test DB before its prerequisite
      // table fix was committed. Its writes are idempotent, so restart it safely.
      if(activeStep && String(activeStep.checksum||'') !== checksum){
        if(migration.filename === '032_add_2801_lt_long_machine_20260908.sql' ||
           migration.filename === '060_schema_gaps_encoding_updated_by_standard_source_20261022.sql'){
          // Both migrations are safe to restart from statement 1: 032 has its
          // existing recovery contract; 060 is only ADD COLUMN IF NOT EXISTS
          // (earlier drafts of 060 used PREPARE/MODIFY, which may have left progress behind).
          console.warn(`[KTC][MIGRATION] checksum changed for recoverable ${migration.filename}; resetting progress to statement 1`);
          statementIndex=0;
          await connection.query('UPDATE schema_migration_steps SET checksum=?, statement_index=0 WHERE id=1',[checksum]);
        }else{
          throw new Error(`Migration checksum changed while in progress: ${migration.filename}`);
        }
      }

      // A session-bound group (SET @ktc_… ; PREPARE … ; EXECUTE … ; DEALLOCATE PREPARE …) depends on
      // user variables and a prepared-statement handle that only exist on ONE connection. The runner
      // applies a bounded batch per invocation and may resume on a different connection, so such a
      // group must run to completion in this invocation as a single step.
      const group=findSessionGroup(statements,statementIndex,migration.filename);
      const groupEnd=group.last;
      statementIndex=group.first;

      console.log(`[KTC][MIGRATION] applying ${migration.filename}: statement ${statementIndex + 1}${groupEnd > statementIndex ? `-${groupEnd + 1}` : ''}/${statements.length}`);
      for(let index=statementIndex; index<=groupEnd; index+=1){
        try{
          await connection.query(statements[index]);
        }catch(error){
          throw new Error(`Migration failed: ${migration.filename}: statement ${index + 1}/${statements.length}: ${statements[index].slice(0,500)} | ${getMigrationError(error)}`);
        }
      }

      processedStatements += 1;
      const nextStatementIndex=groupEnd+1;
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

// Manual operator tool only. It must never run from the Worker, a build, or a server start.
// (Tests and operator scripts may call the export directly; inside a Worker it refuses.)
async function runPendingMigrationsForRuntime(){
  if(isCloudflareWorker) throw new Error('Automatic migrations are disabled: run scripts/runPendingMigrations.js manually after a backup (KTC_MANUAL_MIGRATION_CONFIRM=YES).');
  return runPendingMigrations();
}

function manualRunAllowed(){
  if(isDryRunRequested()) return true;
  return String(process.env.KTC_MANUAL_MIGRATION_CONFIRM||'')==='YES';
}

module.exports=runPendingMigrationsForRuntime;
if(require.main===module){
  if(!manualRunAllowed()){
    console.error('[KTC][MIGRATION] refused: set KTC_MANUAL_MIGRATION_CONFIRM=YES to run migrations manually (after a backup), or KTC_MIGRATION_DRY_RUN=true to preview.');
    process.exit(2);
  }
  runPendingMigrations().then(()=>process.exit(0)).catch(error=>{ console.error(`[KTC][MIGRATION] fatal: ${getMigrationError(error)}`,error); process.exit(1); });
}
