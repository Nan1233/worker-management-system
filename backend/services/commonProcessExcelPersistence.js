'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { getMonthlyTarget } = require('./consolidatedExcelExportService');
const { publishExcelWorkbook } = require('./excelWorkbookPublisherService');
const { randomUUID } = require('node:crypto');

async function saveCommonProcessMonthlyWorkbook(workbook, yearMonth, templatePath, reportCount, dependencies = {}) {
  const fileSystem = dependencies.fs || fs;
  const resolveTarget = dependencies.getMonthlyTarget || getMonthlyTarget;
  const target = resolveTarget(yearMonth, { stageFolder: 'BC công đoạn' });
  await publishExcelWorkbook(workbook, target.filePath, { fileSystem });
  // The workbook has already been committed by rename. A metadata failure must
  // remain visible rather than reporting a successful export with stale metadata.
  try {
    // Publish metadata through a unique temp file to avoid truncated JSON
    // when another process reads the export index.
    const metadataTemp = target.metadataPath + '.' + randomUUID() + '.tmp';
    try {
      await fileSystem.writeFile(metadataTemp, JSON.stringify({
        version: 1, template: path.basename(templatePath), layout: 'common-process-daily-blocks',
        yearMonth, reportCount, updatedAt: new Date().toISOString()
      }), { encoding: 'utf8', flag: 'wx' });
      await fileSystem.rename(metadataTemp, target.metadataPath);
    } finally {
      await fileSystem.rm(metadataTemp, { force: true }).catch(() => {});
    }
  } catch (error) {
    const wrapped = new Error(`Excel workbook saved to ${target.filePath}, but metadata update failed: ${error.message}`, { cause: error });
    wrapped.code = 'EXCEL_METADATA_WRITE_FAILED';
    wrapped.archivePath = target.filePath;
    throw wrapped;
  }
  return { archivePath: target.filePath, fileName: target.fileName, reportCount,
    templateFile: path.basename(templatePath), layout: 'common-process-daily-blocks' };
}

module.exports = { saveCommonProcessMonthlyWorkbook };
