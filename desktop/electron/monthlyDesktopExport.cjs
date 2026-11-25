'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { assertApprovedDatabasePayload } = require('./monthlyWorkbookReportData.cjs');
const { normalizeYearMonth, MONTHLY_FILE_COUNT } = require('./monthlyExcelContract.cjs');

// Monthly desktop export: data must come exclusively from approved TiDB reports.
function createMonthlyDesktopExport({
  writeLog, getExportRoot, logPendingFiles, waitForUsableRendererToken,
  getCurrentToken, setCurrentToken, fetchCompanyData, buildSplitMonthlyWorkbooksLocal,
  getAppPath, PROCESS_SHEETS, safeFileName, atomicOverwrite,
  normalizeError, cleanupLegacyMonthlyLayout,
}) {
async function performSyncSingleMonth({ date, source }) {
  const startedAt = Date.now();
  await writeLog('INFO', 'SYNC_START', {
    source,
    date,
    mode: 'desktop-local-worker-template',
    excelEngine: 'desktop-local',
    backendRole: 'approved-data-only'
  });

  const root = getExportRoot();
  await fs.mkdir(root, { recursive: true });
  await logPendingFiles(root);

  // Reuse the authenticated token already resolved for this export job.
  // Renderer storage can be temporarily empty while the frontend refreshes.
  const token = await waitForUsableRendererToken(getCurrentToken(), 8_000);
  if (!token) throw new Error('Chưa đăng nhập hoặc phiên đăng nhập chưa được làm mới.');
  setCurrentToken(token);

  const files = [];
  try {
    // Excel -> DB không tự chạy trong lúc export. DB đã duyệt là nguồn dữ liệu duy nhất.
    await writeLog('INFO', 'EXCEL_DB_PRECHECK_SKIPPED_FOR_DB_EXPORT', {
      date,
      source,
      reason: 'DB_IS_AUTHORITATIVE_FOR_EXCEL_EXPORT'
    });

    const companyData = await fetchCompanyData(date);
    assertApprovedDatabasePayload(companyData);
    const requestedMonth=normalizeYearMonth(date);
    if (companyData.yearMonth && normalizeYearMonth(companyData.yearMonth)!==requestedMonth) throw new Error('Sai kỳ dữ liệu Excel.');
    const processCounts = Object.fromEntries(
      Object.entries(companyData?.processes || {}).map(([code, data]) => [
        code,
        {
          reports: Array.isArray(data?.reports) ? data.reports.length : 0,
          deductionTypes: Array.isArray(data?.deductionTypes) ? data.deductionTypes.length : 0,
          defectTypes: Array.isArray(data?.defectTypes) ? data.defectTypes.length : 0
        }
      ])
    );
    const totalReportCount = Object.values(processCounts).reduce(
      (sum, item) => sum + Number(item?.reports || 0),
      0
    );

    await writeLog('INFO', 'COMPANY_DATA_RECEIVED', {
      date,
      yearMonth: companyData?.yearMonth || String(date).slice(0, 7),
      dataSource: companyData?.dataSource || 'unknown',
      totalReportCount,
      processCounts
    });

    if (totalReportCount === 0) {
      const yearMonth = String(date).slice(0, 7);

     await writeLog('INFO', 'MONTHLY_WORKBOOK_SKIPPED_NO_DATA', {
       date,
        yearMonth,
       source,
        reason: 'NO_APPROVED_DATA',
        message: `Tháng ${yearMonth} chưa có báo cáo approved, không tạo/ghi đè Excel.`
      });

      const result = {
        success: true,
        partialSuccess: false,
        skipped: true,
        code: 'NO_APPROVED_DATA',
        message: `Tháng ${yearMonth} chưa có dữ liệu approved. Không tạo file Excel.`,
       date,
      files: [],
       rootFolder: root,
       savedAt: new Date().toISOString(),
       elapsedMs: Date.now() - startedAt,
       excelEngine: 'desktop-local',
       backendRole: 'approved-data-only'
      };

      await writeLog('INFO', 'SYNC_FINISH', {
       source,
       date,
       fileCount: 0,
       success: true,
        skipped: true,
        code: 'NO_APPROVED_DATA',
        excelEngine: 'desktop-local',
        elapsedMs: result.elapsedMs
      });

      return result;
    }

    const requestedYearMonth = String(date).slice(0, 7);
    if (String(companyData?.yearMonth || requestedYearMonth).slice(0, 7) !== requestedYearMonth) {
      throw Object.assign(
        new Error(
          `Sai kỳ dữ liệu Excel: yêu cầu ${requestedYearMonth}, nhận ${companyData?.yearMonth || 'trống'}.`
        ),
        { code: 'COMPANY_DATA_YEAR_MONTH_MISMATCH' }
      );
    }

    const [year, month] = date.split('-');
    const folder = path.join(root, year, month);
    await fs.mkdir(folder, { recursive: true });

    await writeLog('INFO', 'MONTHLY_SPLIT_WORKBOOKS_START', {
      date,
      folder,
      expectedFileCount: MONTHLY_FILE_COUNT,
      excelEngine: 'desktop-local'
    });

    const built = await buildSplitMonthlyWorkbooksLocal({
      appPath: getAppPath(),
      date,
      payload: companyData,
      onTemplateLoaded: async (details) => {
        await writeLog('INFO', 'ORIGINAL_TEMPLATE_LOADED', { date, ...details });
      }
    });

    const isWorkerSingleFile = built?.mode === 'WORKER_REPORT_SINGLE_FILE';
    if (isWorkerSingleFile) {
      const actualCount = Array.isArray(built.processes) ? built.processes.length : 0;
      const expectedCount = Number.isFinite(Number(built.expectedFileCount)) ? Number(built.expectedFileCount) : actualCount;
      if (actualCount !== expectedCount) {
        throw Object.assign(new Error('Số workbook không khớp: yêu cầu ' + expectedCount + ', tạo được ' + actualCount + '.'),
          { code: 'MONTHLY_PROCESS_WORKBOOKS_INCOMPLETE' });
      }
      for (const processBuilt of built.processes || []) {
        const filePath = path.join(folder, safeFileName(processBuilt.fileName, 'BAO_CAO_CONG_NHAN_' + month + '-' + year + '.xlsx'));
        const writeResult = await atomicOverwrite(filePath, processBuilt.buffer, date);
        files.push({
          category: 'MONTHLY_PROCESS', processId: -1,
          processCode: processBuilt.processCode || 'ALL',
          processName: processBuilt.processName || 'Báo cáo công nhân',
          fileName: path.basename(filePath), filePath, folder,
          size: processBuilt.buffer.length, saved: writeResult.saved,
          pendingPath: writeResult.pendingPath, backupPath: writeResult.backupPath,
          success: writeResult.saved === true, source: 'desktop-local',
          reportCount: processBuilt.reportCount
        });
        await writeLog('INFO', 'MONTHLY_WORKER_TEMPLATE_UPDATED', {
          date, filePath, saved: writeResult.saved, pendingPath: writeResult.pendingPath || null
        });
      }
    } else {
      const expectedProcessCodes = Object.keys(PROCESS_SHEETS);
      const builtProcessCodes = (built.processes || []).map((item) => String(item.processCode || '').toUpperCase());
      const missingProcessCodes = expectedProcessCodes.filter((code) => !builtProcessCodes.includes(code));
      if (missingProcessCodes.length || builtProcessCodes.length !== expectedProcessCodes.length) {
        throw Object.assign(new Error('Thiếu workbook công đoạn: ' + (missingProcessCodes.join(', ') || 'danh sách công đoạn không khớp') + '.'),
          { code: 'MONTHLY_PROCESS_WORKBOOKS_INCOMPLETE' });
      }

    const summaryFilePath = path.join(
      folder,
      safeFileName(
        built.summary.fileName,
        `00_TONG_HOP_SAN_XUAT_${month}-${year}.xlsx`
      )
    );
    const summaryWrite = await atomicOverwrite(
      summaryFilePath,
      built.summary.buffer,
      date
    );
    files.push({
      category: 'MONTHLY_SUMMARY',
      processId: -1,
      processCode: 'ALL',
      processName: 'Tổng hợp sản xuất tháng',
      fileName: path.basename(summaryFilePath),
      filePath: summaryFilePath,
      folder,
      size: built.summary.buffer.length,
      saved: summaryWrite.saved,
      pendingPath: summaryWrite.pendingPath,
      backupPath: summaryWrite.backupPath,
      success: summaryWrite.saved === true,
      source: 'desktop-local',
      formulaReplacementCount: built.summary.formulaReplacementCount
    });

    // 10 công đoạn: luôn tạo đủ workbook, kể cả công đoạn chưa có báo cáo trong tháng.
    for (const processBuilt of built.processes || []) {
      // Keep all process .xlsx files beside the monthly summary; never
      // create per-process subfolders or mutate the source template.
      const processFolder = folder;

      const filePath = path.join(
        processFolder,
        safeFileName(
          processBuilt.fileName,
          `${processBuilt.processCode || 'PROCESS'}_${month}-${year}.xlsx`
        )
      );
      const writeResult = await atomicOverwrite(filePath, processBuilt.buffer, date);

      files.push({
        category: 'MONTHLY_PROCESS',
        processId: -1,
        processCode: processBuilt.processCode,
        processName: processBuilt.processName,
        fileName: path.basename(filePath),
        filePath,
        folder: processFolder,
        size: processBuilt.buffer.length,
        saved: writeResult.saved,
        pendingPath: writeResult.pendingPath,
        backupPath: writeResult.backupPath,
        success: writeResult.saved === true,
        source: 'desktop-local',
        sheetResult: processBuilt.result,
        formulaReplacementCount: processBuilt.formulaReplacementCount
      });

      await writeLog('INFO', 'PROCESS_EXCEL_UPDATED_LOCAL', {
        date,
        processCode: processBuilt.processCode,
        processName: processBuilt.processName,
        filePath,
        size: processBuilt.buffer.length,
        saved: writeResult.saved,
        pendingPath: writeResult.pendingPath || null
      });
    }

    } // End legacy multi-workbook layout.
    await writeLog('INFO', 'MONTHLY_SPLIT_WORKBOOKS_UPDATED', {
      date,
      folder,
      fileCount: files.length,
      source: 'desktop-local',
      files: files.map((file) => ({
        processCode: file.processCode,
        processName: file.processName,
        fileName: file.fileName,
        saved: file.saved
      }))
    });
  } catch (error) {
    files.push({
      category: 'MONTHLY',
      processId: -1,
      processCode: 'ALL',
      processName: 'Báo cáo sản xuất tháng',
      success: false,
      source: 'desktop-local',
      error: error.message,
      code: error.code || null
    });
    await writeLog('ERROR', 'MONTHLY_WORKBOOK_FAILED', {
      date,
      source,
      excelEngine: 'desktop-local',
      ...normalizeError(error)
    });
  }

  const expectedFileCount = files.filter((file) => file.category === 'MONTHLY_PROCESS').length === 1 ? 1 : Object.keys(PROCESS_SHEETS).length + 1;
  const success = files.length === expectedFileCount && files.every((file) => file.success === true);
  if (success) await cleanupLegacyMonthlyLayout(root, date, files.map((file) => file.fileName).filter(Boolean), writeLog);
  const result = {
    success,
    partialSuccess: false,
    message: success
      ? `Đã cập nhật ${expectedFileCount} file Excel tháng trực tiếp trên máy (không qua Render).`
      : 'Không thể cập nhật file Excel tháng. Xem desktop.log để biết chi tiết.',
    date,
    files,
    rootFolder: root,
    savedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    excelEngine: 'desktop-local',
    backendRole: 'approved-data-only'
  };

  await writeLog('INFO', 'SYNC_FINISH', {
    source,
    date,
    fileCount: files.length,
    success,
    excelEngine: 'desktop-local',
    elapsedMs: result.elapsedMs
  });
  return result;
}

  return { performSyncSingleMonth };
}

module.exports = { createMonthlyDesktopExport };
