'use strict';

// Real HTTP + real database: PUT /api/auth/password for admin/manager/lead.

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./harness');

const opts = { skip: h.skipReason };
const s = {};
const OLD = 'Passw0rd!x';

test.before(async () => {
  if (!h.enabled) return;
  const { db } = await h.start();
  s.db = db;
  s.mgr = await h.createUser(db, { username: 'pw-mgr', role: 'manager', processCodes: ['XLBV'] });
  await h.createUser(db, { username: 'pw-lead', role: 'lead', processCodes: ['XLBV'] });
  await h.createUser(db, { username: 'PW-W1', role: 'worker', workerCode: 'PW-W1', processCodes: ['XLBV'] });
});

test.after(async () => { if (h.enabled) await h.stop(); });

const change = (token, body) => h.request('PUT', '/api/auth/password', { token, body });

test('requires authentication', opts, async () => {
  const res = await change(undefined, { current_password: OLD, new_password: 'NewPassw0rd!', confirm_password: 'NewPassw0rd!' });
  assert.equal(res.status, 401);
});

test('workers have no password to change', opts, async () => {
  const { token } = await h.loginWorker('PW-W1');
  const res = await change(token, { current_password: 'x', new_password: 'NewPassw0rd!', confirm_password: 'NewPassw0rd!' });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'PASSWORD_NOT_APPLICABLE');
});

test('input validation never changes the password', opts, async () => {
  const { token } = await h.loginManagement('pw-lead', OLD);
  const cases = [
    [{ new_password: 'NewPassw0rd!', confirm_password: 'NewPassw0rd!' }, 422, 'PASSWORD_FIELDS_REQUIRED'],
    [{ current_password: OLD, new_password: 'NewPassw0rd!', confirm_password: 'Different1!' }, 422, 'PASSWORD_CONFIRM_MISMATCH'],
    [{ current_password: OLD, new_password: 'short', confirm_password: 'short' }, 422, 'PASSWORD_TOO_SHORT'],
    [{ current_password: OLD, new_password: OLD, confirm_password: OLD }, 422, 'PASSWORD_UNCHANGED'],
    [{ current_password: 'wrong-password', new_password: 'NewPassw0rd!', confirm_password: 'NewPassw0rd!' }, 400, 'CURRENT_PASSWORD_INVALID']
  ];
  for (const [body, status, code] of cases) {
    const res = await change(token, body);
    assert.equal(res.status, status, `${code}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.code, code);
  }
  assert.equal((await h.loginManagement('pw-lead', OLD)).status, 200, 'old password still valid after rejected attempts');
});

test('success: new password works, old one stops working, sessions are revoked, change is audited', opts, async () => {
  const login = await h.loginManagement('pw-mgr', OLD);
  assert.equal(login.status, 200);
  const NEW = 'BrandNewPassw0rd!';
  const res = await change(login.token, { current_password: OLD, new_password: NEW, confirm_password: NEW });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.code, 'PASSWORD_CHANGED');

  assert.equal((await h.loginManagement('pw-mgr', OLD)).status, 401, 'old password must no longer work');
  assert.equal((await h.loginManagement('pw-mgr', NEW)).status, 200, 'new password must work');

  const [sessions] = await s.db.query('SELECT COUNT(*) active FROM user_sessions WHERE user_id=? AND revoked_at IS NULL AND created_at < (SELECT MAX(created_at) FROM user_sessions WHERE user_id=?)', [s.mgr.userId, s.mgr.userId]);
  assert.equal(Number(sessions[0].active), 0, 'sessions that existed before the change must be revoked');

  await new Promise((resolve) => setTimeout(resolve, 300)); // audit is written in the background
  const [audit] = await s.db.query("SELECT action FROM activity_logs WHERE user_id=? AND action='PASSWORD_CHANGED'", [s.mgr.userId]);
  assert.equal(audit.length, 1);
});
