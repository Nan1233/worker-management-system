import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function loginApi(apiUrl, username, password, accessType) {
  const r = await api(apiUrl, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, access_type: accessType }),
  });
  if (!r.response.ok || !r.body?.token) {
    throw new Error(`API login ${accessType}: HTTP ${r.response.status} ${r.body?.message || ''}`);
  }
  return r.body;
}

async function visible(page, selectors, timeout = 12000) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  const locator = page.locator(list.join(', ')).first();
  await locator.waitFor({ state: 'visible', timeout });
  return locator;
}

async function openLogin(page, frontendUrl) {
  await page.goto(`${frontendUrl}/#/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('#root').waitFor({ state: 'attached', timeout: 10000 });
  try {
    return await visible(page, [
      '#login-username',
      'input[autocomplete="username"]',
      'input[placeholder*="mã nhân viên" i]',
    ], 12000);
  } catch (error) {
    const bodyText = ((await page.locator('body').innerText().catch(() => '')) || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 700);
    const title = await page.title().catch(() => '');
    throw new Error(`Login UI không render: URL=${page.url()}; title=${title}; body=${bodyText || '(trống)'}; ${error?.message || error}`);
  }
}

function usernameInput(page) {
  return page.locator('#login-username, input[autocomplete="username"], input[placeholder*="mã nhân viên" i]').first();
}

async function screenshot(page, dir, id) {
  await fs.mkdir(dir, { recursive: true });
  return page.screenshot({ path: path.join(dir, `${id.replace(/[^a-z0-9_-]/gi, '_')}.png`), fullPage: true });
}

export async function runBrowserE2E({ frontendUrl, apiUrl, add, managerUsername, managerPassword }) {
  const results = [];
  const e2eDir = path.resolve(process.cwd(), 'test-results');
  const workerCode = process.env.KTC_TEST_WORKER_CODE || '';

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

  const headless = /^(1|true|yes)$/i.test(String(process.env.KTC_HEADLESS || '0'));
  const slowMo = Number(process.env.KTC_SLOWMO_MS || 350);
  console.log(`[KTC PLAYWRIGHT] Browser E2E Chromium: headless=${headless}; slowMo=${slowMo}ms`);
  const browser = await chromium.launch({
    headless,
    slowMo,
    args: headless ? [] : ['--start-maximized'],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(`PAGEERROR: ${error.message}`));

    await record('E2E-001', 'Manager login opens through FE', async () => {
      if (!managerUsername || !managerPassword) throw new Error('Thiếu manager credentials test.');
      await openLogin(page, frontendUrl);
      await usernameInput(page).fill(managerUsername);
      await page.getByRole('button', { name: /tiếp tục/i }).click();
      await page.getByRole('button', { name: /quản lý/i }).waitFor({ state: 'visible', timeout: 10000 });
      await page.getByRole('button', { name: /quản lý/i }).click();
      await visible(page, '#login-password, input[autocomplete="current-password"]');
      await page.locator('#login-password, input[autocomplete="current-password"]').first().fill(managerPassword);
      await page.getByRole('button', { name: /đăng nhập/i }).click();
      await page.waitForTimeout(1000);
      if (/\/login/i.test(page.url())) throw new Error(`Manager chưa rời trang login: ${page.url()}`);
      return `URL=${page.url()}`;
    });

    await record('E2E-002', 'Manager dashboard renders', async () => {
      if (/\/login/i.test(page.url())) throw new Error('Đang ở trang login.');
      const body = await page.locator('body').innerText();
      if (body.length < 100) throw new Error('Manager page có quá ít nội dung.');
      return `URL=${page.url()}; text=${body.length} chars`;
    });

    await record('E2E-003', 'Browser console manager flow stays clean', async () => {
      if (consoleErrors.length) throw new Error(consoleErrors.slice(0, 5).join(' | '));
      return 'Không có console error trong manager flow';
    });

    if (!workerCode) {
      for (const [id, name, detail] of [
        ['E2E-004', 'Worker login opens through FE', 'SKIP: chưa có KTC_TEST_WORKER_CODE.'],
        ['E2E-005', 'Worker home/process UI renders', 'SKIP: chưa có KTC_TEST_WORKER_CODE.'],
        ['E2E-006', 'Cắt mode selectable in FE', 'SKIP: chưa có KTC_TEST_WORKER_CODE.'],
        ['E2E-007', 'Lồng mode selectable in FE', 'SKIP: chưa có KTC_TEST_WORKER_CODE.'],
        ['E2E-008', 'Cắt shows only CAT defects', 'SKIP: chưa có KTC_TEST_WORKER_CODE.'],
        ['E2E-009', 'Lồng shows only LONG defects', 'SKIP: chưa có KTC_TEST_WORKER_CODE.'],
        ['E2E-010', 'Worker mobile layout opens', 'SKIP: chưa có KTC_TEST_WORKER_CODE.'],
      ]) add(name, 'SKIP', detail, id);
      await screenshot(page, e2eDir, 'E2E-manager-screen');
      if (!headless) await sleep(1000);
      await context.close();
      return { workerCode: '', results };
    }

    await loginApi(apiUrl, workerCode, '', 'worker');

    await record('E2E-004', 'Worker login opens through FE', async () => {
      await openLogin(page, frontendUrl);
      await usernameInput(page).fill(workerCode);
      await page.getByRole('button', { name: /tiếp tục/i }).click();
      await page.getByRole('button', { name: /công nhân/i }).waitFor({ state: 'visible', timeout: 10000 });
      await page.getByRole('button', { name: /công nhân/i }).click();
      await page.waitForTimeout(1000);
      if (/\/login/i.test(page.url())) throw new Error(`Worker chưa đăng nhập: ${page.url()}`);
      return `Worker=${workerCode}; URL=${page.url()}`;
    });

    await record('E2E-005', 'Worker home/process UI renders', async () => {
      const body = await page.locator('body').innerText();
      if (!/cắt|lồng|báo cáo|sản phẩm/i.test(body)) throw new Error('Không nhận diện được nội dung worker process.');
      return `URL=${page.url()}`;
    });

    const cutButton = page.getByRole('button', { name: /^Cắt$/ }).first();
    const longButton = page.getByRole('button', { name: /^Lồng$/ }).first();

    await record('E2E-006', 'Cắt mode selectable in FE', async () => {
      if (await cutButton.count() === 0) throw new Error('Không tìm thấy nút Cắt trên worker UI.');
      await cutButton.click();
      await sleep(500);
      if (!await cutButton.evaluate((el) => el.classList.contains('active'))) throw new Error('Nút Cắt không active sau click.');
      return 'Cắt active';
    });

    await record('E2E-007', 'Lồng mode selectable in FE', async () => {
      if (await longButton.count() === 0) throw new Error('Không tìm thấy nút Lồng trên worker UI.');
      await longButton.click();
      await sleep(500);
      if (!await longButton.evaluate((el) => el.classList.contains('active'))) throw new Error('Nút Lồng không active sau click.');
      return 'Lồng active';
    });

    await record('E2E-008', 'Cắt shows only CAT defects', async () => {
      await cutButton.click();
      const defectTrigger = page.getByRole('button', { name: /lỗi ng/i }).first();
      if (await defectTrigger.count()) await defectTrigger.click();
      const options = page.locator('#worker-ng-options');
      await options.waitFor({ state: 'visible', timeout: 10000 });
      const text = await options.innerText();
      for (const code of ['CAT01', 'CAT02', 'CAT03', 'CAT04']) if (!text.includes(code)) throw new Error(`Thiếu ${code} trên UI.`);
      for (const code of ['LONG01', 'LONG02', 'LONG03', 'LONG04', 'LONG05']) if (text.includes(code)) throw new Error(`${code} đang lọt vào Cắt.`);
      return 'CAT01-CAT04 hiển thị; LONG01-LONG05 bị ẩn';
    });

    await record('E2E-009', 'Lồng shows only LONG defects', async () => {
      await longButton.click();
      const options = page.locator('#worker-ng-options');
      await options.waitFor({ state: 'visible', timeout: 10000 });
      const text = await options.innerText();
      for (const code of ['LONG01', 'LONG02', 'LONG03', 'LONG04', 'LONG05']) if (!text.includes(code)) throw new Error(`Thiếu ${code} trên UI.`);
      for (const code of ['CAT01', 'CAT02', 'CAT03', 'CAT04']) if (text.includes(code)) throw new Error(`${code} đang lọt vào Lồng.`);
      return 'LONG01-LONG05 hiển thị; CAT01-CAT04 bị ẩn';
    });

    await record('E2E-010', 'Worker mobile layout opens', async () => {
      const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const p = await mobile.newPage();
      await p.goto(`${frontendUrl}/#/worker`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 8);
      await mobile.close();
      if (overflow) throw new Error('Mobile UI có horizontal overflow.');
      return '390x844 không overflow ngang';
    });

    await record('E2E-011', 'Browser console worker flow stays clean', async () => {
      if (consoleErrors.length) throw new Error(consoleErrors.slice(0, 5).join(' | '));
      return 'Không có console error trong worker flow';
    });

    await screenshot(page, e2eDir, 'E2E-final-worker-screen');
    if (!headless) await sleep(1000);
    await context.close();
  } finally {
    await browser.close();
  }

  return { workerCode, results };
}
