'use strict';

// Initialize all order-dependent Excel patches only on the first Excel action.
// The renderer window must not wait for ExcelJS, templates, or workbook modules.
let runtime = null;
let initializing = false;

function getExcelRuntime() {
  if (runtime) return runtime;
  if (initializing) throw new Error('KTC Excel runtime reentered during initialization');
  initializing = true;
  try {
    // Preserve this sequence: v5 -> compact -> source timestamp patch -> v6.
    require('./excelExportContractPatch.v5.cjs');
    require('./compactGcExcelPatch.cjs');
    require('./excelReportDateSubmissionPatch.cjs');
    require('./excelExportContractPatch.v6.cjs');
    const company = require('./companyExcelLocal.cjs');
    const monthly = require('./monthlyWorkbookLocal.cjs');
    const dbSync = require('./excelDbSync.cjs');
    runtime = { company, monthly, dbSync };
    return runtime;
  } finally {
    initializing = false;
  }
}

module.exports = { getExcelRuntime };
