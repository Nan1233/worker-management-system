import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { runTestSuite } from './test-runner.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const frontendDir = path.join(repoRoot, 'frontend');
const reportDir = path.join(__dirname, 'reports');
const app = express();
const port = Number(process.env.PORT || 4790);
const localFrontendPort = Number(process.env.KTC_FRONTEND_PORT || 5174);
const expectedEnv = 'test';
const defaultFrontendUrl = `http://127.0.0.1:${localFrontendPort}`;
const defaultApiUrl = 'https://ktc-be-test.nan978971.workers.dev';

// TEST ONLY: fixed fixture credentials. Do not use these against production.
const TEST_MANAGER_USERNAME = 'manager1';
const TEST_MANAGER_PASSWORD = '123456';

let frontendProcess = null;
let frontendStartPromise = null;
let lastResult = null;
let lastReportPath = '';
let activeRun = null;
let runSequence = 0;

app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function assertTestTarget(url, label = 'URL') {
  let parsed;
  try { parsed = new URL(String(url || '')); } catch { throw new Error(`${label} không phải URL hợp lệ.`); }
  if (!/^https?:$/i.test(parsed.protocol)) throw new Error(`${label} phải dùng http/https.`);
  const host = parsed.hostname.toLowerCase();
  const allowed = host.includes('test') || host.includes('staging') || host === 'localhost' || host === '127.0.0.1';
  if (!allowed) throw new Error(`${label} không phải môi trường test: ${parsed.origin}. Production bị chặn.`);
}

async function waitForFrontend(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'chưa có phản hồi';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status < 500) return response.status;
      lastError = `HTTP ${response.status}`;
    } catch (error) { lastError = error.message; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Frontend local chưa khởi động sau ${timeoutMs / 1000}s: ${lastError}`);
}

function startLocalFrontend(apiUrl) {
  if (frontendProcess && !frontendProcess.killed) return frontendStartPromise;
  const viteBin = path.join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!fs.existsSync(viteBin)) throw new Error(`Không tìm thấy Vite tại ${viteBin}. Hãy chạy npm.cmd install trong frontend/.`);
  const env = { ...process.env, VITE_API_URL: `${apiUrl.replace(/\/$/, '')}/api` };
  frontendProcess = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(localFrontendPort), '--strictPort'], {
    cwd: frontendDir, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false,
  });
  frontendProcess.stdout?.on('data', chunk => process.stdout.write(`[KTC FE] ${chunk}`));
  frontendProcess.stderr?.on('data', chunk => process.stderr.write(`[KTC FE] ${chunk}`));
  frontendProcess.on('error', error => console.error(`[KTC FE] process error: ${error.message}`));
  frontendProcess.on('exit', code => { frontendProcess = null; frontendStartPromise = null; console.log(`[KTC FE] stopped with code ${code}`); });
  frontendStartPromise = waitForFrontend(`http://127.0.0.1:${localFrontendPort}`).catch(error => {
    if (frontendProcess && !frontendProcess.killed) frontendProcess.kill();
    frontendProcess = null; frontendStartPromise = null;
    throw new Error(`${error.message}. Kiểm tra frontend/node_modules/vite hoặc chạy npm.cmd install trong frontend/.`);
  });
  return frontendStartPromise;
}

function csvCell(value) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ');
  return `"${text.replace(/"/g, '""')}"`;
}

async function saveCsvReport(result) {
  await fs.promises.mkdir(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(reportDir, `ktc-test-result-${stamp}.csv`);
  const rows = [
    ['Test Case ID', 'Test Case', 'Status', 'Detail'],
    ...(result.results || []).map(x => [x.id, x.name, x.status, x.detail]),
  ];
  await fs.promises.writeFile(file, rows.map(row => row.map(csvCell).join(',')).join('\r\n'), 'utf8');
  lastReportPath = file;
  return file;
}

app.get('/api/config', (_req, res) => res.json({
  frontendUrl: defaultFrontendUrl,
  apiUrl: defaultApiUrl,
  environment: expectedEnv,
  frontendMode: 'local',
  frontendPort: localFrontendPort,
  managerFixture: TEST_MANAGER_USERNAME,
}));
app.get('/api/results', (_req, res) => res.json(lastResult || { results: [], summary: { total: 0, pass: 0, fail: 0, skip: 0 } }));
app.get('/api/results.csv', async (_req, res) => {
  if (!lastReportPath || !fs.existsSync(lastReportPath)) return res.status(404).send('Chưa có kết quả test.');
  res.download(lastReportPath, path.basename(lastReportPath));
});

// The browser must not hold one HTTP request open while Selenium/Chrome runs.
// Starting the suite asynchronously avoids "Failed to fetch" when Chrome or the
// test runner takes several minutes or encounters a child-process/network reset.
app.post('/api/run', async (_req, res) => {
  if (activeRun) return res.status(409).json({ error: 'TEST_ALREADY_RUNNING', runId: activeRun.id });
  const runId = `run-${Date.now()}-${++runSequence}`;
  activeRun = { id: runId, status: 'STARTING', result: null, error: null, startedAt: new Date().toISOString() };
  res.status(202).json({ runId, status: activeRun.status });

  try {
    const frontendUrl = defaultFrontendUrl;
    const apiUrl = defaultApiUrl;
    const managerUsername = TEST_MANAGER_USERNAME;
    const managerPassword = TEST_MANAGER_PASSWORD;
    assertTestTarget(frontendUrl, 'Frontend URL');
    assertTestTarget(apiUrl, 'Backend API URL');
    activeRun.status = 'RUNNING';
    await startLocalFrontend(apiUrl);
    const result = await runTestSuite({ frontendUrl, apiUrl, managerUsername, managerPassword });
    await saveCsvReport(result);
    lastResult = result;
    activeRun.status = 'DONE';
    activeRun.result = { ...result, reportUrl: '/api/results.csv' };
  } catch (error) {
    console.error('[KTC TEST CENTER] run failed:', error);
    activeRun.status = 'FAIL';
    activeRun.error = error?.stack || error?.message || String(error);
    activeRun.result = { results: [{ id: 'RUN', name: 'Test Center', status: 'FAIL', detail: error?.message || String(error) }], summary: { total: 1, pass: 0, fail: 1, skip: 0 }, log: 'Test runner failed.' };
  }
});

app.get('/api/run/status', (_req, res) => {
  if (!activeRun) return res.json({ status: 'IDLE', result: lastResult });
  if (activeRun.status === 'DONE' || activeRun.status === 'FAIL') {
    const finished = { ...activeRun };
    activeRun = null;
    return res.json(finished);
  }
  res.json({ id: activeRun.id, status: activeRun.status, startedAt: activeRun.startedAt });
});

app.post('/api/cleanup', async (_req, res) => {
  res.status(409).json({ error: 'CLEANUP_NOT_CONFIGURED', message: 'Dọn dữ liệu chưa được bật. Cần cấu hình TEST-ONLY DB adapter trước khi cho phép DELETE.' });
});

function shutdown() { if (frontendProcess && !frontendProcess.killed) frontendProcess.kill(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', error => console.error('[KTC TEST CENTER] uncaught exception:', error));
process.on('unhandledRejection', error => console.error('[KTC TEST CENTER] unhandled rejection:', error));
app.use((_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const server = app.listen(port, '127.0.0.1', () => {
  console.log(`KTC Test Center: http://127.0.0.1:${port}`);
  console.log(`Environment guard: ${expectedEnv}`);
  console.log(`Local frontend target: ${defaultFrontendUrl}`);
  console.log(`API target: ${defaultApiUrl}`);
  console.log(`Frontend source: ${frontendDir}`);
  console.log('TEST FIXTURE: manager1 / 123456');
  console.log('KTC Test Center is running. Keep this terminal open.');
});
server.on('error', error => console.error(`[KTC TEST CENTER] server error: ${error.code || error.message}`));
