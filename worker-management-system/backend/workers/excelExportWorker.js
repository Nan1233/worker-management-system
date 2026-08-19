const { parentPort, workerData } = require('worker_threads');
require('dotenv').config();
process.env.DB_CONNECTION_LIMIT = process.env.DB_WORKER_CONNECTION_LIMIT || '2';
process.env.DB_MAX_IDLE = process.env.DB_WORKER_MAX_IDLE || '1';

async function execute() {
  const startedAt = Date.now();
  const heapBefore = process.memoryUsage().heapUsed;
  const { type, payload = {} } = workerData || {};
  switch (type) {
    case 'process': {
      const { buildProcessWorkbook } = require('../services/processExcelExportService');
      const result = await buildProcessWorkbook(payload.yearMonth, payload.processId); return { ...result, metrics: { ...(result.metrics||{}), heapBefore, heapAfter: process.memoryUsage().heapUsed, workerDurationMs: Date.now()-startedAt } }; 
    }
    case 'company': {
      const { buildCompanyWorkbook } = require('../services/companyExcelExportService');
      const result = await buildCompanyWorkbook(payload.yearMonth, payload.groupCode); return { ...result, metrics: { ...(result.metrics||{}), heapBefore, heapAfter: process.memoryUsage().heapUsed, workerDurationMs: Date.now()-startedAt } }; 
    }
    case 'company-all': {
      const { buildBothCompanyWorkbooks } = require('../services/companyMaiDoExcelService');
      const result = await buildBothCompanyWorkbooks(payload.yearMonth); return { ...result, metrics: { ...(result.metrics||{}), heapBefore, heapAfter: process.memoryUsage().heapUsed, workerDurationMs: Date.now()-startedAt } }; 
    }
    case 'monthly': {
      const { buildMonthlyWorkbook } = require('../services/monthlyExcelService');
      const result = await buildMonthlyWorkbook(payload.yearMonth); return { ...result, metrics: { ...(result.metrics||{}), heapBefore, heapAfter: process.memoryUsage().heapUsed, workerDurationMs: Date.now()-startedAt } }; 
    }
    default:
      throw Object.assign(new Error(`Loại tác vụ Excel không hợp lệ: ${type}`), { statusCode: 400 });
  }
}

execute()
  .then(async (result) => {
    try {
      const db = require('../config/db');
      await db.closePool?.();
    } catch {
      // Worker kết thúc ngay sau khi gửi kết quả; không che lỗi export chính.
    }
    parentPort.postMessage({ ok: true, result });
  })
  .catch(async (error) => {
    try {
      const db = require('../config/db');
      await db.closePool?.();
    } catch {
      // Bỏ qua lỗi đóng pool để giữ nguyên lỗi gốc.
    }
    parentPort.postMessage({
      ok: false,
      error: { message: error?.message, statusCode: error?.statusCode || 500, stack: error?.stack }
    });
  });
