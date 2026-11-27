'use strict';
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const fsSync = require('node:fs');
const path = require('node:path');
const { operationIdForChange } = require('./excelDbSyncController.cjs');

function sameImportVersion(before, after) {
  return Boolean(before && after) && before.size === after.size
    && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs
    && before.ino === after.ino && before.dev === after.dev;
}
function importVersion(stat) {
  return JSON.stringify([stat.size, stat.mtimeMs, stat.ctimeMs, stat.ino, stat.dev]);
}
function sourceChangedError() {
  const error = new Error('File Excel đã được lưu lại trong lúc import. Không ghi đè; hãy xem trước và import bản mới nhất.');
  error.code = 'KTC_EXCEL_IMPORT_CHANGED';
  return error;
}

// Handlers are registered only through the caller's trusted IPC sender guard.
function createDesktopExcelIpcHandlers({
  getDateParts, writeLog, waitForUsableRendererToken, enqueueManualExcelSync,
  normalizeError, previewEditedExcelFilesToDb, syncEditedExcelFilesToDb,
  setCurrentToken, dialog, getMainWindow, assertImportFileSize,
  readExcelChanges, reportImportPreviewGuard, postExcelChanges,
}) {
async function handleManualExcelSync(payload) {
  const request = payload || {};
  const date = request.date || getDateParts().date;
  const startedAt = Date.now();
  await writeLog('INFO', 'MANUAL_EXCEL_SYNC_REQUESTED', { date });
  try {
    const token = await waitForUsableRendererToken(request.token || '', 8_000);
    if (!token) {
      throw new Error('Chưa tìm thấy phiên đăng nhập. Hãy đăng xuất, đăng nhập lại rồi thử cập nhật Excel.');
    }
    await writeLog('INFO', 'MANUAL_EXCEL_TOKEN_RESOLVED', { date });
    const result = await enqueueManualExcelSync({ date, source: 'manual', token });
    await writeLog(result?.success ? 'INFO' : 'WARN', 'MANUAL_EXCEL_SYNC_FINISHED', {
      date,
      success: Boolean(result?.success),
      skipped: Boolean(result?.skipped),
      code: result?.code || null,
      elapsedMs: Date.now() - startedAt
    });
    return result;
  } catch (error) {
    await writeLog('ERROR', 'MANUAL_EXCEL_SYNC_FAILED', {
      date,
      elapsedMs: Date.now() - startedAt,
      ...normalizeError(error)
    });
    throw error;
  }
}


async function handlePreviewExcelDbSync(payload = {}) {
  const token = await waitForUsableRendererToken(payload.token || '', 8_000);
  if (!token) throw new Error('Chưa tìm thấy phiên đăng nhập. Hãy đăng nhập lại rồi thử.');
  setCurrentToken(token);
  const yearMonth = /^\d{4}-\d{2}$/.test(String(payload.yearMonth || '')) ? String(payload.yearMonth) : '';
  const result = await previewEditedExcelFilesToDb({ yearMonth, previewOwner: createHash('sha256').update(token).digest('hex') });
  await writeLog('INFO', 'MANUAL_EXCEL_DB_PREVIEW', { yearMonth, detected: result.detected });
  return result;
}

async function handleApplyExcelDbSync(payload = {}) {
  const token = await waitForUsableRendererToken(payload.token || '', 8_000);
  if (!token) throw new Error('Chưa tìm thấy phiên đăng nhập. Hãy đăng nhập lại rồi thử.');
  setCurrentToken(token);
  const yearMonth = /^\d{4}-\d{2}$/.test(String(payload.yearMonth || '')) ? String(payload.yearMonth) : '';
  const result = await syncEditedExcelFilesToDb({ source: 'manual-db-sync', yearMonth, previewOwner: createHash('sha256').update(token).digest('hex') });
  const months = Array.isArray(result.changedMonths) ? result.changedMonths : [];
  for (const month of months) {
    if (yearMonth && month !== yearMonth) continue;
    await enqueueManualExcelSync({ date: `${month}-01`, source: 'excel-db-rebuild', token }).catch((error) =>
      writeLog('ERROR', 'EXCEL_DB_REBUILD_FAILED', { yearMonth: month, ...normalizeError(error) })
    );
  }
  await writeLog(result.failed ? 'WARN' : 'INFO', 'MANUAL_EXCEL_DB_APPLY_FINISHED', {
    yearMonth, detected: result.detected, succeeded: result.succeeded, failed: result.failed
  });
  return result;
}


async function handlePreviewReportImport(payload = {}) {
  const token = await waitForUsableRendererToken(payload.token || '', 8_000);
  if (!token) throw new Error('Chưa tìm thấy phiên đăng nhập. Hãy đăng nhập lại rồi thử.');
  setCurrentToken(token);
  reportImportPreviewGuard.clear();
  const picked = await dialog.showOpenDialog(getMainWindow(), {
    title: 'Import báo cáo Excel vào KTC',
    properties: ['openFile'],
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  });
  if (picked.canceled || !picked.filePaths?.[0]) return { canceled: true, detected: 0, changes: [] };
  const filePath = path.resolve(picked.filePaths[0]);
  const stat = await fs.stat(filePath);
  assertImportFileSize(stat);
  const parsed = await readExcelChanges(filePath);
  if (!parsed?.managed) {
    const error = new Error('File này không phải workbook KTC có metadata đồng bộ. Hãy dùng file được xuất từ KTC hoặc template import KTC.');
    error.code = 'KTC_IMPORT_UNMANAGED_WORKBOOK';
    throw error;
  }
  const changes = Array.isArray(parsed.changes) ? parsed.changes : [];
  if (!sameImportVersion(stat, await fs.stat(filePath).catch(() => null))) throw sourceChangedError();
  reportImportPreviewGuard.remember(filePath, importVersion(stat));
  await writeLog('INFO', 'REPORT_IMPORT_PREVIEW', {
    filePath,
    yearMonth: parsed.yearMonth || null,
    detected: changes.length,
    creates: changes.filter((item) => item?.create === true).length,
    updates: changes.filter((item) => item?.create !== true).length
  });
  return {
    canceled: false,
    filePath,
    fileName: path.basename(filePath),
    yearMonth: parsed.yearMonth || null,
    detected: changes.length,
    creates: changes.filter((item) => item?.create === true).length,
    updates: changes.filter((item) => item?.create !== true).length,
    changes
  };
}

async function handleApplyReportImport(payload = {}) {
  const token = await waitForUsableRendererToken(payload.token || '', 8_000);
  if (!token) throw new Error('Chưa tìm thấy phiên đăng nhập. Hãy đăng nhập lại rồi thử.');
  setCurrentToken(token);
  const filePath = reportImportPreviewGuard.assertAllowed(payload.filePath);
  if (!filePath.toLowerCase().endsWith('.xlsx') || !fsSync.existsSync(filePath)) throw new Error('File import không còn tồn tại.');
  const stat = await fs.stat(filePath);
  assertImportFileSize(stat);
  reportImportPreviewGuard.assertVersion(filePath, importVersion(stat));
  const parsed = await readExcelChanges(filePath);
  if (!parsed?.managed) throw new Error('File import không còn đúng contract KTC. Hãy xuất lại file từ DB trước.');
  const afterRead = await fs.stat(filePath).catch(() => null);
  if (!sameImportVersion(stat, afterRead)) throw sourceChangedError();
  const changes = Array.isArray(parsed.changes) ? parsed.changes : [];
  if (!changes.length) return { detected: 0, succeeded: 0, failed: 0, filePath, yearMonth: parsed.yearMonth || null };
  const beforePost = await fs.stat(filePath).catch(() => null);
  if (!sameImportVersion(stat, beforePost)) throw sourceChangedError();
  const workbookIdentity = { file: path.resolve(filePath), generatedAt: parsed.generatedAt || null, yearMonth: parsed.yearMonth || null };
  const pending = changes.map(change => ({ ...change, operation_id: operationIdForChange(change, workbookIdentity) }));
  const ids = pending.filter(change => change.create !== true).map(change => Number(change.id));
  if (ids.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length || new Set(pending.map(change => change.operation_id)).size !== pending.length) {
    throw new Error('Workbook có ID báo cáo hoặc mã thao tác không hợp lệ/trùng lặp. Không import.');
  }
  let succeeded = 0;
  let failed = 0;
  const results = [];
  for (let index = 0; index < pending.length; index += 100) {
    if (!sameImportVersion(stat, await fs.stat(filePath).catch(() => null))) {
      failed += pending.length - index;
      break;
    }
    const chunk = pending.slice(index, index + 100);
    try {
      const response = await postExcelChanges(chunk);
      succeeded += response.succeeded;
      failed += response.failed;
      results.push(...response.results);
      if (response.failed > 0) {
        failed += pending.length - index - chunk.length;
        break;
      }
    } catch (error) {
      failed += pending.length - index;
      await writeLog('ERROR', 'REPORT_IMPORT_BATCH_FAILED', { filePath, ...normalizeError(error) });
      break;
    }
  }
  const sourceChanged = !sameImportVersion(stat, await fs.stat(filePath).catch(() => null));
  // A partial import or changed source must never trigger a rebuild that
  // overwrites unsynced rows. Retrying is safe thanks to operation receipts.
  // The user can retry using the exact same workbook; operation receipts make
  // successfully applied rows safe to acknowledge again.
  if (!sourceChanged && failed === 0 && succeeded === changes.length) {
    // Import can be from a copied workbook outside the export root. Never
    // overwrite a different managed workbook before checking its pending edits.
    // The regular watcher/manual DB sync owns managed workbook regeneration.
    reportImportPreviewGuard.consume(filePath);
  } else {
    await writeLog('WARN', 'REPORT_IMPORT_PARTIAL_NO_REBUILD', {
      filePath, detected: changes.length, succeeded, failed, sourceChanged
    });
  }
  await writeLog(failed ? 'WARN' : 'INFO', 'REPORT_IMPORT_APPLY', {
    filePath,
    yearMonth: parsed.yearMonth || null,
    detected: changes.length,
    succeeded,
    failed
  });
  return { detected: changes.length, succeeded, failed, sourceChanged,
    results, filePath, yearMonth: parsed.yearMonth || null };
}


  return {
    handleManualExcelSync, handlePreviewExcelDbSync, handleApplyExcelDbSync,
    handlePreviewReportImport, handleApplyReportImport,
  };
}
module.exports = { createDesktopExcelIpcHandlers };
