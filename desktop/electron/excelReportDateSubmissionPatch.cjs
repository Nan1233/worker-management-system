'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

// Minimal source patch loaded before excelExportContractPatch.v6 requires the
// worker template. It preserves the existing template/export architecture and
// only separates DB work_date from the true submission timestamp.
if (!global.__KTC_EXCEL_REPORT_DATE_SUBMISSION_PATCH__) {
  global.__KTC_EXCEL_REPORT_DATE_SUBMISSION_PATCH__ = true;

  const originalLoader = Module._extensions['.cjs'] || Module._extensions['.js'];
  if (typeof originalLoader !== 'function') throw new TypeError('CommonJS loader is unavailable');

  Module._extensions['.cjs'] = function patchedCjsLoader(module, filename) {
    if (path.basename(filename).toLowerCase() !== 'workerreporttemplatelocal.v2.cjs') {
      return originalLoader(module, filename);
    }

    let source = fs.readFileSync(filename, 'utf8');
    if (!source.includes('__KTC_SUBMISSION_TIMESTAMP_PATCHED__')) {
      source = source.replace(
        'function detailItems(report, kind) {',
        `// __KTC_SUBMISSION_TIMESTAMP_PATCHED__\nfunction asSubmissionDateTime(value) {\n  if (!value) return null;\n  if (value instanceof Date) {\n    const parts = {\n      year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate(),\n      hour: value.getUTCHours(), minute: value.getUTCMinutes(), second: value.getUTCSeconds()\n    };\n    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));\n  }\n  const text = String(value).trim();\n  const mysql = text.match(/^(\\d{4})-(\\d{2})-(\\d{2})[ T](\\d{2}):(\\d{2}):(\\d{2})(?:\\.\\d+)?$/);\n  if (mysql) return new Date(Date.UTC(Number(mysql[1]), Number(mysql[2]) - 1, Number(mysql[3]), Number(mysql[4]), Number(mysql[5]), Number(mysql[6])));\n  const iso = new Date(text);\n  if (Number.isNaN(iso.getTime())) return null;\n  const vn = new Date(iso.getTime() + 7 * 3600 * 1000);\n  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate(), vn.getUTCHours(), vn.getUTCMinutes(), vn.getUTCSeconds()));\n}\n\nfunction detailItems(report, kind) {`
      );

      source = source.replace(
        'set(contract.cols.entryDate, asDate(report.entry_date || report.created_at));',
        "set(contract.cols.entryDate, asSubmissionDateTime(report.submitted_at));\n  if (contract.cols.entryDate) row.getCell(contract.cols.entryDate).numFmt = 'dd/mm/yyyy hh:mm:ss';"
      );
      source = source.replace(
        'set(contract.cols.date, asDate(report.work_date || report.entry_date));',
        'set(contract.cols.date, asDate(report.work_date));'
      );
      source = source.replace(
        'const day = asDate(report.work_date || report.entry_date);',
        'const day = asDate(report.work_date);'
      );
      source = source.replace(
        'const day = asDate(report.work_date || report.entry_date);\n    const key = day ? day.toISOString().slice(0, 10) : \'\';',
        'const day = asDate(report.work_date);\n    const key = day ? day.toISOString().slice(0, 10) : \'\';'
      );

      source = source.replace(
        'const contract = buildColumnContract(columnMap, processData);',
        `const contract = buildColumnContract(columnMap, processData);\n  // The existing white column immediately after STT is the audit column.\n  // Reuse it instead of physically inserting a new column, so the template\n  // merges/styles/layout remain untouched.\n  if (Number(contract.cols.stt) === 1 && Number(contract.cols.entryDate) === 2) {\n    sheet.getRow(headerRow).getCell(2).value = 'Thời gian nộp báo cáo';\n    sheet.getColumn(2).hidden = true;\n  }`
      );

      if (!source.includes("sheet.getColumn(2).hidden = true;")) {
        throw new Error('Không thể gắn cột B hidden vào worker report template');
      }
    }

    module._compile(source, filename);
  };
}
