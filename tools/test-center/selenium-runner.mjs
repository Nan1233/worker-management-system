import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const FE = process.env.KTC_FE_URL || 'http://127.0.0.1:5174';
const WORKER_CODE = process.env.KTC_WORKER_CODE || 'CN001';
const HEADLESS = process.env.KTC_HEADLESS === '1';
const OUT = path.join(ROOT, 'e2e-results');
const results = [];
let driver;

function log(id, status, message) {
  results.push({ id, status, message, at: new Date().toISOString() });
  console.log(`[KTC SELENIUM][${id}][${status}] ${message}`);
}

async function visible(selector, timeout = 12000) {
  const el = await driver.wait(until.elementLocated(By.css(selector)), timeout);
  await driver.wait(until.elementIsVisible(el), timeout);
  return el;
}

async function textContains(text, timeout = 15000) {
  return driver.wait(async () => {
    const body = await driver.findElement(By.css('body')).getText();
    return body.includes(text) ? body : false;
  }, timeout);
}

async function urlContains(fragment, timeout = 20000) {
  await driver.wait(async () => (await driver.getCurrentUrl()).includes(fragment), timeout);
}

// Chrome starts on a data: URL. Web Storage is unavailable on data: URLs,
// so always establish the real FE origin before touching localStorage/sessionStorage.
async function resetBrowser() {
  await driver.manage().deleteAllCookies();
  const current = await driver.getCurrentUrl().catch(() => '');
  if (!current || current.startsWith('data:') || current === 'about:blank') {
    await driver.get(`${FE}/#/login`);
  }
  await driver.executeScript(`
    try { window.localStorage.clear(); } catch (e) {}
    try { window.sessionStorage.clear(); } catch (e) {}
  `);
}

async function run(id, fn) {
  try {
    await fn();
    log(id, 'PASS', 'OK');
  } catch (error) {
    const message = error?.message || String(error);
    log(id, 'FAIL', message);
    try {
      await driver.takeScreenshot().then((b64) => fs.writeFile(path.join(OUT, `${id}-FAIL.png`), b64, 'base64'));
      const body = await driver.findElement(By.css('body')).getText().catch(() => '');
      await fs.writeFile(path.join(OUT, `${id}-FAIL.txt`), `${message}\n\nURL=${await driver.getCurrentUrl()}\n\n${body}`, 'utf8');
    } catch {}
  }
}

async function loginWorker() {
  await resetBrowser();
  await driver.get(`${FE}/#/login`);
  const code = await visible('[data-testid="login-username"]');
  await code.clear();
  await code.sendKeys(WORKER_CODE);

  await visible('.login-submit').then((el) => el.click());
  const workerChoice = await driver.wait(until.elementLocated(By.css('[data-testid="login-role-worker"]')), 12000);
  await driver.wait(until.elementIsVisible(workerChoice), 12000);
  await workerChoice.click();

  await driver.wait(async () => {
    const url = await driver.getCurrentUrl();
    if (url.includes('/#/worker')) return true;
    const alerts = await driver.findElements(By.css('[role="alert"], .login-error'));
    if (alerts.length) {
      const message = (await alerts[0].getText()).trim();
      if (message) throw new Error(`Worker login rejected: ${message}`);
    }
    return false;
  }, 30000);
}

async function openProcessSelection() {
  await driver.get(`${FE}/#/worker/process/select`);
  await urlContains('/#/worker/process/select');
  await textContains('Gia công', 20000);
}

async function clickProcessByText(label, route) {
  const candidates = await driver.findElements(By.xpath(
    `//*[self::button or self::a or @role='button' or contains(@class,'card')][contains(normalize-space(.),'${label}')]`
  ));
  if (!candidates.length) {
    const fallback = await driver.findElements(By.xpath(`//*[contains(normalize-space(.),'${label}')]`));
    if (!fallback.length) throw new Error(`Không tìm thấy control công đoạn: ${label}`);
    await fallback[0].click();
  } else {
    await candidates[0].click();
  }
  await urlContains(`/#/worker/process/${route}`, 20000);
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const options = new chrome.Options();
  if (HEADLESS) options.addArguments('--headless=new');
  options.addArguments('--window-size=1440,900', '--disable-gpu', '--no-sandbox');
  driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

  try {
    await run('E2E-LOGIN-001', async () => {
      await resetBrowser();
      await driver.get(`${FE}/#/login`);
      await visible('[data-testid="login-username"]');
      await textContains('mã nhân viên');
    });

    await run('E2E-LOGIN-002', async () => {
      await loginWorker();
    });

    await run('E2E-WORKER-001', async () => {
      await driver.get(`${FE}/#/worker`);
      await urlContains('/#/worker');
      await textContains('Công nhân', 20000);
    });

    await run('E2E-PROCESS-001', async () => {
      await openProcessSelection();
    });

    await run('E2E-GC-001', async () => {
      await openProcessSelection();
      await clickProcessByText('Gia công', 'cat-long');
    });

    await run('E2E-GC-002', async () => {
      await urlContains('/#/worker/process/cat-long');
      await textContains('Gia công', 20000);
      const controls = await driver.findElements(By.css('input, select, textarea, button'));
      if (!controls.length) throw new Error('Gia công chưa render controls');
    });

    for (const [id, route, label] of [
      ['E2E-PROC-MAI', 'mai', 'Mài'],
      ['E2E-PROC-DO', 'do', 'Đo'],
      ['E2E-PROC-KIEM1', 'kiem-1', 'Kiểm 1'],
      ['E2E-PROC-KIEM2', 'kiem-2', 'Kiểm 2'],
      ['E2E-PROC-CAN', 'can', 'Cán'],
      ['E2E-PROC-EP', 'ep', 'Ép'],
      ['E2E-PROC-BAVIA', 'bavia', 'Xử lý bavia'],
      ['E2E-PROC-SX3', 'sx3', 'Sản xuất 3'],
      ['E2E-PROC-NONPRODUCT', 'non-product', 'Công việc khác'],
    ]) {
      await run(id, async () => {
        await driver.get(`${FE}/#/worker/process/${route}`);
        await urlContains(`/#/worker/process/${route}`);
        await textContains(label, 20000);
      });
    }

    await run('E2E-GC-MOBILE', async () => {
      await driver.manage().window().setRect({ width: 390, height: 844 });
      await driver.get(`${FE}/#/worker/process/cat-long`);
      await urlContains('/#/worker/process/cat-long');
      await textContains('Gia công', 20000);
    });
  } finally {
    await fs.writeFile(path.join(OUT, 'e2e-result.json'), JSON.stringify(results, null, 2), 'utf8');
    const csv = ['id,status,message,at', ...results.map(r => [r.id, r.status, r.message, r.at].map(v => `"${String(v).replaceAll('"', '""')}"`).join(','))].join('\n');
    await fs.writeFile(path.join(OUT, 'e2e-result.csv'), csv, 'utf8');
    if (driver) await driver.quit();
  }

  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  console.log(`KTC E2E DONE | TOTAL=${results.length} PASS=${pass} FAIL=${fail}`);
  process.exitCode = fail ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
