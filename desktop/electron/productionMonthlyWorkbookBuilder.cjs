'use strict';
const monthly = require('./monthlyWorkbookLocal.cjs');
const { PROCESS_EXPORTS, MONTHLY_FILE_COUNT } = require('./monthlyExcelContract.cjs');
const { formulaSettingsFor } = require('./monthlyWorkbookReportData.cjs');
const { buildWorkerProcessWorkbook, PROCESS_CODES, PROCESS_FILE_PREFIXES } = require('./workerReportWorkbook.cjs');
const { prepareMonthlyPayload, processRows } = require('./monthlyExcelPayloadPreparation.cjs');

async function buildPreparedProcessWorkbook({ appPath, date, payload, item, onTemplateLoaded }) {
  const { processCode, data: processData } = item;
  const expectedTemplateKind = PROCESS_EXPORTS[processCode].templateKind;
  const processName = processData.processName || processData.process_name || processCode;
  const built = expectedTemplateKind === 'worker-template'
    ? await buildWorkerProcessWorkbook({
        appPath, includeSyncMetadata: true, processCode, processName, date,
        processData: { ...processData, formulaSettings: formulaSettingsFor(payload, processCode) }
      })
    : await monthly.buildCompanyOriginalProcessWorkbookLocal({ date, payload, processCode, onTemplateLoaded });
  if (built.templateKind !== expectedTemplateKind) {
    throw new Error('Không thể xuất ' + processCode + ': không dùng đúng mẫu ' + expectedTemplateKind + '.');
  }
  return { ...built, processCode, processName, reportCount: processData.reports.length };
}

async function buildMonthlyProcessWorkbook({ appPath, date, payload, processCode, onTemplateLoaded }) {
  const prepared = prepareMonthlyPayload(payload, date);
  const code = String(processCode || '').trim().toUpperCase();
  const item = processRows(prepared).find(row => row.processCode === code);
  if (!item) throw new Error('Công đoạn không hợp lệ: ' + processCode);
  return buildPreparedProcessWorkbook({ appPath, date, payload: prepared, item, onTemplateLoaded });
}

async function buildWorkerSplit({ appPath, date, payload, onTemplateLoaded }) {
  const prepared = prepareMonthlyPayload(payload, date);
  const processes = [];
  for (const item of processRows(prepared)) {
    processes.push(await buildPreparedProcessWorkbook({ appPath, date, payload: prepared, item, onTemplateLoaded }));
  }
  const summary = await monthly.buildMonthlySummaryWorkbookLocal({ date, payload: prepared });
  return { mode: 'PROCESS_WORKBOOKS', processes, summary, expectedFileCount: MONTHLY_FILE_COUNT };
}

module.exports = { buildWorkerSplit, buildMonthlyProcessWorkbook, PROCESS_CODES, PROCESS_FILE_PREFIXES };
