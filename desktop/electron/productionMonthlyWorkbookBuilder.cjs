'use strict';

const monthly = require('./monthlyWorkbookLocal.cjs');
// Capture the unpatched per-process builder for seven original company forms.
const buildOriginalProcessWorkbookLocal = monthly.buildCompanyOriginalProcessWorkbookLocal;
if (typeof buildOriginalProcessWorkbookLocal !== 'function') {
  throw new Error('Missing unwrapped original company Excel template builder.');
}
const { PROCESS_EXPORTS, MONTHLY_FILE_COUNT } = require('./monthlyExcelContract.cjs');
const { formulaSettingsFor } = require('./monthlyWorkbookReportData.cjs');
const ORIGINAL_COMPANY_CODES = new Set(Object.keys(PROCESS_EXPORTS).filter(code => PROCESS_EXPORTS[code].templateKind!=='worker-template'));

const { buildWorkerProcessWorkbook, PROCESS_CODES, PROCESS_FILE_PREFIXES } = require('./workerReportWorkbook.cjs');

const {prepareMonthlyPayload,processRows}=require('./monthlyExcelPayloadPreparation.cjs');

async function buildWorkerSplit({ appPath, date, payload, onTemplateLoaded }) {
  payload=prepareMonthlyPayload(payload,date);
  const sourceRows=processRows(payload);
  const processes=[];
  for(const item of sourceRows){
    const processData=item.data;
    const reports=processData.reports;
    // Six process files are populated from the corresponding Workbook1 sheet.
    // K1 and K2 retain their established templates; SX3 and CVK are unchanged.
    const built = ORIGINAL_COMPANY_CODES.has(item.processCode)
      ? await buildOriginalProcessWorkbookLocal({
          date, payload, processCode: item.processCode, onTemplateLoaded
        })
      : await buildWorkerProcessWorkbook({
          appPath,
          includeSyncMetadata: true,
          processCode: item.processCode,
          processName: processData.processName || processData.process_name || item.processCode,
          date,
          processData: {...processData,formulaSettings:formulaSettingsFor(payload,item.processCode)}
        });
    const expectedTemplateKind = PROCESS_EXPORTS[item.processCode].templateKind;
    if (built.templateKind !== expectedTemplateKind) {
      throw new Error('Không thể xuất ' + item.processCode + ': không dùng đúng mẫu ' + expectedTemplateKind + '.');
    }
    built.processCode = item.processCode;
    built.processName = processData.processName || processData.process_name || item.processCode;
    built.reportCount = reports.length;
    processes.push(built);
  }
  const summary = await monthly.buildMonthlySummaryWorkbookLocal({ date, payload });
  return { mode: 'PROCESS_WORKBOOKS', processes, summary, expectedFileCount: MONTHLY_FILE_COUNT };
}
module.exports = { buildWorkerSplit, PROCESS_CODES, PROCESS_FILE_PREFIXES };