import { chromium } from 'playwright';

export async function runTestSuite(baseUrl) {
  const results = [];
  const add = (name, status, detail = '') => results.push({ name, status, detail });
  const url = String(baseUrl || '').replace(/\/$/, '');
  if (!/^https?:\/\//i.test(url)) {
    add('Environment URL', 'FAIL', 'KTC frontend URL không hợp lệ.');
    return { results, log: 'Không chạy vì URL không hợp lệ.' };
  }

  let browser;
  try {
    const pageResponse = await fetch(`${url}/login`, { redirect: 'manual' });
    if (pageResponse.status >= 200 && pageResponse.status < 500) {
      add('Frontend reachable', 'PASS', `HTTP ${pageResponse.status}`);
    } else {
      add('Frontend reachable', 'FAIL', `HTTP ${pageResponse.status}`);
    }
  } catch (error) {
    add('Frontend reachable', 'FAIL', error.message);
    return { results, log: 'Frontend không truy cập được; bỏ qua browser tests.' };
  }

  for (const [name, path] of [
    ['Production temp API does not return 5xx', '/api/production-temp/my'],
    ['Notifications API does not return 5xx', '/api/system/notifications/unread-count'],
  ]) {
    try {
      const response = await fetch(`${url}${path}`, { headers: { Accept: 'application/json' } });
      if (response.status < 500) add(name, 'PASS', `HTTP ${response.status} (401/403 nếu chưa đăng nhập là bình thường)`);
      else add(name, 'FAIL', `HTTP ${response.status}`);
    } catch (error) {
      add(name, 'FAIL', error.message);
    }
  }

  try {
    browser = await chromium.launch({ headless: true });
    for (const device of [
      { name: 'Desktop', width: 1440, height: 900 },
      { name: 'Mobile', width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({ viewport: { width: device.width, height: device.height } });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      try {
        await page.goto(`${url}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        const title = await page.title();
        const body = await page.locator('body').innerText();
        if (/đăng nhập|login/i.test(body)) add(`Login page ${device.name}`, 'PASS', `title=${title || '(none)'}`);
        else add(`Login page ${device.name}`, 'FAIL', 'Không tìm thấy nội dung login.');
        if (consoleErrors.length === 0) add(`Browser console ${device.name}`, 'PASS');
        else add(`Browser console ${device.name}`, 'FAIL', consoleErrors.slice(0, 3).join(' | '));
      } catch (error) {
        add(`Login page ${device.name}`, 'FAIL', error.message);
      } finally {
        await context.close();
      }
    }
  } catch (error) {
    add('Playwright engine', 'FAIL', `${error.message}. Chạy npm install trong tools/test-center để cài Chromium.`);
  } finally {
    if (browser) await browser.close();
  }

  return {
    results,
    log: `Hoàn tất ${results.length} test. PASS=${results.filter(x => x.status === 'PASS').length}, FAIL=${results.filter(x => x.status === 'FAIL').length}, SKIP=${results.filter(x => x.status === 'SKIP').length}`,
  };
}
