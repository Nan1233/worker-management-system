'use strict';
const path = require('node:path');

function createProcessReportExport({
  normalizeProcessInfo, writeLog, buildProcessExcelLocal, getProcessExportPath,
  atomicOverwrite, normalizeError, getAppPath,
}) {
async function syncProcessReportsFirst({ date, files, processes, companyData }) {
  const normalized = (processes || [])
    .map(normalizeProcessInfo)
    .filter((item) => Number.isFinite(item.id) && item.id > 0)
    .sort((a, b) => {
      const priority = (item) => String(item.processCode || '').toUpperCase() === 'GC' ? 0 : 1;
      return priority(a) - priority(b) || Number(b.reportCount || 0) - Number(a.reportCount || 0) || a.id - b.id;
    });

  await writeLog('INFO', 'PROCESS_LIST_READY', {
    date,
    count: normalized.length,
    processes: normalized.map((item) => ({
      id: item.id,
      code: item.processCode,
      name: item.processName,
      reportCount: Number(item.reportCount || item.report_count || 0)
    }))
  });

  const supported = new Set(['GC', 'MAI', 'DO']);
  const completedReportGroups = new Set();
  for (const processInfo of normalized) {
    const code = String(processInfo.processCode || '').toUpperCase();
    const reportCount = Number(processInfo.reportCount || processInfo.report_count || 0);
    if (!supported.has(code)) {
      if (reportCount > 0) {
        files.push({
          category: 'PROCESS', processId: processInfo.id, processCode: code,
          processName: processInfo.processName, success: false, skipped: true,
          error: `Chưa có template Desktop cho công đoạn ${processInfo.processName || code}.`
        });
      }
      continue;
    }
    const reportGroup = code;
    if (completedReportGroups.has(reportGroup)) {
      await writeLog('INFO', 'PROCESS_REPORT_GROUP_ALREADY_BUILT', {
        date, processCode: code, reportGroup
      });
      continue;
    }

    // Luôn dựng file báo cáo mẫu đúng tháng, kể cả chưa có dữ liệu đã duyệt.
    // buildProcessExcelLocal sẽ làm sạch vùng dữ liệu và giữ nguyên template/công thức.
    // Nhờ đó mỗi công đoạn có báo cáo mẫu riêng; Mài và Đo không bị gộp.
    if (reportCount <= 0) {
      await writeLog('INFO', 'PROCESS_EXCEL_BUILD_EMPTY_PERIOD', {
        date,
        processCode: code,
        message: 'Kỳ chưa có báo cáo đã duyệt; vẫn tạo file mẫu đúng tháng.'
      });
    }

    await writeLog('INFO', 'PROCESS_EXCEL_LOCAL_START', {
      date, processId: processInfo.id, processCode: code, processName: processInfo.processName
    });
    try {
      const built = await buildProcessExcelLocal({
        appPath: getAppPath(), date, processCode: code, payload: companyData
      });
      if (built.skipped) {
        files.push({
          category: 'PROCESS', processId: processInfo.id, processCode: code,
          processName: processInfo.processName, success: true, skipped: true,
          code: built.code, message: built.message
        });
        continue;
      }
      const targetProcessInfo = {
        ...processInfo,
        processCode: built.processCode || processInfo.processCode,
        processName: built.processName || processInfo.processName
      };
      const target = await getProcessExportPath(date, targetProcessInfo, built.fileName);
      const writeResult = await atomicOverwrite(target.filePath, built.buffer, date);
      completedReportGroups.add(built.reportGroup || reportGroup);
      files.push({
        category: 'PROCESS', processId: processInfo.id, processCode: built.processCode || code,
        processName: built.processName || processInfo.processName,
        fileName: path.basename(target.filePath), filePath: target.filePath, folder: target.folder,
        size: built.buffer.length, saved: writeResult.saved, pendingPath: writeResult.pendingPath,
        success: true, localBuild: true, reportCount: built.reportCount,
        templatePath: built.sourcePath || null, templateKind: built.templateKind || null
      });
      await writeLog('INFO', 'PROCESS_EXCEL_UPDATED_LOCAL', {
        processId: processInfo.id, processCode: code, filePath: target.filePath,
        saved: writeResult.saved, pendingPath: writeResult.pendingPath,
        reportCount: built.reportCount, templatePath: built.sourcePath || null,
        templateKind: built.templateKind || null
      });
    } catch (error) {
      files.push({
        category: 'PROCESS', processId: processInfo.id, processCode: code,
        processName: processInfo.processName, success: false, localBuild: true, error: error.message
      });
      await writeLog('ERROR', 'PROCESS_EXCEL_LOCAL_FAILED', {
        date, processId: processInfo.id, processCode: code, ...normalizeError(error)
      });
      if (code === 'GC') break;
    }
  }
}



  return { syncProcessReportsFirst };
}

module.exports = { createProcessReportExport };
