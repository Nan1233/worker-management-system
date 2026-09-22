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

async function visible(selector, timeout = 8000) {
  const el = await driver.wait(until.elementLocated(By.css(selector)), timeout);
  await driver.wait(until.elementIsVisible(el), timeout);
  return el;
}

async function textContains(text, timeout = 8000) {
  return driver.wait(async () => {
    const body = await driver.findElement(By.css('body')).getText();
    return body.includes(text) ? body : false;
  }, timeout);
}

async function run(id, fn) {
  try {
    await fn();
    log(id, 'PASS', 'OK');
  } catch (error) {
    log(id, 'FAIL', error?.message || String(error));
    try {
      await driver.takeScreenshot().then((b64) => fs.writeFile(path.join(OUT, `${id}-FAIL.png`), b64, 'base64'));
    } catch {}
  }
}

async function loginWorker() {
  await driver.get(`${FE}/#/login`);
  const code = await visible('input');
  await code.clear();
  await code.sendKeys(WORKER_CODE);

  const continueButton = await driver.findElements(By.xpath("//*[self::button or self::a][contains(normalize-space(.),'Tiếp tục') or contains(normalize-space(.),'Tiếp')]") );
  if (continueButton.length) await continueButton[0].click();

  const workerChoice = await driver.wait(async () => {
    const els = await driver.findElements(By.xpath("//*[self::button or self::div or self::label][contains(normalize-space(.),'Công nhân')]") );
    return els.length ? els[0] : false;
  }, 8000);
  await workerChoice.click();

  const submit = await driver.findElements(By.xpath("//*[self::button or self::a][contains(normalize-space(.),'Đăng nhập') or contains(normalize-space(.),'Tiếp tục')]") );
  if (submit.length) await submit[submit.length - 1].click();

  await driver.wait(async () => (await driver.getCurrentUrl()).includes('/#/worker'), 12000);
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const options = new chrome.Options();
  if (HEADLESS) options.addArguments('--headless=new');
  options.addArguments('--window-size=1440,900', '--disable-gpu', '--no-sandbox');

  driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

  try {
    await run('E2E-LOGIN-001', async () => {
      await driver.get(`${FE}/#/login`);
      await visible('body');
      await textContains('mã nhân viên');
    });

    await run('E2E-LOGIN-002', async () => {
      await loginWorker();
      const url = await driver.getCurrentUrl();
      if (!url.includes('/#/worker')) throw new Error(`Worker login failed: ${url}`);
    });

    await run('E2E-WORKER-001', async () => {
      await driver.get(`${FE}/#/worker`);
      await textContains('Công nhân');
    });

    await run('E2E-PROCESS-001', async () => {
      await driver.get(`${FE}/#/worker/process/select`);
      await textContains('Gia công');
    });

    await run('E2E-GC-001', async () => {
      const cards = await driver.findElements(By.css('.worker-process-card'));
      if (!cards.length) throw new Error('Không tìm thấy .worker-process-card');
      const gc = cards.find(async () => false);
      const all = await driver.findElements(By.css('.worker-process-card'));
      let clicked = false;
      for (const card of all) {
        const t = await card.getText();
        if (t.includes('Gia công')) {
          await card.click();
          clicked = true;
          break;
        }
      }
      if (!clicked) throw new Error('Không tìm thấy card Gia công');
      await driver.wait(async () => (await driver.getCurrentUrl()).includes('/#/worker/process/cat-long'), 10000);
    });

    await run('E2E-GC-002', async () => {
      await textContains('Gia công', 10000);
      const inputs = await driver.findElements(By.css('input, select, textarea, button'));
      if (!inputs.length) throw new Error('Gia công chưa render controls');
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
        await textContains(label, 8000);
      });
    }

    await run('E2E-GC-MOBILE', async () => {
      await driver.manage().window().setRect({ width: 390, height: 844 });
      await driver.get(`${FE}/#/worker/process/cat-long`);
      await textContains('Gia công', 8000);
    });

    await driver.manage().window().setRect({ width: 1440, height: 900 });
  } finally {
    await fs.writeFile(path.join(OUT, 'e2e-result.json'), JSON.stringify(results, null, 2), 'utf8');
    const csv = ['id,status,message,at', ...results.map(r => [r.id, r.status, r.message, r.at].map(v => `"${String(v).replaceAll('"', '""')}"`).join(','))].join('\n');
    await fs.writeFile(path.join(OUT, 'e2e-result.csv'), csv, 'utf8');
    await driver.quit();
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
