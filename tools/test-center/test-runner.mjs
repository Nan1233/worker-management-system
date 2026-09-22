import { runAuthenticatedSuite } from './authenticated-suite.mjs';
import { runLoginE2E } from './login-e2e.mjs';

export async function runTestSuite(options = {}) {
  const results = [];
  const add = (name, status, detail = '', id = '') => results.push({ id, name, status, detail });
  const frontendUrl = String(options.frontendUrl || '').replace(/\/$/, '');
  const apiUrl = String(options.apiUrl || '').replace(/\/$/, '');
  const managerUsername = String(options.managerUsername || 'manager1').trim();
  const managerPassword = String(options.managerPassword || '123456');

  if (!/^https?:\/\//i.test(frontendUrl)) { add('Frontend URL', 'FAIL', 'KTC frontend URL không hợp lệ.', 'SYS-000'); return summarize(results); }
  if (!/^https?:\/\//i.test(apiUrl)) { add('API URL', 'FAIL', 'KTC backend URL không hợp lệ.', 'SYS-004'); return summarize(results); }
  const safeTarget = /(test|staging|127\.0\.0\.1|localhost)/i.test(frontendUrl) && /(test|staging|127\.0\.0\.1|localhost)/i.test(apiUrl);
  if (!safeTarget) { add('Environment guard', 'FAIL', 'Production URL bị chặn.', 'SEC-001'); return summarize(results); }
  add('Environment guard', 'PASS', `Frontend=${frontendUrl}; API=${apiUrl}`, 'SEC-001');

  try {
    const response = await fetch(frontendUrl, { redirect: 'manual' });
    add('Frontend reachable', response.status >= 200 && response.status < 400 ? 'PASS' : 'FAIL', `HTTP ${response.status}`, 'SYS-001');
    if (response.status >= 500) return summarize(results);
  } catch (error) { add('Frontend reachable', 'FAIL', error.message, 'SYS-001'); return summarize(results); }

  for (const [id, name, path] of [['SYS-002', 'Production-temp API does not return 5xx', '/api/production-temp/my'], ['SYS-003', 'Notifications API does not return 5xx', '/api/system/notifications/unread-count']]) {
    try {
      const response = await fetch(`${apiUrl}${path}`, { headers: { Accept: 'application/json' } });
      add(name, response.status < 500 ? 'PASS' : 'FAIL', `HTTP ${response.status} (401/403 chưa đăng nhập là bình thường)`, id);
    } catch (error) { add(name, 'FAIL', error.message, id); }
  }

  // One visible Chrome session for the complete UI login flow. Do not run duplicate Playwright sessions.
  await runLoginE2E({ frontendUrl, add, managerUsername, managerPassword });
  await runAuthenticatedSuite({ apiUrl, add, managerUsername, managerPassword });
  return summarize(results);
}

function summarize(results) {
  return {
    results,
    summary: { total: results.length, pass: results.filter(x => x.status === 'PASS').length, fail: results.filter(x => x.status === 'FAIL').length, skip: results.filter(x => x.status === 'SKIP').length },
    log: `Hoàn tất ${results.length} test. PASS=${results.filter(x => x.status === 'PASS').length}, FAIL=${results.filter(x => x.status === 'FAIL').length}, SKIP=${results.filter(x => x.status === 'SKIP').length}`,
  };
}
