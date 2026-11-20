'use strict';

// Single-flight approved exports, yearly orchestration and optional automatic schedule.
function createDesktopSyncCoordinator({
  assertDate, getExportRoot, writeLog, normalizeError, performSyncSingleMonth,
  waitForUsableRendererToken, getCurrentToken, setCurrentToken, isQuitting,
  normalizeAccessToken, SYNC_INTERVAL_MS, AUTO_EXCEL_SYNC_ENABLED,
  getDateParts, sendRenderer,
}) {
  let syncTimer = null;
  let syncRunning = false;
  let manualSyncTail = Promise.resolve();
  let queuedManualSyncCount = 0;
  let lastSuccessfulSyncAt = 0;

async function performSync({ date, source }) {
  const startedAt = Date.now();
  assertDate(date);
  const [year] = date.split('-');
  const root = getExportRoot();
  const monthResults = [];
  await writeLog('INFO', 'YEARLY_APPROVED_EXPORT_START', {
    year, source, monthsRequested: 12, policy: 'ALL_APPROVED_REPORTS_BY_MONTH'
  });

  for (let month = 1; month <= 12; month += 1) {
    const monthText = String(month).padStart(2, '0');
    const monthDate = `${year}-${monthText}-01`;
    try {
      const result = await performSyncSingleMonth({ date: monthDate, source: `${source}:yearly` });
      monthResults.push({
        yearMonth: `${year}-${monthText}`,
        success: result.success === true,
        skipped: result.skipped === true,
        code: result.code || null,
        files: Array.isArray(result.files) ? result.files : [],
        message: result.message || null
      });
    } catch (error) {
      monthResults.push({
        yearMonth: `${year}-${monthText}`,
        success: false,
        skipped: false,
        error: error.message,
        files: []
      });
      await writeLog('ERROR', 'YEARLY_APPROVED_EXPORT_MONTH_FAILED', {
        year, yearMonth: `${year}-${monthText}`, source, ...normalizeError(error)
      });
    }
  }

  const exportedMonths = monthResults.filter((item) => !item.skipped && item.files.length > 0);
  const skippedMonths = monthResults.filter((item) => item.skipped);
  const failedMonths = monthResults.filter((item) => !item.success && !item.skipped);
  const files = monthResults.flatMap((item) => item.files.map((file) => ({
    ...file, yearMonth: item.yearMonth
  })));
  const hasExportedData = exportedMonths.length > 0;
  const success = hasExportedData && failedMonths.length === 0 &&
    exportedMonths.every((item) => item.success);
  const result = {
    success,
    partialSuccess: hasExportedData && failedMonths.length > 0,
    skipped: !hasExportedData && failedMonths.length === 0,
    code: !hasExportedData && failedMonths.length === 0 ? 'NO_APPROVED_DATA_FOR_YEAR' : undefined,
    message: success
      ? `Đã cập nhật báo cáo approved năm ${year}: ${exportedMonths.length} tháng có dữ liệu; bỏ qua ${skippedMonths.length} tháng trống.`
      : hasExportedData
        ? `Đã xuất một phần báo cáo năm ${year}; có ${failedMonths.length} tháng lỗi. Kiểm tra desktop.log.`
        : failedMonths.length
          ? `Không thể xuất báo cáo năm ${year}; có ${failedMonths.length} tháng lỗi.`
          : `Năm ${year} chưa có báo cáo approved để xuất.`,
    date,
    year,
    files,
    months: monthResults.map(({ files: _files, ...item }) => item),
    rootFolder: root,
    savedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    excelEngine: 'desktop-local',
    backendRole: 'approved-data-only'
  };
  await writeLog(success ? 'INFO' : 'WARN', 'YEARLY_APPROVED_EXPORT_FINISH', {
    year, source, success, exportedMonthCount: exportedMonths.length,
    skippedMonthCount: skippedMonths.length, failedMonthCount: failedMonths.length,
    fileCount: files.length
  });
  return result;
}

async function syncAllProcessExcel({ date, source = 'manual', token: requestedToken = '' } = {}) {
  assertDate(date);
  const token = await waitForUsableRendererToken(requestedToken, 8_000);
  if (!token) throw new Error('Chưa đăng nhập hoặc thiếu token.');
  setCurrentToken(token);

  if (syncRunning) {
    throw new Error(`Lỗi điều phối đồng bộ: ${source} được chạy khi một tác vụ khác chưa kết thúc.`);
  }

  syncRunning = true;
  await writeLog('INFO', 'EXCEL_SYNC_LOCK_ACQUIRED', { date, source, queuedManualSyncCount });
  try {
    return await performSync({ date, source });
  } finally {
    syncRunning = false;
    await writeLog('INFO', 'EXCEL_SYNC_LOCK_RELEASED', { date, source, queuedManualSyncCount });
  }
}

function enqueueManualExcelSync(request) {
  const queuedAt = Date.now();
  queuedManualSyncCount += 1;
  const queuePosition = queuedManualSyncCount;

  const task = manualSyncTail.then(async () => {
    queuedManualSyncCount = Math.max(0, queuedManualSyncCount - 1);
    await writeLog('INFO', 'MANUAL_EXCEL_SYNC_DEQUEUED', {
      date: request.date,
      queuePosition,
      waitedMs: Date.now() - queuedAt,
      remaining: queuedManualSyncCount
    });
    if (isQuitting()) throw new Error('Ứng dụng đang đóng, không thể tiếp tục cập nhật Excel.');
    return syncAllProcessExcel(request);
  });

  manualSyncTail = task.catch(() => undefined);
  return task;
}

async function runAutomaticSync() {
  if (!getCurrentToken() || isQuitting()) return;
  if (Date.now() - lastSuccessfulSyncAt < SYNC_INTERVAL_MS - 5_000) return;
  if (syncRunning || queuedManualSyncCount > 0) {
    await writeLog('INFO', 'AUTO_EXCEL_SYNC_SKIPPED_BUSY', {
      syncRunning,
      queuedManualSyncCount
    });
    return;
  }
  try {
    const result = await syncAllProcessExcel({ date: getDateParts().date, source: 'automatic' });
    if (result?.success) lastSuccessfulSyncAt = Date.now();
    sendRenderer('ktc-excel-sync-result', result);
  } catch (error) {
    await writeLog('ERROR', 'AUTO_SYNC_FAILED', normalizeError(error));
    sendRenderer('ktc-excel-sync-error', { message: error.message });
  }
}

function stopAutomaticSync() {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = null;
}

function configureAutomaticSync(token) {
  setCurrentToken(normalizeAccessToken(token));
  stopAutomaticSync();
  if (!getCurrentToken() || !AUTO_EXCEL_SYNC_ENABLED) return;
  syncTimer = setInterval(() => void runAutomaticSync(), SYNC_INTERVAL_MS);
  syncTimer.unref?.();
}


  return {
    performSync, syncAllProcessExcel, enqueueManualExcelSync,
    configureAutomaticSync, stopAutomaticSync,
    isSyncRunning: () => syncRunning,
  };
}
module.exports = { createDesktopSyncCoordinator };
