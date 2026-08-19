'use strict';
const {assertCutoverEligibility,calculateRecoveryMetrics}=require('../services/disasterRestoreLifecycleService');
const {readState}=require('../services/disasterRestoreStateStore');
function arg(name){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;}
function context(){return {
  maintenanceMode:process.env.KTC_MAINTENANCE_MODE,
  workersQuiesced:process.env.KTC_WORKERS_QUIESCED,
  jobsQuiesced:process.env.KTC_JOBS_QUIESCED,
  target:{host:arg('--target-host')||process.env.KTC_CUTOVER_TARGET_HOST,port:arg('--target-port')||process.env.KTC_CUTOVER_TARGET_PORT||'4000',database:arg('--target-db')||process.env.KTC_CUTOVER_TARGET_DB,user:arg('--target-user')||process.env.KTC_CUTOVER_TARGET_USER||''},
  active:{host:arg('--active-host')||process.env.DB_HOST,port:arg('--active-port')||process.env.DB_PORT||'4000',database:arg('--active-db')||process.env.DB_NAME,user:arg('--active-user')||process.env.DB_USER||''},
};}
async function main(){
  const {state}=await readState({restoreId:arg('--restore-id'),stateFile:arg('--state-file')});
  const eligibility=assertCutoverEligibility(state,context());
  console.log(JSON.stringify({success:true,restore_id:state.restoreId,state:state.finalState,cutover:'ELIGIBLE_BUT_NOT_PERFORMED',proposed_next_state:'CUTOVER_ELIGIBLE',target:eligibility.target,current_active:eligibility.currentActive,recovery_metrics:calculateRecoveryMetrics(state),infrastructure_mutation:false},null,2));
}
main().catch(e=>{console.error(`[KTC][F16] Cutover check failed: ${e.code||e.message}${e.details?.failures?` ${e.details.failures.join(',')}`:''}`);process.exitCode=1;});
