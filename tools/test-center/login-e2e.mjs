import { chromium } from 'playwright';

async function visible(page, selectors, timeout = 12000) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  const locator = page.locator(list.join(', ')).first();
  await locator.waitFor({ state: 'visible', timeout });
  return locator;
}

async function runCase(add, id, name, fn) {
  try {
    const detail = await fn();
    add(name, 'PASS', detail || 'OK', id);
  } catch (error) {
    add(name, 'FAIL', error?.message || String(error), id);
  }
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
      .slice(0, 500);
    const title = await page.title().catch(() => '');
    throw new Error(`Login UI không render: URL=${page.url()}; title=${title}; body=${bodyText || '(trống)'}; ${error?.message || error}`);
  }
}

function usernameInput(page) {
  return page.locator('#login-username, input[autocomplete="username"], input[placeholder*="mã nhân viên" i]').first();
}

export async function runLoginE2E({ frontendUrl, add, managerUsername = '', managerPassword = '' }) {
  let browser;
  try {
    browser = await chromium.launch({
      headless: /^(1|true|yes)$/i.test(String(process.env.KTC_HEADLESS || '0')),
      slowMo: Number(process.env.KTC_SLOWMO_MS || 120),
    });

    for (const [device, width, height] of [
      ['desktop', 1440, 900],
      ['mobile', 390, 844],
    ]) {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('pageerror', (error) => consoleErrors.push(`PAGEERROR: ${error.message}`));

      await runCase(add, `LOGIN-${device === 'desktop' ? '001' : '009'}`, `Login page ${device} renders`, async () => {
        await openLogin(page, frontendUrl);
        const title = await page.locator('h1').innerText();
        const submit = await page.getByRole('button', { name: /tiếp tục/i }).count();
        if (!/chào mừng/i.test(title) || submit !== 1) throw new Error(`Login UI không đúng: title=${title}; submit=${submit}`);
        return `viewport=${width}x${height}`;
      });

      if (device === 'desktop') {
        await runCase(add, 'LOGIN-002', 'Login rejects empty employee code', async () => {
          await openLogin(page, frontendUrl);
          await page.getByRole('button', { name: /tiếp tục/i }).click();
          const alert = await visible(page, '[role="alert"]');
          const text = await alert.innerText();
          if (!/mã nhân viên/i.test(text)) throw new Error(`Thông báo sai: ${text}`);
          return text;
        });

        await runCase(add, 'LOGIN-003', 'Valid employee code opens role choice', async () => {
          await openLogin(page, frontendUrl);
          await usernameInput(page).fill(managerUsername || 'manager1');
          await page.getByRole('button', { name: /tiếp tục/i }).click();
          await page.getByRole('button', { name: /công nhân/i }).waitFor({ state: 'visible' });
          await page.getByRole('button', { name: /quản lý/i }).waitFor({ state: 'visible' });
          return 'Công nhân + Quản lý hiển thị';
        });

        await runCase(add, 'LOGIN-004', 'Back from role choice returns to employee code', async () => {
          await page.getByRole('button', { name: /nhập lại mã nhân viên/i }).click();
          await usernameInput(page).waitFor({ state: 'visible' });
          return 'Quay lại bước 1';
        });

        await runCase(add, 'LOGIN-005', 'Management role opens password step', async () => {
          await usernameInput(page).fill(managerUsername || 'manager1');
          await page.getByRole('button', { name: /tiếp tục/i }).click();
          await page.getByRole('button', { name: /quản lý/i }).click();
          await visible(page, '#login-password, input[autocomplete="current-password"]');
          return 'Password field visible';
        });

        await runCase(add, 'LOGIN-006', 'Management login rejects empty password', async () => {
          await page.getByRole('button', { name: /đăng nhập/i }).click();
          const alert = await visible(page, '[role="alert"]');
          const text = await alert.innerText();
          if (!/mật khẩu/i.test(text)) throw new Error(`Thông báo sai: ${text}`);
          return text;
        });

        await runCase(add, 'LOGIN-007', 'Password visibility toggle works', async () => {
          const input = page.locator('#login-password, input[autocomplete="current-password"]').first();
          await input.fill('test-password');
          if (await input.getAttribute('type') !== 'password') throw new Error('Mặc định password không phải type=password.');
          await page.getByRole('button', { name: /hiện mật khẩu/i }).click();
          if (await input.getAttribute('type') !== 'text') throw new Error('Nút Hiện không đổi sang text.');
          await page.getByRole('button', { name: /ẩn mật khẩu/i }).click();
          if (await input.getAttribute('type') !== 'password') throw new Error('Nút Ẩn không đổi lại password.');
          return 'Hiện/Ẩn mật khẩu hoạt động';
        });

        await runCase(add, 'LOGIN-008', 'Valid manager credentials login through FE', async () => {
          if (!managerUsername || !managerPassword) throw new Error('Thiếu credential test manager.');
          await page.locator('#login-password, input[autocomplete="current-password"]').first().fill(managerPassword);
          await page.getByRole('button', { name: /đăng nhập/i }).click();
          await page.waitForTimeout(1000);
          if (/\/login/i.test(page.url())) throw new Error(`Đăng nhập không thành công: ${page.url()}`);
          if (!/\/manager|\/admin|\/lead/.test(page.url())) throw new Error(`Sai route sau đăng nhập: ${page.url()}`);
          return `URL=${page.url()}`;
        });
      }

      await runCase(add, `LOGIN-${device === 'desktop' ? '010' : '011'}`, `Login ${device} has no browser console errors`, async () => {
        if (consoleErrors.length) throw new Error(consoleErrors.slice(0, 5).join(' | '));
        return 'Console sạch';
      });

      await context.close();
    }
  } catch (error) {
    add('Login Playwright engine', 'FAIL', error?.message || String(error), 'LOGIN-000');
  } finally {
    if (browser) await browser.close();
  }
}
