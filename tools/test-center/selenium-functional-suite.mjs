import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const log = (id, step, msg, extra = '') => console.log(`[KTC SELENIUM][${id}][${step}] ${msg}${extra ? ` | ${extra}` : ''}`);

function decodeJwt(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return {};
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

async function screenshot(driver, id) {
  const dir = path.resolve(process.cwd(), 'test-results');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${id}-FAIL.png`);
  await fs.writeFile(file, await driver.takeScreenshot(), 'base64');
  log(id, 'SCREENSHOT', 'Đã lưu screenshot', file);
}

async function bodyText(driver) {
  return (await driver.findElement(By.css('body')).getText()).trim();
}

async function assertPageLoaded(driver, expectedPath, id) {
  await driver.wait(async () => {
    const url = await driver.getCurrentUrl();
    return url.includes(expectedPath);
  }, 10000);
  await driver.wait(async () => (await bodyText(driver)).length > 0, 10000);
  const text = await bodyText(driver);
  if (/Unexpected Application Error|Cannot read properties of undefined|Cannot read properties of null|Application error/i.test(text)) {
    throw new Error(`UI runtime error: ${text.slice(0, 500)}`);
  }
  if (text.includes('Mã nhân viên') && text.includes('Đăng nhập hệ thống KTC')) {
    throw new Error('Bị redirect về login - auth session không được nhận.');
  }
  return text;
}

async function injectSession(driver, frontendUrl, token) {
  const payload = decodeJwt(token);
  const user = {
    id: Number(payload.id || 0),
    worker_id: payload.worker_id == null ? null : Number(payload.worker_id),
    worker_code: payload.worker_code || null,
    username: payload.username || `user-${payload.id || 0}`,
    full_name: payload.username || 'KTC Test User',
    role: payload.role || 'worker',
  };
  await driver.get(`${frontendUrl}/#/login`);
  await driver.executeScript((accessToken, authUser) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('token', accessToken);
    localStorage.setItem('user', JSON.stringify(authUser));
    localStorage.setItem('ktcAuthEpoch', '0');
    localStorage.setItem('ktcAuthSessionId', `selenium-${Date.now()}`);
    localStorage.setItem('ktcRefreshSessionHint', '1');
  }, token, user);
}

async function clickFirstMatching(driver, selectors) {
  for (const selector of selectors) {
    try {
      const elements = await driver.findElements(By.css(selector));
      for (const el of elements) {
        if (await el.isDisplayed()) {
          await driver.executeScript('arguments[0].scrollIntoView({block:"center"}); arguments[0].click();', el);
          return true;
        }
      }
    } catch {}
  }
  return false;
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

export async function runSeleniumFunctionalSuite({ frontendUrl, managerToken, workerToken, reportId = 0, add }) {
  if (!managerToken || !workerToken) {
    add('Selenium functional suite', 'FAIL', 'Thiếu managerToken/workerToken.', 'SEL-FUNC-000');
    return;
  }

  const headless = /^(1|true|yes)$/i.test(String(process.env.KTC_HEADLESS || '0'));
  const slowMo = Number(process.env.KTC_SLOWMO_MS || 150);
  const options = new chrome.Options();
  options.addArguments('--start-maximized');
  if (headless) options.addArguments('--headless=new', '--window-size=1440,900');
  log('SEL-FUNC-SYS', '01', 'Chrome functional launched', `headless=${headless}; slowMo=${slowMo}ms`);

  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  await driver.manage().setTimeouts({ implicit: 500, pageLoad: 30000, script: 30000 });

  try {
    await driver.manage().window().setRect({ width: 1440, height: 900 });

    await injectSession(driver, frontendUrl, managerToken);
    const managerRoutes = [
      ['/manager', 'SEL-MANAGER-001', 'Manager dashboard renders'],
      ['/manager/reports', 'SEL-MANAGER-002', 'Manager pending reports renders'],
      ['/manager/approved', 'SEL-MANAGER-003', 'Manager approved reports renders'],
      ['/manager/report-management', 'SEL-MANAGER-004', 'Manager report management renders'],
      ['/manager/workers', 'SEL-MANAGER-005', 'Manager workers renders'],
      ['/manager/system', 'SEL-MANAGER-006', 'Manager system center renders'],
      ['/manager/notifications', 'SEL-MANAGER-007', 'Manager notifications renders'],
      ['/manager/profile', 'SEL-MANAGER-008', 'Manager profile renders'],
    ];
    for (const [route, id, name] of managerRoutes) {
      await runCase(driver, add, id, name, async () => {
        await driver.get(`${frontendUrl}/#${route}`);
        const text = await assertPageLoaded(driver, route, id);
        return `URL=${await driver.getCurrentUrl()} | text=${text.slice(0, 90).replace(/\s+/g, ' ')}`;
      });
    }

    await runCase(driver, add, 'SEL-MANAGER-009', 'Manager report detail route renders', async () => {
      if (!reportId) throw new Error('Không có reportId từ authenticated fixture.');
      await driver.get(`${frontendUrl}/#/manager/report/${reportId}`);
      const text = await assertPageLoaded(driver, `/manager/report/${reportId}`, 'SEL-MANAGER-009');
      return `reportId=${reportId} | ${text.slice(0, 90).replace(/\s+/g, ' ')}`;
    });

    await injectSession(driver, frontendUrl, workerToken);
    const workerRoutes = [
      ['/worker', 'SEL-WORKER-001', 'Worker home renders'],
      ['/worker/process/select', 'SEL-WORKER-002', 'Worker process selection renders'],
      ['/worker/history', 'SEL-WORKER-003', 'Worker production history renders'],
      ['/worker/statistics', 'SEL-WORKER-004', 'Worker statistics renders'],
      ['/worker/notifications', 'SEL-WORKER-005', 'Worker notifications renders'],
      ['/worker/profile', 'SEL-WORKER-006', 'Worker profile renders'],
    ];
    for (const [route, id, name] of workerRoutes) {
      await runCase(driver, add, id, name, async () => {
        await driver.get(`${frontendUrl}/#${route}`);
        const text = await assertPageLoaded(driver, route, id);
        return `URL=${await driver.getCurrentUrl()} | text=${text.slice(0, 90).replace(/\s+/g, ' ')}`;
      });
    }

    await runCase(driver, add, 'SEL-WORKER-007', 'Worker process page opens from process selection', async () => {
      await driver.get(`${frontendUrl}/#/worker/process/select`);
      await assertPageLoaded(driver, '/worker/process/select', 'SEL-WORKER-007');
      const clicked = await clickFirstMatching(driver, [
        '[data-testid*="process"]',
        'button[class*="process"]',
        'a[href*="/worker/process/"]',
        'button'
      ]);
      if (!clicked) throw new Error('Không tìm thấy control chọn công đoạn trên giao diện công nhân.');
      await sleep(slowMo);
      const url = await driver.getCurrentUrl();
      if (!/\/worker\/process\/[^/]+/.test(url)) throw new Error(`Chọn công đoạn không mở ProcessPage | URL=${url}`);
      return `ProcessPage opened | URL=${url}`;
    });
  } finally {
    log('SEL-FUNC-SYS', '99', 'Đóng Chrome functional');
    await driver.quit();
  }
}
