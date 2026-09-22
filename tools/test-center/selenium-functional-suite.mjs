import { Builder, By } from 'selenium-webdriver';
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
  } catch { return {}; }
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

async function assertPageLoaded(driver, expectedPath) {
  await driver.wait(async () => (await driver.getCurrentUrl()).includes(expectedPath), 10000);
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

async function waitForProcessCards(driver) {
  await driver.wait(async () => {
    const cards = await driver.findElements(By.css('button.worker-process-card'));
    if (cards.length > 0) return true;
    const text = await bodyText(driver);
    return /Chưa được phân công công đoạn|Không thể mở trang|Thông tin tài khoản không hợp lệ/i.test(text);
  }, 15000);
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
  options.addArguments('--start-maximized', '--disable-web-security', '--allow-running-insecure-content');
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
        const text = await assertPageLoaded(driver, route);
        return `URL=${await driver.getCurrentUrl()} | text=${text.slice(0, 90).replace(/\s+/g, ' ')}`;
      });
    }

    await runCase(driver, add, 'SEL-MANAGER-009', 'Manager report detail route renders', async () => {
      if (!reportId) throw new Error('Không có reportId từ authenticated fixture.');
      await driver.get(`${frontendUrl}/#/manager/report/${reportId}`);
      const text = await assertPageLoaded(driver, `/manager/report/${reportId}`);
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
        const text = await assertPageLoaded(driver, route);
        return `URL=${await driver.getCurrentUrl()} | text=${text.slice(0, 90).replace(/\s+/g, ' ')}`;
      });
    }

    // 1) Always test Gia công first. This is the primary production flow.
    await runCase(driver, add, 'SEL-GC-001', 'Gia công process selection opens', async () => {
      await driver.get(`${frontendUrl}/#/worker/process/select`);
      await assertPageLoaded(driver, '/worker/process/select');
      await waitForProcessCards(driver);
      const cards = await driver.findElements(By.css('button.worker-process-card'));
      if (!cards.length) throw new Error('Không có công đoạn được phân công cho worker fixture.');

      let gcCard = null;
      for (const card of cards) {
        const text = (await card.getText()).trim();
        if (/Gia công|GC|Cắt \/ Lồng/i.test(text)) {
          gcCard = card;
          break;
        }
      }
      if (!gcCard) throw new Error('Không tìm thấy card Gia công (GC).');
      await driver.executeScript('arguments[0].scrollIntoView({block:"center"});', gcCard);
      await sleep(150);
      await driver.executeScript('arguments[0].click();', gcCard);
      await driver.wait(async () => /\/worker\/process\/cat-long/.test(await driver.getCurrentUrl()), 10000);
      const text = await assertPageLoaded(driver, '/worker/process/cat-long');
      return `Gia công mở ProcessPage | URL=${await driver.getCurrentUrl()} | ${text.slice(0, 120).replace(/\s+/g, ' ')}`;
    });

    // 2) Gia công-specific UI must expose the core fields before any submit.
    await runCase(driver, add, 'SEL-GC-002', 'Gia công form loads core production fields', async () => {
      await driver.get(`${frontendUrl}/#/worker/process/cat-long`);
      const text = await assertPageLoaded(driver, '/worker/process/cat-long');
      await driver.wait(async () => {
        const current = await bodyText(driver);
        return /Gia công|Cắt\/Lồng/i.test(current) && /Mã sản phẩm|Số máy|Máy gia công/i.test(current);
      }, 15000);
      const current = await bodyText(driver);
      if (!/Thời gian làm việc/i.test(current)) throw new Error('Gia công chưa hiển thị trường Thời gian làm việc.');
      if (!/Số lượng OK/i.test(current)) throw new Error('Gia công chưa hiển thị trường Số lượng OK.');
      return 'Gia công: máy + sản phẩm + thời gian + OK đã render';
    });

    // 3) Exercise other process types after the primary Gia công flow.
    const processCases = [
      ['mai', 'SEL-PROC-002', 'Mài process form renders'],
      ['do', 'SEL-PROC-003', 'Đo process form renders'],
      ['kiem-1', 'SEL-PROC-004', 'Kiểm 1 process form renders'],
      ['kiem-2', 'SEL-PROC-005', 'Kiểm 2 process form renders'],
      ['can', 'SEL-PROC-006', 'Cán process form renders'],
      ['ep', 'SEL-PROC-007', 'Ép process form renders'],
      ['bavia', 'SEL-PROC-008', 'Xử lý bavia process form renders'],
      ['sx3', 'SEL-PROC-009', 'Sản xuất 3 process form renders'],
      ['non-product', 'SEL-PROC-010', 'Công việc khác form renders'],
    ];
    for (const [slug, id, name] of processCases) {
      await runCase(driver, add, id, name, async () => {
        const expected = slug === 'non-product' ? '/worker/process/non-product' : `/worker/process/${slug}`;
        await driver.get(`${frontendUrl}/#${expected}`);
        const text = await assertPageLoaded(driver, expected);
        await driver.wait(async () => {
          const current = await bodyText(driver);
          return current.length > 100 || /Đang tải|Không thể mở|Không có/i.test(current);
        }, 10000);
        const current = await bodyText(driver);
        if (/Unexpected Application Error|Application error|Cannot read properties/i.test(current)) {
          throw new Error(`UI runtime error: ${current.slice(0, 400)}`);
        }
        return `URL=${await driver.getCurrentUrl()} | ${current.slice(0, 110).replace(/\s+/g, ' ')}`;
      });
    }

    // 4) Mobile rendering of the real Gia công page.
    await runCase(driver, add, 'SEL-GC-MOBILE-001', 'Gia công mobile form renders', async () => {
      await driver.manage().window().setRect({ width: 390, height: 844 });
      await driver.get(`${frontendUrl}/#/worker/process/cat-long`);
      const text = await assertPageLoaded(driver, '/worker/process/cat-long');
      if (!/Gia công|Cắt\/Lồng/i.test(text)) throw new Error('Không thấy tiêu đề Gia công trên mobile.');
      return `viewport=390x844 | URL=${await driver.getCurrentUrl()}`;
    });
  } finally {
    log('SEL-FUNC-SYS', '99', 'Đóng Chrome functional');
    await driver.quit();
  }
}
