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
  normalizeError, cleanupLegacyMonthlyLayout, readExcelChanges, isAcknowledgedWorkbookVersion = () => false,
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
  const expectedFileCount = MONTHLY_FILE_COUNT;
  try {
    // Export never writes to DB automatically. Before replacing an existing
    // workbook, inspect its edits or an exact acknowledged sync version.
    const beforeReplace = async (filePath, stat) => {
      if (source === 'excel-db-rebuild' && isAcknowledgedWorkbookVersion(filePath, stat)) return;
      if (typeof readExcelChanges !== 'function') throw new Error('Thiếu bộ kiểm tra Excel trước khi ghi đè.');
      const parsed = await readExcelChanges(filePath);
      if (parsed?.managed && (!Array.isArray(parsed.changes) || parsed.changes.length)) {
        throw Object.assign(new Error('Excel có chỉnh sửa chưa đồng bộ: '+path.basename(filePath)), {code:'EXCEL_EXPORT_UNSYNCED_EDITS'});
      }
    };

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

    const expectedProcessCodes = Object.keys(PROCESS_SHEETS);
    const builtProcessCodes = (built?.processes || []).map(item => String(item.processCode || '').toUpperCase());
    const validBuffer = item => Buffer.isBuffer(item?.buffer) && item.buffer.length >= 4
      && item.buffer.subarray(0,4).equals(Buffer.from([0x50,0x4b,0x03,0x04]));
    if (built?.mode !== 'PROCESS_WORKBOOKS' || built.expectedFileCount !== expectedFileCount
      || builtProcessCodes.length !== expectedProcessCodes.length
      || new Set(builtProcessCodes).size !== expectedProcessCodes.length
      || expectedProcessCodes.some(code => !builtProcessCodes.includes(code))
      || !validBuffer(built.summary) || built.processes.some(item => !validBuffer(item))) {
      throw Object.assign(new Error('Bộ workbook không đầy đủ hoặc không hợp lệ; chưa ghi file nào.'),
        { code: 'MONTHLY_PROCESS_WORKBOOKS_INCOMPLETE' });
    }
    const targetNames = [safeFileName(built.summary.fileName, `00_TONG_HOP_SAN_XUAT_${month}-${year}.xlsx`),
      ...built.processes.map(item => safeFileName(item.fileName, `${item.processCode || 'PROCESS'}_${month}-${year}.xlsx`))];
    if (new Set(targetNames.map(name => name.toLowerCase())).size !== expectedFileCount) {
      throw Object.assign(new Error('Tên workbook bị trùng; chưa ghi file nào.'), { code: 'MONTHLY_WORKBOOK_NAME_COLLISION' });
    }

    // Inspect every target before the first write; repeat inside each atomic lock.
    for (const name of targetNames) {
      const target=path.join(folder,name);
      const stat=await fs.stat(target).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
      if(stat)await beforeReplace(target,stat);
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
      date, {beforeReplace}
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
      const writeResult = await atomicOverwrite(filePath, processBuilt.buffer, date, {beforeReplace});

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

  const success = files.length === expectedFileCount && files.every((file) => file.success === true);
  if (success) await cleanupLegacyMonthlyLayout(root, date, files.map((file) => file.fileName).filter(Boolean), writeLog);
  const result = {
    success,
    partialSuccess: !success && files.some(file=>file.success===true),
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
