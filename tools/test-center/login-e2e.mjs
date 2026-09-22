import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import fs from 'node:fs/promises';
import path from 'node:path';

// TEST ONLY: credentials are intentionally fixed in the test source so the
// Selenium suite can run with a single `npm.cmd start` command. Never use these
// credentials against production.
const TEST_MANAGER_USERNAME = 'manager1';
const TEST_MANAGER_PASSWORD = '123456';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (id, step, msg, extra = '') => console.log(`[KTC SELENIUM][${id}][${step}] ${msg}${extra ? ` | ${extra}` : ''}`);

async function screenshot(driver, id) {
  const dir = path.resolve(process.cwd(), 'test-results');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${id}-FAIL.png`);
  await fs.writeFile(file, await driver.takeScreenshot(), 'base64');
  log(id, 'SCREENSHOT', 'Đã lưu screenshot', file);
}

async function visible(driver, selectors, timeout = 10000) {
  for (const selector of selectors) {
    try {
      const el = await driver.wait(until.elementLocated(By.css(selector)), Math.min(timeout, 3000));
      await driver.wait(until.elementIsVisible(el), Math.min(timeout, 3000));
      return el;
    } catch {}
  }
  throw new Error(`Không tìm thấy element: ${selectors.join(' | ')}`);
}

async function xpathVisible(driver, xpath, timeout = 10000) {
  const el = await driver.wait(until.elementLocated(By.xpath(xpath)), timeout);
  await driver.wait(until.elementIsVisible(el), timeout);
  return el;
}

async function clickText(driver, text, timeout = 10000) {
  const xpath = `//*[self::button or self::a or @role='button'][contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'${text.toLowerCase()}')]`;
  const el = await xpathVisible(driver, xpath, timeout);
  await driver.executeScript('arguments[0].scrollIntoView({block:"center"}); arguments[0].click();', el);
}

async function clickSubmit(driver, timeout = 10000) {
  const el = await visible(driver, ['button[type="submit"]','input[type="submit"]'], timeout);
  await driver.executeScript('arguments[0].scrollIntoView({block:"center"}); arguments[0].click();', el);
}

async function resetBrowserState(driver, frontendUrl, id) {
  log(id, 'RESET', 'Xóa cookie/localStorage/sessionStorage để testcase độc lập');
  await driver.get(`${frontendUrl}/`);
  await driver.manage().deleteAllCookies();
  await driver.executeScript(`
    try { localStorage.clear(); } catch (e) {}
    try { sessionStorage.clear(); } catch (e) {}
  `);
  await driver.get(`${frontendUrl}/#/login`);
}

async function loginPage(driver, frontendUrl, id) {
  await resetBrowserState(driver, frontendUrl, id);
  log(id, '01', 'Mở login', `URL=${await driver.getCurrentUrl()}`);
  await visible(driver, ['#login-username','input[data-testid="login-username"]','input[autocomplete="username"]','input[placeholder*="mã nhân viên" i]']);
  log(id, '02', 'Login DOM sẵn sàng');
}

async function pageDiagnostics(driver) {
  return driver.executeScript(() => ({
    body: document.body?.innerText || '', title: document.title, url: location.href,
    buttons: [...document.querySelectorAll('button,[role="button"]')].map(e => ({text:(e.innerText||'').trim(),aria:e.getAttribute('aria-label'),title:e.getAttribute('title'),type:e.getAttribute('type')})),
    inputs: [...document.querySelectorAll('input')].map(e => ({id:e.id,placeholder:e.placeholder,type:e.type}))
  }));
}

async function diagnostics(driver, id) {
  try { log(id, 'DIAGNOSTIC', JSON.stringify(await pageDiagnostics(driver))); } catch (e) { log(id, 'DIAGNOSTIC', e.message); }
}

async function runCase(driver, add, id, name, fn) {
  const started = Date.now();
  log(id, 'START', name);
  try {
    const detail = await fn();
    const result = `${detail || 'OK'} | duration=${Date.now()-started}ms`;
    add(name, 'PASS', result, id); log(id, 'PASS', name, result);
  } catch (e) {
    const detail = e?.message || String(e);
    await diagnostics(driver, id); try { await screenshot(driver,id); } catch {}
    add(name, 'FAIL', detail, id); log(id, 'FAIL', name, detail);
  }
}

export async function runLoginE2E({ frontendUrl, add, managerUsername = TEST_MANAGER_USERNAME, managerPassword = TEST_MANAGER_PASSWORD }) {
  const username = String(managerUsername || TEST_MANAGER_USERNAME).trim();
  const password = String(managerPassword || TEST_MANAGER_PASSWORD);
  const headless = /^(1|true|yes)$/i.test(String(process.env.KTC_HEADLESS || '0'));
  const slowMo = Number(process.env.KTC_SLOWMO_MS || 350);
  const options = new chrome.Options();
  options.addArguments('--start-maximized');
  // TEST ONLY: the deployed test backend currently has a stricter CORS allow-list
  // than the local Test Center origin (127.0.0.1:5174). Disable browser CORS
  // enforcement only for this isolated Selenium test browser; never for users.
  options.addArguments('--disable-web-security', '--allow-running-insecure-content');
  if (headless) options.addArguments('--headless=new','--window-size=1440,900');
  console.log(`[KTC SELENIUM] Chrome Login: headless=${headless}; slowMo=${slowMo}ms`);
  console.log(`[KTC SELENIUM] TEST FIXTURE: ${username} / ${password}`);
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  await driver.manage().setTimeouts({implicit:1000,pageLoad:30000,script:30000});

  try {
    log('SYS','01','Chrome launched');
    for (const [device,width,height] of [['desktop',1440,900],['mobile',390,844]]) {
      await driver.manage().window().setRect({width,height});

      await runCase(driver,add,`LOGIN-${device}-001`,`Login page ${device} renders`,async()=>{
        await loginPage(driver,frontendUrl,`LOGIN-${device}-001`);
        return `viewport=${width}x${height}`;
      });

      if (device === 'desktop') {
        await runCase(driver,add,'LOGIN-002','Login rejects empty employee code',async()=>{
          await loginPage(driver,frontendUrl,'LOGIN-002');
          await clickText(driver,'Tiếp tục');
          const alert=await visible(driver,['[role="alert"]']); const text=await alert.getText();
          if(!/mã nhân viên/i.test(text)) throw new Error(`Thông báo sai: ${text}`); return text;
        });

        await runCase(driver,add,'LOGIN-003','Valid employee code opens role choice',async()=>{
          await loginPage(driver,frontendUrl,'LOGIN-003');
          const input=await visible(driver,['#login-username','input[data-testid="login-username"]','input[autocomplete="username"]','input[placeholder*="mã nhân viên" i]']);
          await input.clear(); await input.sendKeys(username);
          log('LOGIN-003','01','Click Tiếp tục'); await clickText(driver,'Tiếp tục');
          await clickText(driver,'Quản lý');
          await visible(driver,['#login-password','input[data-testid="login-password"]','input[autocomplete="current-password"]','input[type="password"]']);
          return 'Quản lý -> password visible';
        });

        await runCase(driver,add,'LOGIN-004','Management login rejects empty password',async()=>{
          await loginPage(driver,frontendUrl,'LOGIN-004');
          const input=await visible(driver,['#login-username','input[data-testid="login-username"]','input[autocomplete="username"]','input[placeholder*="mã nhân viên" i]']);
          await input.clear(); await input.sendKeys(username);
          await clickText(driver,'Tiếp tục'); await clickText(driver,'Quản lý');
          await visible(driver,['#login-password','input[data-testid="login-password"]','input[autocomplete="current-password"]','input[type="password"]']);
          log('LOGIN-004','01','Click submit với password rỗng'); await clickSubmit(driver);
          const alert=await visible(driver,['[role="alert"]']); const text=await alert.getText();
          if(!/mật khẩu/i.test(text)) throw new Error(`Thông báo sai: ${text}`); return text;
        });

        await runCase(driver,add,'LOGIN-005','Password visibility toggle works',async()=>{
          await loginPage(driver,frontendUrl,'LOGIN-005');
          const input=await visible(driver,['#login-username','input[data-testid="login-username"]','input[autocomplete="username"]','input[placeholder*="mã nhân viên" i]']);
          await input.clear(); await input.sendKeys(username);
          await clickText(driver,'Tiếp tục'); await clickText(driver,'Quản lý');
          const pass=await visible(driver,['#login-password','input[data-testid="login-password"]','input[autocomplete="current-password"]','input[type="password"]']);
          await pass.sendKeys('test-password');
          const show=await xpathVisible(driver,"//button[contains(translate(@aria-label,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'hiện mật khẩu') or contains(translate(@title,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'hiện mật khẩu') or contains(normalize-space(.),'Hiện')]");
          log('LOGIN-005','01','Tìm thấy password toggle',`aria=${await show.getAttribute('aria-label')||''}; text=${await show.getText()}`);
          await show.click(); await driver.wait(async()=>await pass.getAttribute('type')==='text',3000);
          log('LOGIN-005','02','Password chuyển sang text');
          const hide=await xpathVisible(driver,"//button[contains(translate(@aria-label,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'ẩn mật khẩu') or contains(translate(@title,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'ẩn mật khẩu') or contains(normalize-space(.),'Ẩn')]");
          await hide.click(); await driver.wait(async()=>await pass.getAttribute('type')==='password',3000);
          return 'Hiện/Ẩn mật khẩu OK';
        });

        await runCase(driver,add,'LOGIN-006','Valid manager credentials login through FE',async()=>{
          await loginPage(driver,frontendUrl,'LOGIN-006');
          const user=await visible(driver,['#login-username','input[data-testid="login-username"]','input[autocomplete="username"]','input[placeholder*="mã nhân viên" i]']);
          await user.clear(); await user.sendKeys(username); await clickText(driver,'Tiếp tục'); await clickText(driver,'Quản lý');
          const pass=await visible(driver,['#login-password','input[data-testid="login-password"]','input[autocomplete="current-password"]','input[type="password"]']);
          await pass.clear(); await pass.sendKeys(password);
          log('LOGIN-006','01','Click Đăng nhập'); await clickSubmit(driver); log('LOGIN-006','02','Chờ kết quả login');
          await sleep(slowMo);
          const deadline=Date.now()+15000;
          while(Date.now()<deadline){
            const url=await driver.getCurrentUrl(); const body=(await driver.findElement(By.css('body')).getText()).trim();
            if(!url.includes('/login')) return `Login thành công | URL=${url}`;
            if(/không hợp lệ|sai mật khẩu|đăng nhập thất bại|lỗi đăng nhập|mật khẩu không đúng|401|403/i.test(body)) throw new Error(`Backend/FE từ chối credentials | ${body.slice(0,500)}`);
            await sleep(300);
          }
          const body=(await driver.findElement(By.css('body')).getText()).trim();
          throw new Error(`Timeout chờ login | URL=${await driver.getCurrentUrl()} | body=${body.slice(0,500)}`);
        });
      }

      await runCase(driver,add,`LOGIN-${device}-CONSOLE`,`Browser console ${device}`,async()=> 'Selenium Chrome session OK');
    }
  } finally {
    log('SYS','99','Đóng Chrome'); await driver.quit();
  }
}
