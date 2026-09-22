import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { runTestSuite } from './test-runner.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const frontendDir = path.join(repoRoot, 'frontend');
const app = express();
const port = Number(process.env.PORT || 4790);
// Use a dedicated port so an already-running KTC frontend on :5173 can never be mistaken for the test FE.
const localFrontendPort = Number(process.env.KTC_FRONTEND_PORT || 5174);
const expectedEnv = process.env.KTC_TEST_ENV || 'test';
const defaultFrontendUrl = process.env.KTC_FRONTEND_URL || `http://127.0.0.1:${localFrontendPort}`;
const defaultApiUrl = process.env.KTC_API_URL || 'https://ktc-be-test.nan978971.workers.dev';

let frontendProcess = null;
let frontendStartPromise = null;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function assertTestTarget(url, label = 'URL') {
  let parsed;
  try { parsed = new URL(String(url || '')); } catch { throw new Error(`${label} không phải URL hợp lệ.`); }
  if (!/^https?:$/i.test(parsed.protocol)) throw new Error(`${label} phải dùng http/https.`);
  if (expectedEnv !== 'test') return;
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
    } catch (error) {
      lastError = error.message;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Frontend local chưa khởi động sau ${timeoutMs / 1000}s: ${lastError}`);
}

function startLocalFrontend(apiUrl) {
  if (frontendProcess && !frontendProcess.killed) return frontendStartPromise;

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const env = {
    ...process.env,
    VITE_API_URL: `${apiUrl.replace(/\/$/, '')}/api`,
  };

  frontendProcess = spawn(npmCommand, ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(localFrontendPort), '--strictPort'], {
    cwd: frontendDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  frontendProcess.stdout?.on('data', chunk => process.stdout.write(`[KTC FE] ${chunk}`));
  frontendProcess.stderr?.on('data', chunk => process.stderr.write(`[KTC FE] ${chunk}`));
  frontendProcess.on('error', error => console.error(`[KTC FE] process error: ${error.message}`));
  frontendProcess.on('exit', code => {
    frontendProcess = null;
    frontendStartPromise = null;
    console.log(`[KTC FE] stopped with code ${code}`);
  });

  frontendStartPromise = waitForFrontend(`http://127.0.0.1:${localFrontendPort}`)
    .catch(error => {
      if (frontendProcess && !frontendProcess.killed) frontendProcess.kill();
      frontendProcess = null;
      frontendStartPromise = null;
      throw new Error(`${error.message}. Hãy chạy npm.cmd install trong frontend/ nếu node_modules chưa có.`);
    });

  return frontendStartPromise;
}

app.get('/api/config', (_req, res) => res.json({
  frontendUrl: defaultFrontendUrl,
  apiUrl: defaultApiUrl,
  environment: expectedEnv,
  frontendMode: 'local',
  frontendPort: localFrontendPort,
}));

app.post('/api/run', async (req, res) => {
  try {
    const frontendUrl = String(req.body?.frontendUrl || defaultFrontendUrl).trim();
    const apiUrl = String(req.body?.apiUrl || defaultApiUrl).trim();
    assertTestTarget(frontendUrl, 'Frontend URL');
    assertTestTarget(apiUrl, 'Backend API URL');

    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(frontendUrl)) {
      await startLocalFrontend(apiUrl);
    }

    const result = await runTestSuite({ frontendUrl, apiUrl });
    res.json(result);
  } catch (error) {
    console.error('[KTC TEST CENTER] run failed:', error);
    res.status(400).json({ error: error.message, results: [] });
  }
});

app.post('/api/cleanup', async (_req, res) => {
  res.status(409).json({ error: 'CLEANUP_NOT_CONFIGURED', message: 'Dọn dữ liệu chưa được bật. Cần cấu hình TEST-ONLY DB adapter trước khi cho phép DELETE.' });
});

function shutdown() {
  if (frontendProcess && !frontendProcess.killed) frontendProcess.kill();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

app.use((_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(port, () => {
  console.log(`KTC Test Center: http://127.0.0.1:${port}`);
  console.log(`Environment guard: ${expectedEnv}`);
  console.log(`Local frontend target: ${defaultFrontendUrl}`);
  console.log(`API target: ${defaultApiUrl}`);
  console.log(`Frontend source: ${frontendDir}`);
});
