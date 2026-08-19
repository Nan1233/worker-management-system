'use strict';

const crypto = require('node:crypto');
const { assertCutoverEligibility } = require('./disasterRestoreLifecycleService');

const SAFE_CLASSES = new Set(['STAGING', 'DISPOSABLE', 'DISASTER_RECOVERY']);
function safeIdent(value) { return /^[A-Za-z0-9_]+$/.test(String(value || '')); }
function restoreId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `restore_${stamp}_${crypto.randomBytes(3).toString('hex')}`;
}
function defaultTargetDatabase(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `worker_management_restore_${stamp}`;
}
function assertSafeRestorePlan({ activeDb, activeHost, activePort, targetDb, targetHost, targetPort, envClass, confirm, dryRun = false }) {
  const active = String(activeDb || '').trim();
  const activeH = String(activeHost || '').trim().toLowerCase();
  const activeP = String(activePort || '4000').trim();
  const target = String(targetDb || '').trim();
  const targetH = String(targetHost || '').trim().toLowerCase();
  const targetP = String(targetPort || '4000').trim();
  const classification = String(envClass || '').trim().toUpperCase();
  if (!target || !safeIdent(target)) { const e = new Error('Restore target DB name không hợp lệ'); e.code='RESTORE_TARGET_INVALID'; throw e; }
  if (active && target.toLowerCase() === active.toLowerCase() && (!activeH || !targetH || (activeH === targetH && activeP === targetP))) { const e = new Error('Restore target trùng active DB'); e.code='RESTORE_ACTIVE_DB_REFUSED'; throw e; }
  if (!/restore|rehearsal|staging|test|drill/i.test(target)) { const e = new Error('Restore target phải là DB staging/restore/test riêng'); e.code='RESTORE_TARGET_NAME_UNSAFE'; throw e; }
  if (!dryRun) {
    if (!SAFE_CLASSES.has(classification)) { const e = new Error('Restore mutation yêu cầu explicit environment classification'); e.code='RESTORE_ENV_CLASS_REQUIRED'; throw e; }
    if (confirm !== 'KTC_DISASTER_RESTORE_STAGE') { const e = new Error('Thiếu destructive confirmation token'); e.code='RESTORE_CONFIRMATION_REQUIRED'; throw e; }
  }
  return { activeDb: active || null, activeHost: activeH || null, activePort: activeP, targetDb: target, targetHost: targetH || null, targetPort: targetP, envClass: classification || null, dryRun };
}
function assertCutoverAllowed(state, context = {}) { return assertCutoverEligibility(state, context); }
function redact(value) {
  if (value == null) return value;
  return String(value).replace(/((?:password|token|secret|key)\s*[=:]\s*)[^\s,;]+/ig, '$1[REDACTED]');
}
module.exports = { SAFE_CLASSES, defaultTargetDatabase, restoreId, assertSafeRestorePlan, assertCutoverAllowed, redact };
