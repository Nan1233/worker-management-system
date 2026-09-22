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
      const el = await driver.wait(until.elementLocated(By.css(selector)), Math.min(timeout, 4000));
      await driver.wait(until.elementIsVisible(el), Math.min(timeout, 4000));
      return el;
    } catch {}
  }
  throw new Error(`Không tìm thấy element: ${selectors.join(' | ')}`);
}

async function clickText(driver, text, timeout = 10000) {
  const xpath = `//*[self::button or self::a or @role='button'][contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'${text.toLowerCase()}')]`;
  const el = await driver.wait(until.elementLocated(By.xpath(xpath)), timeout);
  await driver.wait(until.elementIsVisible(el), timeout);
  await driver.executeScript('arguments[0].scrollIntoView({block:"center"});', el);
  await driver.executeScript('arguments[0].click();', el);
}

async function clickSubmit(driver, timeout = 10000) {
  const selectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button[aria-label*="Đăng nhập" i]',
    'button[title*="Đăng nhập" i]'
  ];
  const el = await visible(driver, selectors, timeout);
  await driver.executeScript('arguments[0].scrollIntoView({block:"center"});', el);
  await driver.executeScript('arguments[0].click();', el);
}

async function pageDiagnostics(driver) {
  return await driver.executeScript(() => ({
    body: document.body?.innerText || '',
    title: document.title,
    url: location.href,
    buttons: [...document.querySelectorAll('button,[role="button"]')].map((e) => ({
      text: (e.innerText || '').trim(),
      aria: e.getAttribute('aria-label'),
      title: e.getAttribute('title'),
      type: e.getAttribute('type')
    })),
    inputs: [...document.querySelectorAll('input')].map((e) => ({
      id: e.id, name: e.name, placeholder: e.placeholder, type: e.type
    }))
  }));
}

async function logDiagnostics(driver, id) {
  try { log(id, 'DIAGNOSTIC', JSON.stringify(await pageDiagnostics(driver))); } catch (e) { log(id, 'DIAGNOSTIC', `Không lấy được DOM: ${e.message}`); }
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
    await logDiagnostics(driver, id);
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
          log('LOGIN-003', '01', 'Click Tiếp tục');
          await clickText(driver, 'Tiếp tục');
          await visible(driver, ['button']);
          await clickText(driver, 'Quản lý');
          await visible(driver, ['#login-password', 'input[autocomplete="current-password"]', 'input[type="password"]']);
          return 'Quản lý -> password visible';
        });

        await runCase(driver, add, 'LOGIN-004', 'Management login rejects empty password', async () => {
          log('LOGIN-004', '01', 'Click submit với password rỗng');
          await clickSubmit(driver);
          const alert = await visible(driver, ['[role="alert"]']);
          const text = await alert.getText();
          if (!/mật khẩu/i.test(text)) throw new Error(`Thông báo sai: ${text}`);
          return text;
        });

        await runCase(driver, add, 'LOGIN-005', 'Password visibility toggle works', async () => {
          const input = await visible(driver, ['#login-password', 'input[autocomplete="current-password"]', 'input[type="password"]']);
          await input.clear(); await input.sendKeys('test-password');
          const toggle = await visible(driver, [
            'button[aria-label*="hiện mật khẩu" i]',
            'button[aria-label*="ẩn mật khẩu" i]',
            'button[title*="hiện mật khẩu" i]',
            'button[title*="ẩn mật khẩu" i]'
          ]);
          log('LOGIN-005', '01', 'Tìm thấy password toggle', `aria=${await toggle.getAttribute('aria-label') || ''}; title=${await toggle.getAttribute('title') || ''}; text=${await toggle.getText()}`);
          await toggle.click();
          await driver.wait(async () => (await input.getAttribute('type')) === 'text', 3000);
          log('LOGIN-005', '02', 'Password chuyển sang text');
          const toggleAgain = await visible(driver, [
            'button[aria-label*="ẩn mật khẩu" i]',
            'button[aria-label*="hiện mật khẩu" i]',
            'button[title*="ẩn mật khẩu" i]',
            'button[title*="hiện mật khẩu" i]'
          ]);
          await toggleAgain.click();
          await driver.wait(async () => (await input.getAttribute('type')) === 'password', 3000);
          return 'Hiện/Ẩn mật khẩu OK';
        });

        await runCase(driver, add, 'LOGIN-006', 'Valid manager credentials login through FE', async () => {
          if (!managerUsername || !managerPassword) throw new Error('Thiếu manager credentials test.');
          const input = await visible(driver, ['#login-password', 'input[autocomplete="current-password"]', 'input[type="password"]']);
          await input.clear(); await input.sendKeys(managerPassword);
          log('LOGIN-006', '01', 'Click Đăng nhập');
          await clickSubmit(driver);
          await sleep(slowMo);
          log('LOGIN-006', '02', 'Chờ kết quả login');
          const start = Date.now();
          await driver.wait(async () => {
            const url = await driver.getCurrentUrl();
            const body = (await driver.findElement(By.css('body')).getText()).trim();
            return !url.includes('/login') || /sai mật khẩu|không đúng|đăng nhập thất bại|lỗi đăng nhập|401|403/i.test(body);
          }, 15000);
          const url = await driver.getCurrentUrl();
          const body = (await driver.findElement(By.css('body')).getText()).trim();
          log('LOGIN-006', '03', 'Kết quả login', `URL=${url}; body=${body.slice(0, 500)}`);
          if (url.includes('/login')) throw new Error(`Login không thành công hoặc FE không chuyển route | body=${body.slice(0, 500)}`);
          return `URL=${url} | elapsed=${Date.now() - start}ms`;
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