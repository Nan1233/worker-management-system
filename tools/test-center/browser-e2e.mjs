import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const step = (id, n, msg, extra = '') => console.log(`[KTC E2E][${id}][${n}] ${msg}${extra ? ` | ${extra}` : ''}`);

async function visible(page, selectors, timeout = 12000) {
  const locator = page.locator((Array.isArray(selectors) ? selectors : [selectors]).join(', ')).first();
  await locator.waitFor({ state: 'visible', timeout });
  return locator;
}

async function openLogin(page, frontendUrl, id) {
  step(id, '01', 'Mở trang login', `${frontendUrl}/#/login`);
  await page.goto(`${frontendUrl}/#/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  step(id, '02', 'DOM loaded', `url=${page.url()}`);
  await page.locator('#root').waitFor({ state: 'attached', timeout: 10000 });
  step(id, '03', 'React root attached');
  try {
    const input = await visible(page, ['#login-username', 'input[autocomplete="username"]', 'input[placeholder*="mã nhân viên" i]']);
    step(id, '04', 'Tìm thấy username input', await input.evaluate(el => el.id || el.getAttribute('name') || el.tagName));
    return input;
  } catch (error) {
    const body = ((await page.locator('body').innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 700);
    throw new Error(`Login UI không render: URL=${page.url()}; title=${await page.title().catch(() => '')}; body=${body || '(trống)'}; ${error.message}`);
  }
}

async function screenshot(page, dir, id) {
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${id}.png`);
  await page.screenshot({ path: file, fullPage: true });
  step(id, 'SCREENSHOT', 'Screenshot', file);
}

export async function runBrowserE2E({ frontendUrl, add, managerUsername, managerPassword }) {
  const results = [];
  const resultDir = path.resolve(process.cwd(), 'test-results');
  const record = async (id, name, fn, page) => {
    const started = Date.now();
    step(id, 'START', name);
    try {
      const detail = await fn();
      const finalDetail = `${detail || 'OK'} | duration=${Date.now() - started}ms`;
      results.push({ id, name, status: 'PASS', detail: finalDetail });
      add(name, 'PASS', finalDetail, id);
      step(id, 'PASS', name, finalDetail);
    } catch (error) {
      const detail = error?.message || String(error);
      try { await screenshot(page, resultDir, `${id}-FAIL`); } catch {}
      results.push({ id, name, status: 'FAIL', detail });
      add(name, 'FAIL', detail, id);
      step(id, 'FAIL', name, detail);
    }
  };

  const headless = /^(1|true|yes)$/i.test(String(process.env.KTC_HEADLESS || '0'));
  const slowMo = Number(process.env.KTC_SLOWMO_MS || 350);
  console.log(`[KTC PLAYWRIGHT] Browser E2E Chromium: headless=${headless}; slowMo=${slowMo}ms`);
  const browser = await chromium.launch({ headless, slowMo, args: headless ? [] : ['--start-maximized'] });
  step('SYS', '01', 'Chromium launched', `headless=${headless}`);

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await context.newPage();
    step('SYS', '02', 'Desktop page created', '1440x900');
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') { consoleErrors.push(msg.text()); step('CONSOLE', 'ERROR', msg.text()); } });
    page.on('pageerror', error => { consoleErrors.push(`PAGEERROR: ${error.message}`); step('CONSOLE', 'PAGEERROR', error.message); });

    await record('E2E-001', 'Manager login through FE', async () => {
      if (!managerUsername || !managerPassword) throw new Error('Thiếu manager credentials test.');
      const input = await openLogin(page, frontendUrl, 'E2E-001');
      step('E2E-001', '05', 'Nhập manager username');
      await input.fill(managerUsername);
      step('E2E-001', '06', 'Click Tiếp tục');
      await page.getByRole('button', { name: /tiếp tục/i }).click();
      step('E2E-001', '07', 'Chờ nút Quản lý');
      await page.getByRole('button', { name: /quản lý/i }).waitFor({ state: 'visible', timeout: 10000 });
      step('E2E-001', '08', 'Click Quản lý');
      await page.getByRole('button', { name: /quản lý/i }).click();
      step('E2E-001', '09', 'Chờ password');
      const password = await visible(page, ['#login-password', 'input[autocomplete="current-password"]']);
      step('E2E-001', '10', 'Nhập password');
      await password.fill(managerPassword);
      step('E2E-001', '11', 'Click Đăng nhập');
      await page.getByRole('button', { name: /đăng nhập/i }).click();
      step('E2E-001', '12', 'Chờ kết quả login');
      await page.waitForTimeout(1500);
      if (/\/login/i.test(page.url())) {
        const text = ((await page.locator('body').innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(-500);
        throw new Error(`Login không thành công; URL=${page.url()}; message=${text}`);
      }
      return `URL=${page.url()}`;
    }, page);

    await record('E2E-002', 'Manager dashboard renders', async () => {
      if (/\/login/i.test(page.url())) throw new Error('Đang ở /login nên không thể kiểm tra dashboard.');
      const body = await page.locator('body').innerText();
      if (body.length < 100) throw new Error(`Dashboard quá ít nội dung: ${body.length} chars`);
      return `URL=${page.url()}; text=${body.length} chars`;
    }, page);

    await record('E2E-003', 'Manager console clean', async () => {
      if (consoleErrors.length) throw new Error(consoleErrors.slice(0, 10).join(' | '));
      return 'Không có console error';
    }, page);

    await screenshot(page, resultDir, 'manager-final');
    await context.close();
    return { results };
  } finally {
    await browser.close();
    step('SYS', '99', 'Chromium closed');
  }
}
