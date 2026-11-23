'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

function createExcelDbSyncController({
  authenticatedFetch, API_BASE_URL, listExcelFiles, getExportRoot, readExcelChanges,
  writeLog, normalizeError, waitForUsableRendererToken, sendRenderer,
  enqueueManualExcelSync, isQuitting, isSyncRunning,
}) {
  let excelDbSyncRunning = false;
  const excelDbSyncState = new Map();
async function postExcelChanges(changes) {
  const response = await authenticatedFetch(`${API_BASE_URL}/production/excel-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changes })
  });
  if (response.status === 401 || response.status === 403) {
    const error = new Error('Tài khoản hiện tại không có quyền đồng bộ chỉnh sửa Excel về DB.');
    error.code = 'EXCEL_DB_SYNC_FORBIDDEN';
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  if (![200, 207].includes(response.status)) throw new Error(payload.message || `Đồng bộ Excel về DB lỗi HTTP ${response.status}`);
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
    const previewIds = parsed.changes.map((change) => Number(change?.id));
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
  const token = await waitForUsableRendererToken('', 2_000);
  if (!token) return { skipped: true, reason: 'no-token' };
  excelDbSyncRunning = true;
  try {
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
      if (Number(state.mtimeMs || 0) === Number(stat.mtimeMs || 0)
          && Number(state.size ?? -1) === Number(stat.size)) continue;
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
        if (latest && latest.mtimeMs === stat.mtimeMs && latest.size === stat.size) {
          excelDbSyncState.set(filePath, { ...state, mtimeMs: stat.mtimeMs, size: stat.size });
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
        if (latest && latest.mtimeMs === stat.mtimeMs && latest.size === stat.size) {
          excelDbSyncState.set(filePath, { ...state, mtimeMs: stat.mtimeMs, size: stat.size });
        } else unreadableWorkbook = true;
        continue;
      }
      // Avoid mutating the parser's workbook-derived objects. Reconciliation
      // metadata belongs to this request, not to the original snapshot.
      parsed.changes = parsed.changes.map((change) => ({ ...change }));
      for (const change of parsed.changes) {
        const reportId = Number(change.id);
        if (Number.isSafeInteger(reportId) && state.versions?.has(reportId)) {
          change.expected_updated_at = state.versions.get(reportId);
        }
      }
      const allIds = parsed.changes.map((change) => Number(change.id));
      if (allIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
          || new Set(allIds).size !== allIds.length) {
        failed += parsed.changes.length;
        unreadableWorkbook = true;
        await writeLog('WARN', 'EXCEL_DB_SYNC_INVALID_REPORT_IDS', {
          filePath, source, count: parsed.changes.length
        });
        continue;
      }
      // Never send a snapshot that was already superseded while ExcelJS was
      // reading the workbook. The next sync pass must read the newer file.
      const beforePost = await fs.stat(filePath).catch(() => null);
      if (!beforePost || beforePost.mtimeMs !== stat.mtimeMs || beforePost.size !== stat.size) {
        unreadableWorkbook = true;
        await writeLog('WARN', 'EXCEL_DB_SYNC_CHANGED_DURING_READ', { filePath, source });
        continue;
      }
      detected += parsed.changes.length;
      const parsedMonth = String(parsed.yearMonth || '');
      let fileFailed = false;
      for (let index = 0; index < parsed.changes.length; index += 100) {
        const chunk = parsed.changes.slice(index, index + 100);
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
          const expectedIds = new Set(chunk.map((change) => Number(change.id)));
          const acknowledgedIds = new Set();
          const verifiedVersions = new Map();
          for (const item of (Array.isArray(result.results) ? result.results : [])) {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
              fileFailed = true;
              await writeLog('WARN', 'EXCEL_DB_SYNC_INVALID_ACK', { filePath, reason: 'invalid-row' });
              continue;
            }
            const reportId = Number(item.id);
            if (!expectedIds.has(reportId) || acknowledgedIds.has(reportId)) {
              fileFailed = true;
              await writeLog('WARN', 'EXCEL_DB_SYNC_INVALID_ACK', { filePath, reportId: item.id });
              continue;
            }
            acknowledgedIds.add(reportId);
            if (item.success && item.updated_at && Number.isSafeInteger(reportId) && reportId > 0) {
              verifiedVersions.set(reportId, item.updated_at);
            }
            if (!item.success) {
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
            for (const [id, version] of verifiedVersions) state.versions.set(id, version);
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
          if (error.code === 'EXCEL_DB_SYNC_FORBIDDEN') return { detected, succeeded, failed, forbidden: true };
        }
      }
      // Never acknowledge an earlier file snapshot if Excel was saved again
      // during the HTTP requests. Re-read the newest workbook next cycle.
      const latestStat = await fs.stat(filePath).catch(() => null);
      const changedDuringSync = !latestStat || Number(latestStat.mtimeMs) !== Number(stat.mtimeMs)
        || Number(latestStat.size) !== Number(stat.size);
      excelDbSyncState.set(filePath, {
        mtimeMs: fileFailed || changedDuringSync ? state.mtimeMs : stat.mtimeMs,
        size: fileFailed || changedDuringSync ? state.size : stat.size,
        versions: state.versions
      });
      // A rebuild overwrites the local workbook. Never rebuild a month while
      // any of its edits failed or the workbook changed during the request.
      if (/^\d{4}-(?:0[1-9]|1[0-2])$/.test(parsedMonth)
          && !fileFailed && !changedDuringSync) changedMonths.add(parsedMonth);
      else if (/^\d{4}-(?:0[1-9]|1[0-2])$/.test(parsedMonth)) blockedMonths.add(parsedMonth);
    }
    for (const month of blockedMonths) changedMonths.delete(month);
    // An unreadable workbook might contain unsynced changes for any month.
    // Do not regenerate any workbook until it can be inspected safely.
    if (unreadableWorkbook) changedMonths.clear();
    if (detected > 0) {
      await writeLog('INFO', 'EXCEL_DB_SYNC_FINISH', { source, detected, succeeded, failed, changedMonths: [...changedMonths] });
      if (source === 'watcher') sendRenderer('ktc-excel-db-sync-result', { detected, succeeded, failed });
      if (succeeded > 0 && !isSyncRunning() && source === 'watcher') {
        for (const yearMonth of changedMonths) {
          void enqueueManualExcelSync({ date: `${yearMonth}-01`, source: 'excel-db-rebuild' }).catch((error) =>
            writeLog('ERROR', 'EXCEL_DB_REBUILD_FAILED', { yearMonth, ...normalizeError(error) })
          );
        }
      }
    }
    return { detected, succeeded, failed, changedMonths: [...changedMonths] };
  } finally {
    excelDbSyncRunning = false;
  }
}


  return { postExcelChanges, previewEditedExcelFilesToDb, syncEditedExcelFilesToDb };
}

module.exports = { createExcelDbSyncController };
