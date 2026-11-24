'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

// Same workbook change retains this identity across restarts and HTTP retries.
// A fresh workbook export receives a different generatedAt identifier.
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}
function operationIdForChange(change, workbookIdentity = null) {
  const action = change?.create === true
    ? { create: true, row: change.row, data: change.data, invalid: Boolean(change.invalid), source: change.source || null }
    : { id: change.id, expected_updated_at: change.expected_updated_at, patch: change.patch, source: change.source || null };
  return crypto.createHash('sha256').update(JSON.stringify(stable({ action, workbookIdentity }))).digest('hex');
}

function sameFileVersion(a, b) {
  return Boolean(a && b) && ['size', 'mtimeMs', 'ctimeMs', 'ino', 'dev'].every(key => a[key] === b[key]);
}

function createExcelDbSyncController({
  authenticatedFetch, API_BASE_URL, listExcelFiles, getExportRoot, readExcelChanges,
  writeLog, normalizeError, waitForUsableRendererToken, sendRenderer,
  enqueueManualExcelSync, isQuitting, isSyncRunning,
}) {
  let excelDbSyncRunning = false;
  const excelDbSyncState = new Map();
  // Keep acknowledged months pending until every workbook can be read safely.
  const pendingRebuildMonths = new Set();
async function postExcelChanges(changes) {
  if (!Array.isArray(changes) || changes.length < 1 || changes.length > 200) throw new Error('Số thay đổi Excel không hợp lệ');
  const withIds = changes.map((change) => ({
    ...change, operation_id: change.operation_id || operationIdForChange(change)
  }));
  if (new Set(withIds.map(change => change.operation_id)).size !== withIds.length) throw new Error('Trùng mã thao tác Excel');
  const response = await authenticatedFetch(`${API_BASE_URL}/production/excel-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changes: withIds })
  });
  if (response.status === 401 || response.status === 403) {
    const error = new Error('Tài khoản hiện tại không có quyền đồng bộ chỉnh sửa Excel về DB.');
    error.code = 'EXCEL_DB_SYNC_FORBIDDEN';
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  if (![200, 207].includes(response.status)) throw new Error(payload.message || `Đồng bộ Excel về DB lỗi HTTP ${response.status}`);
  // Validate every acknowledgment here, including requests sent from the
  // manual import screen. Never rebuild an Excel file on an ambiguous response.
  const validCounts = [payload.total, payload.succeeded, payload.failed].every(
    (value) => Number.isSafeInteger(value) && value >= 0
  );
  const expectedChanges = new Map(withIds.map((change) => [change.operation_id, change]));
  const expectedIds = new Set(expectedChanges.keys());
  const acknowledged = new Set();
  let successCount = 0;
  let failureCount = 0;
  let validRows = Array.isArray(payload.results) && payload.results.length === withIds.length;
  for (const item of (validRows ? payload.results : [])) {
    if (!item || typeof item !== 'object' || Array.isArray(item)
        || typeof item.operation_id !== 'string'
        || !expectedIds.has(item.operation_id) || acknowledged.has(item.operation_id)) {
      validRows = false;
      break;
    }
    acknowledged.add(item.operation_id);
    if (item.success === true) {
      if (!Number.isSafeInteger(Number(item.id)) || Number(item.id) <= 0
          || typeof item.updated_at !== 'string' || !Number.isFinite(Date.parse(item.updated_at))
          || (expectedChanges.get(item.operation_id).create !== true && Number(item.id) !== Number(expectedChanges.get(item.operation_id).id))
          || (expectedChanges.get(item.operation_id).create === true && item.create !== true)) {
        validRows = false;
        break;
      }
      successCount += 1;
    } else if (item.success === false) {
      failureCount += 1;
    } else {
      validRows = false;
      break;
    }
  }
  if (!validCounts || !validRows || acknowledged.size !== expectedIds.size
      || payload.total !== withIds.length || payload.succeeded !== successCount
      || payload.failed !== failureCount || (response.status === 200 && failureCount > 0)
      || payload.success !== (failureCount === 0)) {
    const error = new Error('Backend trả biên nhận Excel không đầy đủ hoặc mâu thuẫn; giữ nguyên file để thử lại.');
    error.code = 'EXCEL_DB_SYNC_UNVERIFIED_ACK';
    throw error;
  }
  return payload;
}


async function previewEditedExcelFilesToDb({ yearMonth = '' } = {}) {
  const files = await listExcelFiles(getExportRoot());
  const changes = [];
  const helperUpdatedFiles = [];
  const helperUpdateErrors = [];
  for (const filePath of files) {
    let parsed;
    try {
      parsed = await readExcelChanges(filePath);
    } catch (error) {
      await writeLog('WARN', 'EXCEL_DB_PREVIEW_READ_SKIPPED', { filePath, ...normalizeError(error) });
      continue;
    }
    if (!parsed?.managed) continue;
    if (parsed.helperUpdated) helperUpdatedFiles.push(path.basename(filePath));
    if (parsed.helperUpdateError) helperUpdateErrors.push({ file: path.basename(filePath), message: parsed.helperUpdateError });
    if (!Array.isArray(parsed.changes)) {
      helperUpdateErrors.push({ file: path.basename(filePath), message: 'Workbook changes payload is invalid' });
      continue;
    }
    if (!parsed.changes.length) continue;
    if (yearMonth && parsed.yearMonth !== yearMonth) continue;
    const previewIds = parsed.changes.filter((change) => change?.create !== true).map((change) => Number(change?.id));
    if (previewIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
        || new Set(previewIds).size !== previewIds.length) {
      helperUpdateErrors.push({ file: path.basename(filePath), message: 'Duplicate or invalid report IDs' });
      continue;
    }
    for (const change of parsed.changes) {
      changes.push({
        ...change,
        filePath,
        yearMonth: parsed.yearMonth || null
      });
    }
  }
  return {
    detected: changes.length,
    changes,
    yearMonth: yearMonth || null,
    helperUpdatedFiles,
    helperUpdateErrors
  };
}

async function syncEditedExcelFilesToDb({ source = 'watcher', yearMonth = '' } = {}) {
  if (excelDbSyncRunning || isQuitting()) return { skipped: true };
  excelDbSyncRunning = true;
  try {
    const token = await waitForUsableRendererToken('', 2_000);
    if (!token) return { skipped: true, reason: 'no-token' };
    if (isQuitting()) return { skipped: true, reason: 'quitting' };
    const files = await listExcelFiles(getExportRoot());
    let detected = 0;
    let succeeded = 0;
    let failed = 0;
    const changedMonths = new Set();
    const blockedMonths = new Set();
    let unreadableWorkbook = false;
    for (const filePath of files) {
      let stat;
      try { stat = await fs.stat(filePath); } catch (error) {
        unreadableWorkbook = true;
        await writeLog('WARN', 'EXCEL_DB_SYNC_STAT_FAILED', { filePath, source, ...normalizeError(error) });
        continue;
      }
      const state = excelDbSyncState.get(filePath) || { mtimeMs: 0, versions: new Map() };
      if (sameFileVersion(state.stat, stat)) continue;
      let parsed;
      try {
        parsed = await readExcelChanges(filePath);
      } catch (error) {
        // File đang mở/đang save có thể tạm thời không đọc được; vòng sau sẽ thử lại.
        unreadableWorkbook = true;
        await writeLog('WARN', 'EXCEL_DB_SYNC_READ_SKIPPED', { filePath, source, ...normalizeError(error) });
        continue;
      }
      if (!parsed?.managed) {
        const latest = await fs.stat(filePath).catch(() => null);
        if (sameFileVersion(latest, stat)) {
          excelDbSyncState.set(filePath, { ...state, stat });
        } else unreadableWorkbook = true;
        continue;
      }
      if (yearMonth && (!parsed.yearMonth || parsed.yearMonth !== yearMonth)) {
        if (!parsed.yearMonth) unreadableWorkbook = true;
        continue;
      }
      if (!Array.isArray(parsed.changes) || parsed.changes.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
        unreadableWorkbook = true;
        await writeLog('WARN', 'EXCEL_DB_SYNC_INVALID_WORKBOOK_CHANGES', { filePath, source });
        continue;
      }
      if (!parsed.changes.length) {
        const latest = await fs.stat(filePath).catch(() => null);
        if (sameFileVersion(latest, stat)) {
          excelDbSyncState.set(filePath, { ...state, stat });
        } else unreadableWorkbook = true;
        continue;
      }
      // Avoid mutating the parser's workbook-derived objects. Reconciliation
      // metadata belongs to this request, not to the original snapshot.
      const workbookIdentity = { file: path.resolve(filePath), generatedAt: parsed.generatedAt || null, yearMonth: parsed.yearMonth || null };
      const workbookChanges = parsed.changes.map((change) => ({
        ...change, operation_id: operationIdForChange(change, workbookIdentity)
      }));
      for (const change of workbookChanges) {
        const reportId = Number(change.id);
        // Never substitute a cached version for the workbook's concurrency
        // token: it may belong to a different snapshot of the same report.
        if (change.create !== true && !change.expected_updated_at) {
          await writeLog('WARN', 'EXCEL_DB_SYNC_MISSING_VERSION', { filePath, reportId });
        }
      }
      if (workbookChanges.some((change) => change.create !== true && !change.expected_updated_at)) {
        detected += workbookChanges.length;
        failed += workbookChanges.length;
        unreadableWorkbook = true;
        continue;
      }
      const allIds = workbookChanges.filter((change) => change.create !== true).map((change) => Number(change.id));
      if (allIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
          || new Set(allIds).size !== allIds.length
          || new Set(workbookChanges.map((change) => change.operation_id)).size !== workbookChanges.length) {
        detected += workbookChanges.length;
        failed += workbookChanges.length;
        unreadableWorkbook = true;
        await writeLog('WARN', 'EXCEL_DB_SYNC_INVALID_REPORT_IDS', {
          filePath, source, count: workbookChanges.length
        });
        continue;
      }
      // Never send a snapshot that was already superseded while ExcelJS was
      // reading the workbook. The next sync pass must read the newer file.
      const beforePost = await fs.stat(filePath).catch(() => null);
      if (!sameFileVersion(beforePost, stat)) {
        unreadableWorkbook = true;
        await writeLog('WARN', 'EXCEL_DB_SYNC_CHANGED_DURING_READ', { filePath, source });
        continue;
      }
      detected += workbookChanges.length;
      const parsedMonth = String(parsed.yearMonth || '');
      let fileFailed = false;
      for (let index = 0; index < workbookChanges.length; index += 100) {
        const chunk = workbookChanges.slice(index, index + 100);
        const current = await fs.stat(filePath).catch(() => null);
        if (!sameFileVersion(current, stat)) {
          fileFailed = true;
          failed += workbookChanges.length - index;
          await writeLog('WARN', 'EXCEL_DB_SYNC_CHANGED_BETWEEN_BATCHES', { filePath, source });
          break;
        }
        try {
          const result = await postExcelChanges(chunk);
          const batchSucceeded = Number(result.succeeded || 0);
          const batchFailed = Number(result.failed || 0);
          const countsValid = Number.isSafeInteger(batchSucceeded) && batchSucceeded >= 0
            && Number.isSafeInteger(batchFailed) && batchFailed >= 0;
          if (!countsValid) {
            fileFailed = true;
            await writeLog('WARN', 'EXCEL_DB_SYNC_INVALID_COUNTS', { filePath, source });
          }
          if (batchFailed > 0 || !Array.isArray(result.results)
              || batchSucceeded + batchFailed !== chunk.length
              || (Array.isArray(result.results) && result.results.length !== chunk.length)) {
            fileFailed = true;
          }
          const expectedIds = new Set(chunk.map((change) => change.operation_id));
          const acknowledgedIds = new Set();
          const verifiedVersions = new Map();
          for (const item of (Array.isArray(result.results) ? result.results : [])) {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
              fileFailed = true;
              await writeLog('WARN', 'EXCEL_DB_SYNC_INVALID_ACK', { filePath, reason: 'invalid-row' });
              continue;
            }
            const reportId = Number(item.id);
            const operationId = String(item.operation_id || '');
            if (!expectedIds.has(operationId) || acknowledgedIds.has(operationId)) {
              fileFailed = true;
              await writeLog('WARN', 'EXCEL_DB_SYNC_INVALID_ACK', { filePath, reportId: item.id });
              continue;
            }
            acknowledgedIds.add(operationId);
            if (item.success === true && typeof item.updated_at === 'string' && item.updated_at.trim()
                && Number.isSafeInteger(reportId) && reportId > 0) {
              verifiedVersions.set(operationId, { id: reportId, updated_at: item.updated_at });
            }
            if (item.success !== true) {
              fileFailed = true;
              await writeLog('WARN', 'EXCEL_DB_SYNC_ROW_FAILED', { filePath, reportId: item.id, code: item.code, message: item.message });
            }
          }
          if (acknowledgedIds.size !== expectedIds.size) fileFailed = true;
          // Do not trust server counters over individual row acknowledgments.
          const verifiedSuccess = verifiedVersions.size;
          if (verifiedSuccess !== batchSucceeded) fileFailed = true;
          if (batchSucceeded + batchFailed !== chunk.length || acknowledgedIds.size !== expectedIds.size) fileFailed = true;
          // A contradictory response is not safe to acknowledge as a
          // synchronized snapshot; retain versions only for valid row IDs.
          if (countsValid && verifiedSuccess === batchSucceeded
              && batchSucceeded + batchFailed === chunk.length
              && acknowledgedIds.size === expectedIds.size
              && Array.isArray(result.results) && result.results.length === chunk.length) {
            for (const [, version] of verifiedVersions) state.versions.set(version.id, version.updated_at);
          }
          // Only count verifiable acknowledgments. A malformed response is
          // reported as an unresolved batch, not as confirmed DB success.
          const trustworthy = countsValid && verifiedSuccess === batchSucceeded
            && batchSucceeded + batchFailed === chunk.length
            && acknowledgedIds.size === expectedIds.size
            && Array.isArray(result.results) && result.results.length === chunk.length;
          succeeded += trustworthy ? verifiedSuccess : 0;
          failed += trustworthy ? chunk.length - verifiedSuccess : chunk.length;
        } catch (error) {
          fileFailed = true;
          failed += chunk.length;
          await writeLog('ERROR', 'EXCEL_DB_SYNC_BATCH_FAILED', { filePath, source, count: chunk.length, ...normalizeError(error) });
          if (error.code === 'EXCEL_DB_SYNC_FORBIDDEN') return { detected, succeeded, failed: failed + workbookChanges.length - index - chunk.length, forbidden: true };
        }
        if (fileFailed) {
          failed += workbookChanges.length - index - chunk.length;
          break;
        }
      }
      // Never acknowledge an earlier file snapshot if Excel was saved again
      // during the HTTP requests. Re-read the newest workbook next cycle.
      const latestStat = await fs.stat(filePath).catch(() => null);
      const changedDuringSync = !sameFileVersion(latestStat, stat);
      excelDbSyncState.set(filePath, { stat: fileFailed || changedDuringSync ? state.stat : stat, versions: state.versions });
      // A rebuild overwrites the local workbook. Never rebuild a month while
      // any of its edits failed or the workbook changed during the request.
      if (/^\d{4}-(?:0[1-9]|1[0-2])$/.test(parsedMonth)
          && !fileFailed && !changedDuringSync) pendingRebuildMonths.add(parsedMonth);
      else if (/^\d{4}-(?:0[1-9]|1[0-2])$/.test(parsedMonth)) blockedMonths.add(parsedMonth);
    }
    for (const month of pendingRebuildMonths) {
      if (!blockedMonths.has(month) && (!yearMonth || yearMonth === month)) changedMonths.add(month);
    }
    // An unreadable workbook might contain unsynced changes for any month.
    // Do not regenerate any workbook until it can be inspected safely.
    if (unreadableWorkbook) changedMonths.clear();
    if (detected > 0) {
      await writeLog('INFO', 'EXCEL_DB_SYNC_FINISH', { source, detected, succeeded, failed, changedMonths: [...changedMonths] });
      if (source === 'watcher') sendRenderer('ktc-excel-db-sync-result', { detected, succeeded, failed });
    }
    if (!isSyncRunning() && source === 'watcher') {
      for (const month of changedMonths) {
        pendingRebuildMonths.delete(month);
        void enqueueManualExcelSync({ date: `${month}-01`, source: 'excel-db-rebuild' }).then(result => {
          if (result?.success !== true) pendingRebuildMonths.add(month);
        }).catch(error => {
          pendingRebuildMonths.add(month);
          return writeLog('ERROR', 'EXCEL_DB_REBUILD_FAILED', { yearMonth: month, ...normalizeError(error) });
        });
      }
    }
    return { detected, succeeded, failed, changedMonths: [...changedMonths] };
  } finally {
    excelDbSyncRunning = false;
  }
}


  function acknowledgeRebuild(month) { pendingRebuildMonths.delete(month); }
  return { postExcelChanges, previewEditedExcelFilesToDb, syncEditedExcelFilesToDb, acknowledgeRebuild };
}

module.exports = { createExcelDbSyncController, operationIdForChange };
