'use strict';

// Starts the REAL backend on a fixed port against a freshly built throw-away
// database and seeds the accounts used by frontend/tests/e2e. Used by
// frontend/playwright.config.ts (webServer). Same safety rules as harness.js
// (KTC_IT_DB_NAME must be ktc_it_*).

const h = require('./harness');

if (!h.enabled) {
  console.error(`E2E server refused: ${h.skipReason}`);
  process.exit(2);
}

const port = Number(process.env.KTC_E2E_API_PORT || 19080);

// server.js installs its own SIGTERM/SIGINT handlers that do not exit the process.
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => process.exit(0));

(async () => {
  const { db } = await h.start({ port });
  await h.createUser(db, { username: 'E2E-W1', role: 'worker', workerCode: 'E2E-W1', processCodes: ['XLBV'], fullName: 'Công nhân E2E' });
  await h.createUser(db, { username: 'e2e-manager', role: 'manager', processCodes: ['XLBV', 'GC'], fullName: 'Quản lý E2E' });
  await h.createUser(db, { username: 'e2e-lead', role: 'lead', processCodes: ['XLBV'], fullName: 'Tổ trưởng E2E' });
  await h.createUser(db, { username: 'e2e-admin', role: 'admin', fullName: 'Admin E2E' });
  await h.createUser(db, { username: 'e2e-pw', role: 'manager', processCodes: ['XLBV'], fullName: 'Quản lý đổi mật khẩu E2E' });
  console.log(`KTC_E2E_API_READY http://127.0.0.1:${port}`);
})().catch((error) => { console.error('E2E server failed', error); process.exit(1); });
