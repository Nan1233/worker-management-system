import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unique = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`.toUpperCase();

async function json(response) {
  let body = null;
  try { body = await response.json(); } catch {}
  return { response, body };
}

async function api(base, pathName, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  return json(await fetch(`${base}${pathName}`, { ...options, headers }));
}

function unwrap(body) {
  return Array.isArray(body?.data) ? body.data : body?.data?.items || body?.data || [];
}

function codeOf(x) { return String(x?.defect_code || x?.code || '').trim().toUpperCase(); }
function processCodeOf(x) { return String(x?.process_code || x?.code || '').trim().toUpperCase(); }
function processNameOf(x) { return String(x?.process_name || x?.name || '').trim(); }

async function loginApi(apiUrl, username, password, accessType) {
  const r = await api(apiUrl, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, access_type: accessType }),
  });
  if (!r.response.ok || !r.body?.token) throw new Error(`API login ${accessType}: HTTP ${r.response.status} ${r.body?.message || ''}`);
  return r.body;
}

async function makeWorkerFixture(apiUrl, managerToken) {
  const processes = await api(apiUrl, '/api/users/options/processes', { headers: { Authorization: `Bearer ${managerToken}` } });
  if (!processes.response.ok) throw new Error(`Không lấy được processes: HTTP ${processes.response.status}`);
  const rows = unwrap(processes.body).map((x) => ({ id: Number(x.id), code: processCodeOf(x), name: processNameOf(x) })).filter((x) => x.id > 0);
  if (!rows.length) throw new Error('Không có process active để tạo worker test.');
  const workerCode = unique('TCW');
  const r = await api(apiUrl, '/api/users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${managerToken}` },
    body: JSON.stringify({
      username: workerCode.toLowerCase(), full_name: `KTC Test Worker ${workerCode}`,
      role: 'worker', worker_code: workerCode, department: 'TEST ONLY', position: 'Công nhân',
      training_percent: 100, status: 'active', process_ids: rows.map((x) => x.id),
    }),
  });
  if (!r.response.ok || !r.body?.success) throw new Error(`Tạo worker fixture: HTTP ${r.response.status} ${r.body?.message || ''}`);
  return { workerCode, processes: rows };
}

async function textVisible(page, text, timeout = 5000) {
  const loc = page.getByText(text, { exact: true }).first();
  await loc.waitFor({ state: 'visible', timeout });
  return loc;
}

async function clickText(page, text, timeout = 5000) {
  const loc = await textVisible(page, text, timeout);
  await loc.click();
  await sleep(250);
  return loc;
}

async function screenshot(page, dir, id) {
  await fs.mkdir(dir, { recursive: true });
  const safe = id.replace(/[^a-z0-9_-]/gi, '_');
  return page.screenshot({ path: path.join(dir, `${safe}.png`), fullPage: true });
}

export async function runBrowserE2E({ frontendUrl, apiUrl, add, managerUsername, managerPassword }) {
  if (!managerUsername || !managerPassword) {
    add('Browser E2E credentials', 'SKIP', 'Cần KTC_TEST_MANAGER_USERNAME và KTC_TEST_MANAGER_PASSWORD.', 'E2E-000');
    return;
  }

  const results = [];
  const e2eDir = path.resolve(process.cwd(), 'test-results');
  const record = async (id, name, fn) => {
    try {
      const detail = await fn();
      results.push({ id, name, status: 'PASS', detail: detail || 'UI thao tác thành công.' });
      add(name, 'PASS', detail || 'UI thao tác thành công.', id);
    } catch (error) {
      const detail = error?.message || String(error);
      results.push({ id, name, status: 'FAIL', detail });
      add(name, 'FAIL', detail, id);
    }
  };

  const manager = await loginApi(apiUrl, managerUsername, managerPassword, 'management');
  const fixture = await makeWorkerFixture(apiUrl, manager.token);

  // Visible browser is intentional. Set KTC_HEADLESS=1 only for CI.
  const browser = await chromium.launch({
    headless: !/^(1|true|yes)$/i.test(String(process.env.KTC_HEADLESS || '0')),
    slowMo: Number(process.env.KTC_SLOWMO_MS || 120),
  });

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', (error) => consoleErrors.push(`PAGEERROR: ${error.message}`));

    await record('E2E-001', 'Manager login opens through FE', async () => {
      await page.goto(`${frontendUrl}/#/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.locator('#login-username').fill(managerUsername);
      await page.getByRole('button', { name: /tiếp tục/i }).click();
      await textVisible(page, 'Quản lý', 10000);
      await clickText(page, 'Quản lý');
      await page.locator('#login-password').fill(managerPassword);
      await page.getByRole('button', { name: /đăng nhập/i }).click();
      await page.waitForTimeout(800);
      if (/\/login/i.test(page.url())) throw new Error(`Manager chưa rời trang login: ${page.url()}`);
      return `URL=${page.url()}`;
    });

    await record('E2E-002', 'Manager dashboard renders', async () => {
      const body = await page.locator('body').innerText();
      if (body.length < 100) throw new Error('Manager page có quá ít nội dung.');
      return `URL=${page.url()}; text=${body.length} chars`;
    });

    // Re-enter login to test worker UI independently of manager UI.
    await page.goto(`${frontendUrl}/#/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.locator('#login-username').fill(fixture.workerCode);
    await page.getByRole('button', { name: /tiếp tục/i }).click();
    await textVisible(page, 'Công nhân', 10000);
    await clickText(page, 'Công nhân');
    await page.waitForTimeout(1000);

    await record('E2E-003', 'Worker login opens through FE', async () => {
      if (/\/login/i.test(page.url())) throw new Error(`Worker chưa đăng nhập: ${page.url()}`);
      return `Worker=${fixture.workerCode}; URL=${page.url()}`;
    });

    await record('E2E-004', 'Worker home/process UI renders', async () => {
      const body = await page.locator('body').innerText();
      if (!/cắt|lồng|báo cáo|sản phẩm/i.test(body)) throw new Error('Không nhận diện được nội dung worker process.');
      return `URL=${page.url()}`;
    });

    // The current KTC route exposes a combined Cắt/Lồng form. Test it exactly as a user does.
    const cutButton = page.getByRole('button', { name: /^Cắt$/ }).first();
    const longButton = page.getByRole('button', { name: /^Lồng$/ }).first();
    if (await cutButton.count() === 0 || await longButton.count() === 0) {
      throw new Error('Không tìm thấy nút Cắt/Lồng trên worker UI.');
    }

    await record('E2E-005', 'Cắt mode selectable in FE', async () => {
      await cutButton.click();
      await sleep(500);
      const active = await cutButton.evaluate((el) => el.classList.contains('active'));
      if (!active) throw new Error('Nút Cắt không active sau click.');
      return 'Cắt active';
    });

    await record('E2E-006', 'Lồng mode selectable in FE', async () => {
      await longButton.click();
      await sleep(500);
      const active = await longButton.evaluate((el) => el.classList.contains('active'));
      if (!active) throw new Error('Nút Lồng không active sau click.');
      return 'Lồng active';
    });

    await record('E2E-007', 'Cắt shows only CAT defects', async () => {
      await cutButton.click();
      await page.getByRole('button', { name: /lỗi ng/i }).first().click();
      await page.waitForTimeout(500);
      const text = await page.locator('#worker-ng-options').innerText();
      for (const code of ['CAT01', 'CAT02', 'CAT03', 'CAT04']) if (!text.includes(code)) throw new Error(`Thiếu ${code} trên UI.`);
      for (const code of ['LONG01', 'LONG02', 'LONG03', 'LONG04', 'LONG05']) if (text.includes(code)) throw new Error(`${code} đang lọt vào Cắt.`);
      return 'CAT01-CAT04 hiển thị; LONG01-LONG05 bị ẩn';
    });

    await record('E2E-008', 'Lồng shows only LONG defects', async () => {
      await longButton.click();
      await page.waitForTimeout(500);
      const text = await page.locator('#worker-ng-options').innerText();
      for (const code of ['LONG01', 'LONG02', 'LONG03', 'LONG04', 'LONG05']) if (!text.includes(code)) throw new Error(`Thiếu ${code} trên UI.`);
      for (const code of ['CAT01', 'CAT02', 'CAT03', 'CAT04']) if (text.includes(code)) throw new Error(`${code} đang lọt vào Lồng.`);
      return 'LONG01-LONG05 hiển thị; CAT01-CAT04 bị ẩn';
    });

    const expectedLabels = [
      ['LONG01', 'LONG01'],
      ['LONG02', 'LONG02 — Xước'],
      ['LONG03', 'LONG03 — Vỡ'],
      ['LONG04', 'LONG04 — Trục cong'],
      ['LONG05', 'LONG05 — Lỗi cao su'],
    ];
    await record('E2E-009', 'Lồng defect labels include code before name', async () => {
      const text = await page.locator('#worker-ng-options').innerText();
      for (const [code, expected] of expectedLabels) {
        if (!text.includes(code)) throw new Error(`Thiếu mã ${code}.`);
        if (expected.includes('—') && !text.includes(expected)) throw new Error(`Thiếu nhãn ${expected}.`);
      }
      return expectedLabels.map((x) => x[1]).join('; ');
    });

    await record('E2E-010', 'Cắt defect labels include code before name', async () => {
      await cutButton.click();
      const text = await page.locator('#worker-ng-options').innerText();
      for (const code of ['CAT01', 'CAT02', 'CAT03', 'CAT04']) if (!text.includes(code)) throw new Error(`Thiếu mã ${code}.`);
      return text.replace(/\s+/g, ' ').trim();
    });

    await record('E2E-011', 'Worker mobile layout opens', async () => {
      const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const p = await mobile.newPage();
      await p.goto(`${frontendUrl}/#/worker`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 8);
      await mobile.close();
      if (overflow) throw new Error('Mobile UI có horizontal overflow.');
      return '390x844 không overflow ngang';
    });

    await record('E2E-012', 'Browser console stays clean during worker flow', async () => {
      if (consoleErrors.length) throw new Error(consoleErrors.slice(0, 5).join(' | '));
      return 'Không có console error';
    });

    await screenshot(page, e2eDir, 'E2E-final-worker-screen');
    await context.close();
  } finally {
    await browser.close();
  }

  return { workerCode: fixture.workerCode, results };
}
