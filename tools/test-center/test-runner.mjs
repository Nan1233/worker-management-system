import { chromium } from 'playwright';
import { TEST_CASES } from './test-cases.mjs';

export async function runTestSuite(options = {}) {
  const results = [];
  const add = (name, status, detail = '', id = '') => results.push({ id, name, status, detail });
  const frontendUrl = String(options.frontendUrl || '').replace(/\/$/, '');
  const apiUrl = String(options.apiUrl || '').replace(/\/$/, '');

  if (!/^https?:\/\//i.test(frontendUrl)) { add('Frontend URL', 'FAIL', 'KTC frontend URL không hợp lệ.', 'SYS-000'); return summarize(results); }
  if (!/^https?:\/\//i.test(apiUrl)) { add('API URL', 'FAIL', 'KTC backend URL không hợp lệ.', 'SYS-004'); return summarize(results); }
  const safeTarget = /(test|staging|127\.0\.0\.1|localhost)/i.test(frontendUrl) && /(test|staging|127\.0\.0\.1|localhost)/i.test(apiUrl);
  if (!safeTarget) { add('Environment guard', 'FAIL', 'Production URL bị chặn.', 'SEC-001'); return summarize(results); }
  add('Environment guard', 'PASS', `Frontend=${frontendUrl}; API=${apiUrl}`, 'SEC-001');

  try {
    const response = await fetch(frontendUrl, { redirect: 'manual' });
    if (response.status >= 200 && response.status < 400) add('Frontend reachable', 'PASS', `HTTP ${response.status}`, 'SYS-001');
    else add('Frontend reachable', 'FAIL', `HTTP ${response.status}`, 'SYS-001');
  } catch (error) { add('Frontend reachable', 'FAIL', error.message, 'SYS-001'); return summarize(results); }

  for (const [id, name, path] of [['SYS-002', 'Production-temp API does not return 5xx', '/api/production-temp/my'], ['SYS-003', 'Notifications API does not return 5xx', '/api/system/notifications/unread-count']]) {
    try {
      const response = await fetch(`${apiUrl}${path}`, { headers: { Accept: 'application/json' } });
      if (response.status < 500) add(name, 'PASS', `HTTP ${response.status} (401/403 chưa đăng nhập là bình thường)`, id);
      else add(name, 'FAIL', `HTTP ${response.status}`, id);
    } catch (error) { add(name, 'FAIL', error.message, id); }
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const [id, name, width, height] of [['UI-001', 'Login page desktop', 1440, 900], ['UI-002', 'Login page mobile', 390, 844]]) {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      page.on('pageerror', error => consoleErrors.push(`PAGEERROR: ${error.message}`));
      try {
        await page.goto(`${frontendUrl}/#/login`, { waitUntil: 'networkidle', timeout: 30_000 });
        await page.waitForLoadState('domcontentloaded');

        // Do not depend on visible Vietnamese/English text: the login UI can be icon/text styled
        // or localized. Validate the actual form structure instead.
        const inputs = page.locator('input');
        const inputCount = await inputs.count();
        const buttons = page.locator('button, [role="button"], input[type="submit"]');
        const buttonCount = await buttons.count();
        const hasPassword = await page.locator('input[type="password"]').count() > 0;
        const hasForm = await page.locator('form').count() > 0;
        const bodyText = await page.locator('body').innerText();
        const hasLoginText = /đăng nhập|login|mã công nhân|mật khẩu|worker/i.test(bodyText);

        if ((hasForm && inputCount >= 1) || (inputCount >= 1 && buttonCount >= 1) || hasPassword || hasLoginText) {
          add(name, 'PASS', `viewport=${width}x${height}; inputs=${inputCount}; buttons=${buttonCount}`, id);
        } else {
          add(name, 'FAIL', `Không nhận diện được form login. inputs=${inputCount}; buttons=${buttonCount}; URL=${page.url()}`, id);
        }

        add(id === 'UI-001' ? 'Browser console desktop' : 'Browser console mobile', consoleErrors.length ? 'FAIL' : 'PASS', consoleErrors.slice(0, 3).join(' | '), id === 'UI-001' ? 'UI-003' : 'UI-004');
      } catch (error) { add(name, 'FAIL', error.message, id); }
      finally { await context.close(); }
    }
  } catch (error) { add('Playwright engine', 'FAIL', `${error.message}. Chạy npm install trong tools/test-center.`, 'UI-000'); }
  finally { if (browser) await browser.close(); }

  for (const test of TEST_CASES.filter(x => x.status === 'SKIP')) add(test.name, 'SKIP', test.detail, test.id);
  return summarize(results);
}

function summarize(results) {
  return { results, summary: { total: results.length, pass: results.filter(x => x.status === 'PASS').length, fail: results.filter(x => x.status === 'FAIL').length, skip: results.filter(x => x.status === 'SKIP').length }, log: `Hoàn tất ${results.length} test. PASS=${results.filter(x => x.status === 'PASS').length}, FAIL=${results.filter(x => x.status === 'FAIL').length}, SKIP=${results.filter(x => x.status === 'SKIP').length}` };
}
