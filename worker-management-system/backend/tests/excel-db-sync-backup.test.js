const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

test('approved report updates use shared enterprise edit service',()=>{
  const controller=read('controllers/productionController.js');
  assert.match(controller,/updateApprovedReport/);
  const service=read('services/approvedReportEditService.js');
  assert.match(service,/REPORT_VERSION_CONFLICT/);
  assert.match(service,/REPORTING_PERIOD_LOCKED/);
  assert.match(service,/REPORT_UPDATED_FROM_EXCEL/);
  assert.match(service,/training_percent/);
});

test('Excel edit sync is manager-admin only and uses optimistic concurrency',()=>{
  const routes=read('routes/productionRoutes.js');
  assert.match(routes,/"\/excel-sync"/);
  assert.match(routes,/checkRole\("admin", "manager"\)/);
  const controller=read('controllers/excelEditSyncController.js');
  assert.match(controller,/expectedUpdatedAt/);
  assert.match(controller,/source: 'excel'/);
});

test('database backup has checksum retention and guarded restore',()=>{
  const backup=read('scripts/createDatabaseBackup.js');
  assert.match(backup,/REPEATABLE READ/);
  assert.match(backup,/sha256File/);
  assert.match(backup,/pruneRetention/);
  const restore=read('scripts/disasterRestoreDatabase.js');
  const policy=read('services/disasterRestorePolicyService.js');
  assert.match(policy,/KTC_DISASTER_RESTORE_STAGE/);
  assert.match(restore,/verifyBackupArtifact/);
  assert.match(restore,/VERIFIED_NOT_ACTIVATED/);
  assert.doesNotMatch(restore,/--replace/);
});
