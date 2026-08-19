'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

function stateDir() { return path.resolve(process.env.KTC_RESTORE_STATE_DIR || path.join(os.tmpdir(), 'ktc-restore-state')); }
function validateRestoreId(id) {
  const value=String(id||'').trim();
  if(!/^restore_[A-Za-z0-9_-]+$/.test(value)) { const e=new Error('restore_id không hợp lệ'); e.code='RESTORE_ID_INVALID'; throw e; }
  return value;
}
function resolveStateFile({restoreId,stateFile}={}) {
  if(stateFile) return path.resolve(stateFile);
  return path.join(stateDir(), `${validateRestoreId(restoreId)}.json`);
}
async function readState(options={}) {
  const file=resolveStateFile(options);
  try { return {file,state:JSON.parse(await fs.readFile(file,'utf8'))}; }
  catch(e){ const err=new Error('Restore state file không hợp lệ/không tồn tại'); err.code='RESTORE_STATE_INVALID'; throw err; }
}
async function writeState(file,state){ await fs.mkdir(path.dirname(file),{recursive:true}); await fs.writeFile(file,JSON.stringify(state,null,2),'utf8'); }
module.exports={stateDir,validateRestoreId,resolveStateFile,readState,writeState};
