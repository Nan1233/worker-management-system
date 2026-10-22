'use strict';
// Runs buildMonthlyWorkbook() in a worker thread so ExcelJS' synchronous load/inflate/deflate of the
// (~500k cell) template does not block the API event loop (health checks, other users' requests).
const { parentPort, workerData } = require('node:worker_threads');

(async () => {
  try {
    const { buildMonthlyWorkbook } = require('../services/monthlyExcelService');
    const result = await buildMonthlyWorkbook(String(workerData.yearMonth));
    parentPort.postMessage({ ok: true, result: { path: result.path, fileName: result.fileName, reportCount: result.reportCount } });
  } catch (error) {
    parentPort.postMessage({ ok: false, error: { message: String(error?.message || error), code: error?.code, statusCode: error?.statusCode || error?.status } });
  } finally {
    // config/db keeps a pool open inside this thread; end the thread explicitly.
    setImmediate(() => process.exit(0));
  }
})();
