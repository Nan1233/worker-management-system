#!/usr/bin/env node
'use strict';

/**
 * Safe production smoke test.
 *
 * This intentionally performs READ-ONLY business checks against the configured
 * Render/TiDB environment. It does not create, approve, edit or delete reports.
 * For write-path E2E use scripts/zero-cost/critical-e2e.cjs against an isolated
 * staging database, never against production.
 */
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('../desktop/node_modules/exceljs');
const mysql = require('./../backend/node_modules/mysql2/promise');
const { buildCompanyExcelLocal } = require('../desktop/electron/companyExcelLocal.cjs');
const { verifyDatabaseSchema, toSafeSchemaDiagnostics } = require('../backend/services/databaseSchemaService');
const { Client } = require('./zero-cost/http.cjs');

const API_BASE_URL = String(process.env.KTC_PROD_API_URL || process.env.LOCAL_BACKEND_URL || '').replace(/\/$/, '');
const WORKER_CODE = String(process.env.KTC_E2E_WORKER_CODE || '').trim();
const MANAGER_USERNAME = String(process.env.KTC_E2E_MANAGER_USERNAME || '').trim();
const MANAGER_PASSWORD = String(process.env.KTC_E2E_MANAGER_PASSWORD || '');
const DATE = /^\d{4}-\d{2}-\d{2}$/.test(String(process.env.KTC_E2E_DATE || ''))
  ? String(process.env.KTC_E2E_DATE)
  : new Date().toISOString().slice(0, 10);
const OUT_DIR = path.resolve(process.env.KTC_VALIDATION_DIR || 'validation-artifacts');

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };

async function login(client, username, password, accessType) {
  const body = accessType === 'worker'
    ? { username, access_type: 'worker' }
    : { username, password, access_type: 'management' };
  const response = await client.req('POST', '/api/auth/login', body);
  assert(response.status === 200, `${accessType} login failed: HTTP ${response.status}`);
  return response;
}

async function main() {
  if (!API_BASE_URL) fail('KTC_PROD_API_URL is required, e.g. https://worker-management-system-...onrender.com/api');
  if (!WORKER_CODE) fail('KTC_E2E_WORKER_CODE is required');
  if (!MANAGER_USERNAME || !MANAGER_PASSWORD) fail('KTC_E2E_MANAGER_USERNAME and KTC_E2E_MANAGER_PASSWORD are required');
  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
    fail('Production DB variables are required for the read-only DB check');
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const results = [];
  const record = (name, ok, evidence) => {
    results.push({ name, result: ok ? 'PASS' : 'FAIL', evidence });
    if (!ok) process.exitCode = 1;
  };

  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 4000),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL_CA && process.env.DB_SSL_CA !== '...'
      ? { ca: String(process.env.DB_SSL_CA).replace(/\\n/g, '\n'), rejectUnauthorized: true }
      : (['true', '1', 'yes'].includes(String(process.env.DB_SSL || process.env.MYSQL_SSL || 'true').toLowerCase()) ? {} : undefined)
  });

  try {
    const schema = await verifyDatabaseSchema();
    const diag = toSafeSchemaDiagnostics(schema);
    record('TiDB schema contract', schema.ready, schema.ready ? `contract=${diag.contractVersion}` : JSON.stringify(diag));

    const [[counts]] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM workers) AS workers,
        (SELECT COUNT(*) FROM processes) AS processes,
        (SELECT COUNT(*) FROM machines) AS machines,
        (SELECT COUNT(*) FROM product_standards) AS product_standards,
        (SELECT COUNT(*) FROM production_reports) AS approved_reports
    `);
    const countText = Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ');
    record('TiDB master/production counts', Number(counts.workers) > 0 && Number(counts.processes) > 0 && Number(counts.machines) > 0, countText);

    const worker = new Client(API_BASE_URL);
    const manager = new Client(API_BASE_URL);
    const live = await worker.req('GET', '/api/health/live');
    record('API live', live.status === 200 && live.data?.status === 'live', `HTTP ${live.status}`);
    record('Runtime security headers', Boolean(live.headers?.['x-content-type-options'] || live.headers?.['content-security-policy']), 'security headers observed');
    const ready = await worker.req('GET', '/api/health/ready');
    record('API ready + DB', ready.status === 200 && ready.data?.status === 'ready' && ready.data?.schemaReady === true, `HTTP ${ready.status}, db=${ready.data?.database}`);

    await login(worker, WORKER_CODE, '', 'worker');
    const workerHistory = await worker.req('GET', '/api/production-temp/my');
    record('Worker authenticated read', workerHistory.status === 200, `HTTP ${workerHistory.status}`);

    await login(manager, MANAGER_USERNAME, MANAGER_PASSWORD, 'manager');
    const pending = await manager.req('GET', '/api/production-temp/pending');
    record('Manager authenticated read', pending.status === 200, `HTTP ${pending.status}`);

    const companyData = await manager.req('GET', `/api/reports/export-excel/company-data?date=${encodeURIComponent(DATE)}`);
    const data = companyData.data?.data;
    const processMap = data?.processes || {};
    const reportCount = Object.values(processMap).reduce((sum, item) => sum + (Array.isArray(item?.reports) ? item.reports.length : 0), 0);
    record('DB → Excel API contract', companyData.status === 200 && Boolean(data?.processes), `HTTP ${companyData.status}, reports=${reportCount}, source=${data?.dataSource || 'unknown'}`);

    if (companyData.status === 200 && data?.processes) {
      const payload = {
        groups: {
          GIA_CONG: { processes: ['GC'].map(code => processMap[code]).filter(Boolean) },
          MAI_DO: { processes: ['MAI', 'DO'].map(code => processMap[code]).filter(Boolean) }
        }
      };
      const appPath = path.resolve(__dirname, '..', 'desktop');
      for (const groupCode of ['GIA_CONG', 'MAI_DO']) {
        const built = await buildCompanyExcelLocal({ appPath, date: DATE, groupCode, payload });
        assert(Buffer.isBuffer(built.buffer) && built.buffer.length > 5000, `${groupCode} workbook buffer is unexpectedly small`);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(built.buffer);
        assert(built.requestedYearMonth === DATE.slice(0, 7), `${groupCode} workbook period mismatch`);
        assert(workbook.worksheets.length > 0, `${groupCode} workbook has no sheets`);
        const output = path.join(OUT_DIR, `production-${groupCode}-${DATE.slice(0, 7)}.xlsx`);
        fs.writeFileSync(output, built.buffer);
        record(`DB → real Excel ${groupCode}`, true, `${built.fileName}, ${built.buffer.length} bytes, sheets=${workbook.worksheets.length}`);
      }
    } else {
      record('DB → real Excel workbooks', false, 'Skipped because company-data API failed');
    }

    fs.writeFileSync(path.join(OUT_DIR, 'production-smoke.json'), JSON.stringify({
      date: DATE,
      api: API_BASE_URL,
      readOnly: true,
      results
    }, null, 2));
    console.table(results);
    console.log(`KTC_PRODUCTION_SMOKE=${results.every(item => item.result === 'PASS') ? 'PASS' : 'FAIL'}`);
  } finally {
    await db.end().catch(() => undefined);
  }
}

main().catch(error => {
  console.error('KTC_PRODUCTION_SMOKE_FATAL', error.stack || error.message);
  process.exitCode = 1;
});
