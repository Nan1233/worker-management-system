'use strict';

// Check the active module boundaries, not the retired monolithic main/workbook
// implementation. Real XLSX roundtrip and synthetic diff tests are separate
// mandatory CI steps; these assertions preserve the wiring/security contract.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root=path.join(__dirname,'..','electron');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const main=read('main.cjs');
const preload=read('preload.cjs');
const workbook=read('monthlyWorkbookLocal.cjs');
const builders=read('monthlyWorkbookBuilders.cjs');
const metadata=read('monthlyWorkbookSyncMetadata.cjs');
const worker=read('workerReportWorkbook.cjs');
const workerMetadata=read('workerReportSyncMetadata.cjs');
const helper=read('monthlyWorkbookGcHelper.cjs');
const sync=read('excelDbSync.cjs');
const values=read('excelDbSyncValues.cjs');
const handlers=read('desktopExcelIpcHandlers.cjs');
const controller=read('excelDbSyncController.cjs');
const transport=read('excelSyncTransport.cjs');
const exporter=read('monthlyDesktopExport.cjs');
const authority=read('monthlyWorkbookReportData.cjs');
const atomic=read('excelAtomicFileWriter.cjs');
const coordinator=read('desktopSyncCoordinator.cjs');
const monitor=read('desktopRendererMonitoring.cjs');

assert.match(sync,/require\(['"]\.\/excelDbSyncValues\.cjs['"]\)/,'Excel sync must share value normalization');
assert.match(workbook,/require\('\.\/monthlyWorkbookSyncMetadata\.cjs'\)/);
assert.match(workbook,/createMonthlyWorkbookBuilders\(\{/);
assert.match(builders,/addExcelDbSyncMetadata\(original\.workbook,/);
assert.match(worker,/addWorkerReportSyncMetadata\(workbook,sheet,/);
for(const producer of [metadata,workerMetadata]){
  assert.match(producer,/addWorksheet\('_KTC_SYNC'\)/);
  assert.match(producer,/\.state\s*=\s*'veryHidden'/);
  assert.match(producer,/expected_updated_at/);
  assert.match(producer,/original_json/);
  assert.match(producer,/EXCEL_SYNC_CONTRACT_VERSION/);
}
assert.match(sync,/getWorksheet\('_KTC_SYNC'\)/);
assert.match(sync,/EXCEL_SYNC_CONTRACT_OUTDATED/);
assert.match(sync,/EXCEL_SYNC_DUPLICATE_META_ID/);
assert.match(sync,/expected_updated_at:\s*reportMeta\.expectedUpdatedAt/);
assert.match(transport,/\/production\/excel-sync/);
assert.match(transport,/method:\s*'POST'/);
assert.match(transport,/EXCEL_DB_SYNC_UNVERIFIED_ACK/);
assert.match(controller,/createExcelSyncTransport\(\{/);
assert.match(controller,/await postExcelChanges\(chunk\)/);

for(const [name,handler] of [['preview','handlePreviewExcelDbSync'],['apply','handleApplyExcelDbSync']]){
  assert.match(main,new RegExp("ipcMain\\.handle\\('ktc-"+name+"-excel-db-sync', protectedDesktopIpc\\("));
  assert.ok(main.includes(handler),'Missing trusted IPC handler '+handler);
  assert.ok(preload.includes("ipcRenderer.invoke('ktc-"+name+"-excel-db-sync'"),'Missing preload '+name);
}
assert.match(handlers,/await previewEditedExcelFilesToDb\(\{ yearMonth \}\)/);
assert.match(handlers,/await syncEditedExcelFilesToDb\(\{ source: 'manual-db-sync', yearMonth \}\)/);
assert.match(handlers,/reportImportPreviewGuard\.assertAllowed\(payload\.filePath\)/);
assert.match(handlers,/reportImportPreviewGuard\.assertVersion\(filePath, importVersion\(stat\)\)/);
assert.match(handlers,/if \(!sourceChanged && failed === 0 && succeeded === changes\.length\)/);
assert.doesNotMatch([main,coordinator,monitor].join('\n'),/setInterval\([\s\S]{0,100}syncEditedExcelFilesToDb|startExcelDbSyncWatcher/);
assert.doesNotMatch(exporter,/\bpostExcelChanges\(|\bsyncEditedExcelFilesToDb\(/);
assert.match(exporter,/assertApprovedDatabasePayload\(companyData\)/);
assert.match(authority,/payload\.dataSource !== APPROVED_DATA_SOURCE/);
assert.match(authority,/report\?\.isApprovedDatabaseRecord !== true/);
assert.match(exporter,/EXCEL_EXPORT_UNSYNCED_EDITS/);
assert.match(exporter,/isAcknowledgedWorkbookVersion\(filePath, stat\)/);
assert.match(exporter,/atomicOverwrite\(filePath, processBuilt\.buffer, date, \{beforeReplace\}\)/);
assert.match(atomic,/await options\.beforeReplace\(filePath, guardedStat\)/);
assert.match(atomic,/KTC_EXCEL_CONCURRENT_MODIFICATION/);
assert.match(controller,/if \(!sameFileVersion\(beforePost, stat\)\)/);
assert.match(controller,/if \(!sameFileVersion\(current, stat\)\)/);
assert.match(controller,/acknowledgedStat:\s*!fileFailed && !changedDuringSync \? stat : null/);

assert.match(sync,/preview/);
assert.match(sync,/SL OK/);
assert.match(values,/Missing Excel columns mean/);
assert.match(values,/preserved/);
assert.match(sync,/if \(!preview\.length\) continue/);
assert.match(sync,/patch: changedPatch/);
assert.match(values,/function stableValue\(/);
assert.match(values,/JSON\.stringify\(stableValue\(a\)\)/);
// Detect machine-field edits, then reject protected machine-line changes;
// do not silently drop these diffs or pretend that they are editable.
assert.doesNotMatch(sync,/operationMode === 'MACHINE'\) return patch/);
assert.match(sync,/EXCEL_SYNC_MACHINE_LINE_READ_ONLY/);
assert.match(sync,/EXCEL_SYNC_TRAINING_READ_ONLY/);
assert.match(sync,/EXCEL_SYNC_UNMAPPED_COLUMN_READ_ONLY/);

assert.match(helper,/TAY MÁY CẮT LỒNG/);
assert.match(builders,/addGcModeHelperSheet\(original\.workbook,/);
assert.match(helper,/STT số nguyên dương/);
assert.match(sync,/STT số nguyên dương/);
assert.match(sync,/parseGcHelperSheet\(workbook\)/);
assert.match(sync,/gcMissingFields\(/);
assert.match(sync,/Dòng mới CẮT\/LỒNG thiếu/);
assert.match(helper,/MAX_AUTO_SOURCE_ROW/);
assert.match(helper,/fullCalcOnLoad/);
assert.match(values,/value && typeof value === 'object' && value\.result !== undefined/);
console.log('[KTC] Excel <-> DB manual preview/apply contract OK (active modules)');
