'use strict';
const {cleanupPolicy}=require('../services/disasterRestoreLifecycleService');
const {readState}=require('../services/disasterRestoreStateStore');
function arg(name){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;}
async function main(){const {state}=await readState({restoreId:arg('--restore-id'),stateFile:arg('--state-file')}); const policy=cleanupPolicy(state,{minRetentionHours:Number(arg('--min-retention-hours')||168)}); console.log(JSON.stringify({success:true,restore_id:state.restoreId,state:state.finalState,cleanup:policy,automatic_drop:false,manual_cleanup_only:true},null,2));}
main().catch(e=>{console.error(`[KTC][F16] Cleanup check failed: ${e.code||e.message}`);process.exitCode=1;});
