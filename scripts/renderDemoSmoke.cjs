#!/usr/bin/env node
/*
 * KTC Render Demo Smoke Gate
 * Usage:
 *   KTC_BASE_URL=https://... KTC_TOKEN=... KTC_REPORT_IDS=123,124 node scripts/renderDemoSmoke.cjs
 *
 * This deliberately does NOT manufacture auth or bypass authorization.
 * It checks the real deployed approval API and prints a PASS/FAIL result.
 */
const base = String(process.env.KTC_BASE_URL || '').replace(/\/+$/, '');
const token = String(process.env.KTC_TOKEN || '');
const ids = String(process.env.KTC_REPORT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

if (!base || !token || !ids.length) {
  console.error('FAIL: set KTC_BASE_URL, KTC_TOKEN and KTC_REPORT_IDS');
  process.exit(2);
}

async function main() {
  const res = await fetch(`${base}/api/production-temp/approve-selected`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ids: ids.map(Number).filter(Number.isFinite) })
  });
  const body = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(body);
  if (res.status >= 200 && res.status < 300) {
    console.log('PASS: Render approve-selected smoke gate');
    return;
  }
  if (res.status === 409) {
    console.log('STALE/CONCURRENCY: refresh pending list and select current reports.');
    process.exit(3);
  }
  console.error('FAIL: approve-selected did not complete successfully');
  process.exit(1);
}
main().catch(err => { console.error(err); process.exit(1); });
