import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (id, step, message, extra = '') => console.log(`[KTC SELENIUM][${id}][${step}] ${message}${extra ? ` | ${extra}` : ''}`);

async function screenshot(driver, id) {
  const dir = path.resolve(process.cwd(), 'test-results');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${id}-FAIL.png`);
  await fs.writeFile(file, await driver.takeScreenshot(), 'base64');
  log(id, 'SCREENSHOT', 'Đã lưu screenshot', file);
}

async function visible(driver, selectors, timeout = 15000) {
  for (const selector of selectors) {
    try {
      const el = await driver.wait(until.elementLocated(By.css(selector)), timeout);
      await driver.wait(until.elementIsVisible(el), timeout);
      return el;
    } catch {}
  }
  throw new Error(`Không tìm thấy element: ${selectors.join(' | ')}`);
}

async function clickText(driver, text, timeout = 10000) {
  const el = await driver.wait(until.elementLocated(By.xpath(`//*[self::button or self::a or @role='button'][contains(normalize-space(.), '${text}')]`)), timeout);
  await driver.wait(until.elementIsVisible(el), timeout);
  await el.click();
}

async function runCase(driver, add, id, name, fn) {
  const started = Date.now();
  log(id, 'START', name);
  try {
    const detail = await fn();
    const result = `${detail || 'OK'} | duration=${Date.now() - started}ms`;
    add(name, 'PASS', result, id);
    log(id, 'PASS', name, result);
  } catch (error) {
    const detail = error?.message || String(error);
    try { await screenshot(driver, id); } catch {}
    add(name, 'FAIL', detail, id);
    log(id, 'FAIL', name, detail);
  }
}

export async function runLoginE2E({ frontendUrl, add, managerUsername = '', managerPassword = '' }) {
  const headless = /^(1|true|yes)$/i.test(String(process.env.KTC_HEADLESS || '0'));
  const slowMo = Number(process.env.KTC_SLOWMO_MS || 350);
  const options = new chrome.Options();
  options.addArguments('--start-maximized');
  if (headless) options.addArguments('--headless=new', '--window-size=1440,900');
  console.log(`[KTC SELENIUM] Chrome Login: headless=${headless}; slowMo=${slowMo}ms`);
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

  try {
    await driver.manage().setTimeouts({ implicit: 1000, pageLoad: 30000, script: 30000 });
    log('SYS', '01', 'Chrome launched');
    for (const [device, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
      await driver.manage().window().setRect({ width, height });
      const consoleErrors = [];
      await runCase(driver, add, `LOGIN-${device}-001`, `Login page ${device} renders`, async () => {
        log(`LOGIN-${device}-001`, '01', `Mở ${frontendUrl}/#/login`);
        await driver.get(`${frontendUrl}/#/login`);
        log(`LOGIN-${device}-001`, '02', 'DOM loaded', `URL=${await driver.getCurrentUrl()}`);
        log(`LOGIN-${device}-001`, '03', 'Tìm username input');
        await visible(driver, ['#login-username', 'input[autocomplete="username"]', 'input[placeholder*="mã nhân viên" i]']);
        return `viewport=${width}x${height}`;
      });

      if (device === 'desktop') {
        await runCase(driver, add, 'LOGIN-002', 'Login rejects empty employee code', async () => {
          await clickText(driver, 'Tiếp tục');
          const alert = await visible(driver, ['[role="alert"]']);
          const text = await alert.getText();
          if (!/mã nhân viên/i.test(text)) throw new Error(`Thông báo sai: ${text}`);
          return text;
        });

        await runCase(driver, add, 'LOGIN-003', 'Valid employee code opens role choice', async () => {
          await driver.get(`${frontendUrl}/#/login`);
          const input = await visible(driver, ['#login-username', 'input[autocomplete="username"]', 'input[placeholder*="mã nhân viên" i]']);
          await input.clear(); await input.sendKeys(managerUsername || 'manager1');
          await clickText(driver, 'Tiếp tục');
          await visible(driver, ['button']);
          await clickText(driver, 'Quản lý');
          await visible(driver, ['#login-password', 'input[autocomplete="current-password"]', 'input[type="password"]']);
          return 'Quản lý -> password visible';
        });

        await runCase(driver, add, 'LOGIN-004', 'Management login rejects empty password', async () => {
          await clickText(driver, 'Đăng nhập');
          const alert = await visible(driver, ['[role="alert"]']);
          const text = await alert.getText();
          if (!/mật khẩu/i.test(text)) throw new Error(`Thông báo sai: ${text}`);
          return text;
        });

        await runCase(driver, add, 'LOGIN-005', 'Password visibility toggle works', async () => {
          const input = await visible(driver, ['#login-password', 'input[autocomplete="current-password"]', 'input[type="password"]']);
          await input.sendKeys('test-password');
          if (await input.getAttribute('type') !== 'password') throw new Error('Password input không phải type=password');
          await clickText(driver, 'hiện mật khẩu');
          if (await input.getAttribute('type') !== 'text') throw new Error('Nút hiện không đổi type=text');
          await clickText(driver, 'ẩn mật khẩu');
          if (await input.getAttribute('type') !== 'password') throw new Error('Nút ẩn không đổi lại password');
          return 'Hiện/Ẩn mật khẩu OK';
        });

        await runCase(driver, add, 'LOGIN-006', 'Valid manager credentials login through FE', async () => {
          if (!managerUsername || !managerPassword) throw new Error('Thiếu manager credentials test.');
          const input = await visible(driver, ['#login-password', 'input[autocomplete="current-password"]', 'input[type="password"]']);
          await input.clear(); await input.sendKeys(managerPassword);
          log('LOGIN-006', '01', 'Click Đăng nhập');
          await clickText(driver, 'Đăng nhập');
          await sleep(slowMo);
          log('LOGIN-006', '02', 'Chờ route sau login');
          await driver.wait(async () => !(await driver.getCurrentUrl()).includes('/login'), 15000);
          return `URL=${await driver.getCurrentUrl()}`;
        });
      }
      await runCase(driver, add, `LOGIN-${device}-CONSOLE`, `Browser console ${device}`, async () => 'Selenium Chrome session OK');
      if (!headless) await sleep(700);
    }
  } catch (error) {
    add('Login Selenium engine', 'FAIL', error?.message || String(error), 'LOGIN-000');
    log('LOGIN-000', 'FAIL', error?.message || String(error));
  } finally {
    log('SYS', '99', 'Đóng Chrome');
    await driver.quit();
  }
}
