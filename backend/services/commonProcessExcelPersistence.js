'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { getMonthlyTarget } = require('./consolidatedExcelExportService');

async function saveCommonProcessMonthlyWorkbook(workbook, yearMonth, templatePath, reportCount, dependencies = {}) {
  const fileSystem = dependencies.fs || fs;
  const resolveTarget = dependencies.getMonthlyTarget || getMonthlyTarget;
  const target = resolveTarget(yearMonth, { stageFolder: 'BC công đoạn' });
  await fileSystem.mkdir(target.folder, { recursive: true });
  const tempPath = `${target.filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await workbook.xlsx.writeFile(tempPath);
    await fileSystem.rename(tempPath, target.filePath);
  } catch (error) {
    try { await fileSystem.unlink(tempPath); } catch (_) { /* best-effort temporary cleanup */ }
    throw error;
  }
  await fileSystem.writeFile(target.metadataPath, JSON.stringify({
    version: 1, template: path.basename(templatePath), layout: 'common-process-daily-blocks',
    yearMonth, reportCount, updatedAt: new Date().toISOString()
  }), 'utf8');
  return { archivePath: target.filePath, fileName: target.fileName, reportCount,
    templateFile: path.basename(templatePath), layout: 'common-process-daily-blocks' };
}

module.exports = { saveCommonProcessMonthlyWorkbook };
