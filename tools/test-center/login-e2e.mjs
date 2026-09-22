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
  const el = await driver.wait(
    until.elementLocated(By.xpath(`//*[self::button or self::a or @role='button'][contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'${text.toLowerCase()}')]`)),
    timeout,
  );
  await driver.wait(until.elementIsVisible(el), timeout);
  await el.click();
}

async function installNetworkProbe(driver) {
  await driver.executeScript(() => {
    if (window.__ktcNetworkProbeInstalled) return;
    window.__ktcNetworkProbeInstalled = true;
    window.__ktcNetworkEvents = [];
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const input = args[0];
      const init = args[1] || {};
      const url = typeof input === 'string' ? input : input?.url;
      const method = (init.method || input?.method || 'GET').toUpperCase();
      const started = Date.now();
      try {
        const response = await originalFetch(...args);
        let body = '';
        try { body = await response.clone().text(); } catch {}
        window.__ktcNetworkEvents.push({ type: 'fetch', method, url, status: response.status, body: body.slice(0, 1000), duration: Date.now() - started });
        return response;
      } catch (error) {
        window.__ktcNetworkEvents.push({ type: 'fetch', method, url, status: 0, error: String(error), duration: Date.now() - started });
        throw error;
      }
    };
  });
}

async function dumpDiagnostics(driver, id) {
  try {
    const data = await driver.executeScript(() => ({
      url: location.href,
      title: document.title,
      body: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1500),
      network: window.__ktcNetworkEvents || [],
      inputs: [...document.querySelectorAll('input')].map((x) => ({ id: x.id, name: x.name, type: x.type, placeholder: x.placeholder })),
      buttons: [...document.querySelectorAll('button,[role="button"]')].map((x) => ({ text: (x.innerText || '').trim(), aria: x.getAttribute('aria-label'), title: x.getAttribute('title'), type: x.type })).slice(0, 30),
    }));
    console.log(`[KTC SELENIUM][${id}][DIAGNOSTIC] ${JSON.stringify(data)}`);
  } catch (error) {
    log(id, 'DIAGNOSTIC', `Không lấy được diagnostics: ${error.message}`);
  }
}

async function findPasswordToggle(driver, input) {
  const candidates = await input.findElements(By.xpath("ancestor::*[self::div or self::label][1]//button | ancestor::*[self::div or self::label][2]//button"));
  for (const el of candidates) {
    if (await el.isDisplayed().catch(() => false)) return el;
  }
  const broad = await driver.findElements(By.xpath("//button[contains(@aria-label,'mật khẩu') or contains(@title,'mật khẩu') or contains(@aria-label,'password') or contains(@title,'password')]"));
  for (const el of broad) {
    if (await el.isDisplayed().catch(() => false)) return el;
  }
  throw new Error('Không tìm thấy nút toggle mật khẩu quanh password input.');
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
    await dumpDiagnostics(driver, id);
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
      await installNetworkProbe(driver);
      if (device === 'mobile') await driver.executeScript(() => window.__ktcNetworkEvents = []);
      await runCase(driver, add, `LOGIN-${device}-001`, `Login page ${device} renders`, async () => {
        log(`LOGIN-${device}-001`, '01', `Mở ${frontendUrl}/#/login`);
        await driver.get(`${frontendUrl}/#/login`);
        await installNetworkProbe(driver);
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
          await installNetworkProbe(driver);
          const input = await visible(driver, ['#login-username', 'input[autocomplete="username"]', 'input[placeholder*="mã nhân viên" i]']);
          await input.clear();
          await input.sendKeys(managerUsername || 'manager1');
          log('LOGIN-003', '01', 'Click Tiếp tục');
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
          await input.clear();
          await input.sendKeys('test-password');
          if (await input.getAttribute('type') !== 'password') throw new Error('Password input không phải type=password');
          const toggle = await findPasswordToggle(driver, input);
          log('LOGIN-005', '01', 'Tìm thấy password toggle', `aria=${await toggle.getAttribute('aria-label')}; title=${await toggle.getAttribute('title')}; text=${await toggle.getText()}`);
          await toggle.click();
          await driver.wait(async () => (await input.getAttribute('type')) === 'text', 5000);
          log('LOGIN-005', '02', 'Password chuyển sang text');
          await findPasswordToggle(driver, input).then((el) => el.click());
          await driver.wait(async () => (await input.getAttribute('type')) === 'password', 5000);
          return 'Hiện/Ẩn mật khẩu OK';
        });

        await runCase(driver, add, 'LOGIN-006', 'Valid manager credentials login through FE', async () => {
          if (!managerUsername || !managerPassword) throw new Error('Thiếu manager credentials test.');
          await driver.executeScript(() => window.__ktcNetworkEvents = []);
          const user = await visible(driver, ['#login-username', 'input[autocomplete="username"]']);
          const currentUrl = await driver.getCurrentUrl();
          if (currentUrl.includes('/login') && !(await driver.findElements(By.css('#login-password'))).length) {
            await user.clear(); await user.sendKeys(managerUsername);
            await clickText(driver, 'Tiếp tục');
            await clickText(driver, 'Quản lý');
          }
          const input = await visible(driver, ['#login-password', 'input[autocomplete="current-password"]', 'input[type="password"]']);
          await input.clear();
          await input.sendKeys(managerPassword);
          log('LOGIN-006', '01', 'Click Đăng nhập', `username=${managerUsername}`);
          await clickText(driver, 'Đăng nhập');
          log('LOGIN-006', '02', 'Đã click; chờ API/login UI');
          await sleep(Math.max(slowMo, 500));
          const deadline = Date.now() + 15000;
          let events = [];
          while (Date.now() < deadline) {
            events = await driver.executeScript(() => window.__ktcNetworkEvents || []);
            if (events.some((e) => /\/api\/auth\/login/i.test(e.url || ''))) break;
            await sleep(100);
          }
          const loginEvents = events.filter((e) => /\/api\/auth\/login/i.test(e.url || ''));
          if (!loginEvents.length) {
            await dumpDiagnostics(driver, 'LOGIN-006-NO-API');
            throw new Error('Không quan sát được POST /api/auth/login sau khi click Đăng nhập. Có thể FE không gửi request hoặc test đang không bắt được network.');
          }
          for (const e of loginEvents) log('LOGIN-006', '03', `Auth API ${e.method} ${e.status}`, `duration=${e.duration}ms; body=${e.body || ''}`);
          const failed = loginEvents.find((e) => Number(e.status) >= 400 || Number(e.status) === 0);
          if (failed) throw new Error(`Auth API FAIL: HTTP ${failed.status}; response=${failed.body || failed.error || '(empty)'}`);
          log('LOGIN-006', '04', 'Auth API PASS', `HTTP ${loginEvents.at(-1).status}`);
          await driver.wait(async () => !(await driver.getCurrentUrl()).includes('/login'), 15000).catch(async () => {
            const body = await driver.findElement(By.css('body')).getText().catch(() => '');
            throw new Error(`Auth API thành công nhưng FE chưa điều hướng. URL=${await driver.getCurrentUrl()}; body=${body.slice(0, 500)}`);
          });
          return `URL=${await driver.getCurrentUrl()}; authHTTP=${loginEvents.at(-1).status}`;
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
