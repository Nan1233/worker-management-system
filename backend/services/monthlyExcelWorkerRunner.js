'use strict';
const path = require('node:path');
const { Worker } = require('node:worker_threads');

const WORKER_FILE = path.join(__dirname, '..', 'workers', 'monthlyExcelBuildWorker.js');
const TIMEOUT_MS = Math.max(10000, Number(process.env.EXCEL_EXPORT_TIMEOUT_MS) || 180000);
const inFlight = new Map();

function runWorker(yearMonth) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_FILE, { workerData: { yearMonth } });
    let settled = false;
    const finish = (fn, value) => { if (settled) return; settled = true; clearTimeout(timer); fn(value); };
    const timer = setTimeout(() => {
      worker.terminate().catch(() => {});
      const error = new Error('Xuất Excel quá thời gian cho phép. Vui lòng thử lại sau.');
      error.statusCode = 504; error.code = 'EXCEL_EXPORT_TIMEOUT';
      finish(reject, error);
    }, TIMEOUT_MS);
    worker.once('message', (message) => {
      if (message?.ok) return finish(resolve, message.result);
      const error = new Error(message?.error?.message || 'Không thể tạo file Excel.');
      error.code = message?.error?.code; error.statusCode = message?.error?.statusCode;
      finish(reject, error);
    });
    worker.once('error', (error) => finish(reject, error));
    worker.once('exit', (code) => { if (code !== 0) finish(reject, new Error(`Excel worker exited with code ${code}`)); else finish(reject, new Error('Excel worker ended without a result')); });
  });
}

// One build per month at a time (same guarantee monthlyExcelService.inFlightBuilds gave in-process).
function buildMonthlyWorkbookInWorker(yearMonth) {
  if (inFlight.has(yearMonth)) return inFlight.get(yearMonth);
  const promise = runWorker(yearMonth).finally(() => inFlight.delete(yearMonth));
  inFlight.set(yearMonth, promise);
  return promise;
}

module.exports = { buildMonthlyWorkbookInWorker };
