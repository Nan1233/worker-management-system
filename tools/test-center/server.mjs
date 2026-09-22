import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTestSuite } from './test-runner.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 4790);
const expectedEnv = process.env.KTC_TEST_ENV || 'test';
const defaultFrontendUrl = process.env.KTC_FRONTEND_URL || 'https://ktc-frontend-test.nan978971.workers.dev';
const defaultApiUrl = process.env.KTC_API_URL || 'https://ktc-be-test.nan978971.workers.dev';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function assertTestTarget(url) {
  const target = String(url || '').toLowerCase();
  if (expectedEnv === 'test' && !/(test|staging|127\.0\.0\.1|localhost)/i.test(target)) {
    throw new Error('Chỉ được chạy Test Center với URL test/staging/local. Production bị chặn.');
  }
}

app.get('/api/config', (_req, res) => res.json({ frontendUrl: defaultFrontendUrl, apiUrl: defaultApiUrl, environment: expectedEnv }));

app.post('/api/run', async (req, res) => {
  try {
    const frontendUrl = req.body?.frontendUrl || defaultFrontendUrl;
    const apiUrl = req.body?.apiUrl || defaultApiUrl;
    assertTestTarget(frontendUrl);
    assertTestTarget(apiUrl);
    const result = await runTestSuite({ frontendUrl, apiUrl });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message, results: [] });
  }
});

app.post('/api/cleanup', async (_req, res) => {
  res.status(409).json({ error: 'CLEANUP_NOT_CONFIGURED', message: 'Dọn dữ liệu chưa được bật. Cần cấu hình TEST-ONLY DB adapter trước khi cho phép DELETE.' });
});

app.use((_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(port, () => {
  console.log(`KTC Test Center: http://127.0.0.1:${port}`);
  console.log(`Environment guard: ${expectedEnv}`);
  console.log(`Frontend target: ${defaultFrontendUrl}`);
  console.log(`API target: ${defaultApiUrl}`);
});
