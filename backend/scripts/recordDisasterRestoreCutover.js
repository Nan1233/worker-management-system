'use strict';
const {assertCutoverEligibility,transition,safeFingerprint,calculateRecoveryMetrics}=require('../services/disasterRestoreLifecycleService');
const {readState,writeState}=require('../services/disasterRestoreStateStore');
function arg(name){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;}
function has(name){return process.argv.includes(name);}
function requireOperator(){if(arg('--confirm')!=='KTC_DISASTER_CUTOVER_RECORD') {const e=new Error('Thiếu cutover operator confirmation');e.code='CUTOVER_CONFIRMATION_REQUIRED';throw e;} if(String(process.env.KTC_MAINTENANCE_MODE||'').toUpperCase()!=='RESTORE'){const e=new Error('Maintenance mode RESTORE required');e.code='CUTOVER_MAINTENANCE_REQUIRED';throw e;} if(String(process.env.KTC_WORKERS_QUIESCED||'').toUpperCase()!=='YES'||String(process.env.KTC_JOBS_QUIESCED||'').toUpperCase()!=='YES'){const e=new Error('Workers/jobs must be quiesced');e.code='CUTOVER_QUIESCE_REQUIRED';throw e;}}
function ctx(){return {maintenanceMode:process.env.KTC_MAINTENANCE_MODE,workersQuiesced:process.env.KTC_WORKERS_QUIESCED,jobsQuiesced:process.env.KTC_JOBS_QUIESCED,target:{host:arg('--target-host')||process.env.KTC_CUTOVER_TARGET_HOST,port:arg('--target-port')||process.env.KTC_CUTOVER_TARGET_PORT||'4000',database:arg('--target-db')||process.env.KTC_CUTOVER_TARGET_DB,user:arg('--target-user')||process.env.KTC_CUTOVER_TARGET_USER||''},active:{host:arg('--active-host')||process.env.DB_HOST,port:arg('--active-port')||process.env.DB_PORT||'4000',database:arg('--active-db')||process.env.DB_NAME,user:arg('--active-user')||process.env.DB_USER||''}};}
async function main(){
  requireOperator(); const action=String(arg('--action')||'').toLowerCase(); if(!['eligible','start','complete','failed'].includes(action)){const e=new Error('action phải là eligible|start|complete|failed');e.code='CUTOVER_ACTION_INVALID';throw e;}
  const {file,state}=await readState({restoreId:arg('--restore-id'),stateFile:arg('--state-file')}); let next=state; const context=ctx();
  if(action==='eligible'){assertCutoverEligibility(state,context); next=transition(state,'CUTOVER_ELIGIBLE',{operatorAction:'CUTOVER_ELIGIBILITY_RECORDED'}); next.preCutoverActiveFingerprint=safeFingerprint(context.active);}
  if(action==='start'){next=transition(state,'CUTOVER_IN_PROGRESS',{operatorAction:'EXTERNAL_CUTOVER_STARTED'});}
  if(action==='complete'){next=transition(state,'ACTIVE',{operatorAction:'EXTERNAL_CUTOVER_COMPLETED'}); next.serviceRestoredAt=next.cutoverCompletedAt;}
  if(action==='failed'){next=transition(state,'CUTOVER_FAILED',{operatorAction:'EXTERNAL_CUTOVER_FAILED'}); next.cutoverFailureReason=arg('--reason')||'UNSPECIFIED';}
  await writeState(file,next); console.log(JSON.stringify({success:true,restore_id:next.restoreId,state:next.finalState,infrastructure_mutation:false,recovery_metrics:calculateRecoveryMetrics(next)},null,2));
}
main().catch(e=>{console.error(`[KTC][F16] Cutover record failed: ${e.code||e.message}`);process.exitCode=1;});
