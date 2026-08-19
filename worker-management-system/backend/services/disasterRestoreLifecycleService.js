'use strict';

const crypto = require('node:crypto');

const STATES = Object.freeze([
  'PLANNED',
  'VERIFYING_BACKUP',
  'RESTORING',
  'MIGRATING',
  'VERIFYING',
  'INVALIDATING_SESSIONS',
  'VERIFIED_NOT_ACTIVATED',
  'CUTOVER_ELIGIBLE',
  'CUTOVER_IN_PROGRESS',
  'ACTIVE',
  'CUTOVER_FAILED',
  'ROLLBACK_IN_PROGRESS',
  'ROLLED_BACK',
  'FAILED',
]);

const TRANSITIONS = Object.freeze({
  PLANNED: new Set(['VERIFYING_BACKUP', 'FAILED']),
  VERIFYING_BACKUP: new Set(['RESTORING', 'FAILED']),
  RESTORING: new Set(['MIGRATING', 'FAILED']),
  MIGRATING: new Set(['VERIFYING', 'FAILED']),
  VERIFYING: new Set(['INVALIDATING_SESSIONS', 'FAILED']),
  INVALIDATING_SESSIONS: new Set(['VERIFIED_NOT_ACTIVATED', 'FAILED']),
  VERIFIED_NOT_ACTIVATED: new Set(['CUTOVER_ELIGIBLE', 'FAILED']),
  CUTOVER_ELIGIBLE: new Set(['CUTOVER_IN_PROGRESS', 'FAILED']),
  CUTOVER_IN_PROGRESS: new Set(['ACTIVE', 'CUTOVER_FAILED']),
  ACTIVE: new Set(['ROLLBACK_IN_PROGRESS']),
  CUTOVER_FAILED: new Set(['ROLLBACK_IN_PROGRESS']),
  ROLLBACK_IN_PROGRESS: new Set(['ROLLED_BACK', 'CUTOVER_FAILED']),
  ROLLED_BACK: new Set([]),
  FAILED: new Set([]),
});

function restoreError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}

function normalize(value) { return String(value ?? '').trim(); }
function upper(value) { return normalize(value).toUpperCase(); }
function yes(value) { return upper(value) === 'YES'; }

function safeFingerprint({ host, port, database, user } = {}) {
  const safe = {
    host: normalize(host).toLowerCase(),
    port: normalize(port || '4000'),
    database: normalize(database),
    user: normalize(user),
  };
  if (!safe.host || !safe.database) throw restoreError('RESTORE_TARGET_FINGERPRINT_INCOMPLETE', 'Restore target fingerprint thiếu host/database');
  const fingerprint = crypto.createHash('sha256').update(`${safe.host}:${safe.port}/${safe.database}`).digest('hex');
  return { ...safe, fingerprint };
}

function sameDatabaseTarget(a, b) {
  if (!a || !b) return false;
  return normalize(a.host).toLowerCase() === normalize(b.host).toLowerCase()
    && normalize(a.port || '4000') === normalize(b.port || '4000')
    && normalize(a.database).toLowerCase() === normalize(b.database).toLowerCase();
}

function assertTransition(from, to) {
  if (!STATES.includes(from) || !STATES.includes(to) || !TRANSITIONS[from]?.has(to)) {
    throw restoreError('RESTORE_STATE_TRANSITION_INVALID', `Invalid disaster restore transition ${from || '<none>'} -> ${to || '<none>'}`);
  }
  return true;
}

function transition(state, to, { at = new Date().toISOString(), operatorAction = null } = {}) {
  if (!state || typeof state !== 'object') throw restoreError('RESTORE_STATE_INVALID', 'Restore state invalid');
  const from = state.finalState;
  assertTransition(from, to);
  const next = { ...state, finalState: to, phase: to, updatedAt: at };
  const timestampFields = {
    CUTOVER_ELIGIBLE: 'cutoverEligibleAt',
    CUTOVER_IN_PROGRESS: 'cutoverStartedAt',
    ACTIVE: 'cutoverCompletedAt',
    CUTOVER_FAILED: 'cutoverFailedAt',
    ROLLBACK_IN_PROGRESS: 'rollbackStartedAt',
    ROLLED_BACK: 'rollbackCompletedAt',
  };
  if (timestampFields[to]) next[timestampFields[to]] = at;
  if (operatorAction) {
    next.auditTrail = [...(Array.isArray(state.auditTrail) ? state.auditTrail : []), { at, action: operatorAction, from, to }];
  }
  return next;
}

function assertCutoverEligibility(state, context = {}) {
  if (!state || typeof state !== 'object') throw restoreError('RESTORE_STATE_INVALID', 'Restore state invalid');
  const failures = [];
  if (state.finalState !== 'VERIFIED_NOT_ACTIVATED') failures.push('STATE_NOT_VERIFIED_NOT_ACTIVATED');
  if (state.schemaReady !== true || upper(state.schemaStatus) !== 'READY') failures.push('SCHEMA_NOT_READY');
  if (state.integrityReady !== true) failures.push('INTEGRITY_NOT_READY');
  if (state.sessionsInvalidated !== true || Number(state.activeSessionsRemaining) !== 0) failures.push('ACTIVE_SESSIONS_REMAIN');
  if (!normalize(state.restoreId)) failures.push('RESTORE_ID_MISSING');
  if (!normalize(state.backupSha256)) failures.push('BACKUP_FINGERPRINT_MISSING');
  if (!state.verifiedTargetFingerprint?.fingerprint) failures.push('VERIFIED_TARGET_FINGERPRINT_MISSING');
  if (upper(context.maintenanceMode) !== 'RESTORE') failures.push('MAINTENANCE_NOT_ACTIVE');
  if (!yes(context.workersQuiesced)) failures.push('WORKERS_NOT_QUIESCED');
  if (!yes(context.jobsQuiesced)) failures.push('JOBS_NOT_QUIESCED');

  let requestedTarget = null;
  try { requestedTarget = safeFingerprint(context.target || {}); } catch (_) { failures.push('CUTOVER_TARGET_FINGERPRINT_INCOMPLETE'); }
  if (requestedTarget && state.verifiedTargetFingerprint?.fingerprint !== requestedTarget.fingerprint) failures.push('CUTOVER_TARGET_MISMATCH');

  const active = context.active || null;
  if (!active?.host || !active?.database) failures.push('ACTIVE_DB_FINGERPRINT_REQUIRED');
  else if (requestedTarget && sameDatabaseTarget(active, requestedTarget)) failures.push('CUTOVER_TARGET_IS_ACTIVE_DB');

  if (failures.length) throw restoreError('CUTOVER_BLOCKED', 'Cutover eligibility gates failed', { failures });
  return {
    eligible: true,
    restoreId: state.restoreId,
    backupSha256: state.backupSha256,
    target: requestedTarget,
    currentActive: active,
  };
}

function assertRollbackEligibility(state, context = {}) {
  const failures = [];
  if (!state || !['ACTIVE', 'CUTOVER_FAILED'].includes(state.finalState)) failures.push('ROLLBACK_STATE_INVALID');
  if (upper(context.maintenanceMode) !== 'RESTORE') failures.push('MAINTENANCE_NOT_ACTIVE');
  if (!yes(context.workersQuiesced)) failures.push('WORKERS_NOT_QUIESCED');
  if (!yes(context.jobsQuiesced)) failures.push('JOBS_NOT_QUIESCED');
  if (context.confirm !== 'KTC_DISASTER_ROLLBACK') failures.push('ROLLBACK_CONFIRMATION_REQUIRED');
  if (!state?.preCutoverActiveFingerprint?.fingerprint) failures.push('OLD_DB_FINGERPRINT_NOT_RECORDED');
  if (context.oldDbExists !== true) failures.push('OLD_DB_NOT_CONFIRMED_RETAINED');
  let requestedOld = null;
  try { requestedOld = safeFingerprint(context.oldTarget || {}); } catch (_) { failures.push('ROLLBACK_TARGET_FINGERPRINT_INCOMPLETE'); }
  if (requestedOld && state?.preCutoverActiveFingerprint?.fingerprint !== requestedOld.fingerprint) failures.push('ROLLBACK_TARGET_MISMATCH');
  if (requestedOld && state?.verifiedTargetFingerprint && sameDatabaseTarget(requestedOld, state.verifiedTargetFingerprint)) failures.push('ROLLBACK_TARGET_IS_RESTORE_DB');
  if (failures.length) throw restoreError('ROLLBACK_BLOCKED', 'Rollback eligibility gates failed', { failures });
  return { eligible: true, restoreId: state.restoreId, rollbackTarget: requestedOld };
}

function durationMs(start, end) {
  const a = Date.parse(start || ''); const b = Date.parse(end || '');
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? b - a : null;
}
function calculateRecoveryMetrics(state = {}) {
  const serviceRestoredAt = state.cutoverCompletedAt || state.rollbackCompletedAt || null;
  return {
    rpoEstimateMs: durationMs(state.backupCreatedAt, state.cutoverCompletedAt),
    rtoEstimateMs: durationMs(state.incidentAt || state.restoreStartedAt || state.startedAt, serviceRestoredAt),
    backupCreatedAt: state.backupCreatedAt || null,
    restoreStartedAt: state.restoreStartedAt || state.startedAt || null,
    restoreVerifiedAt: state.restoreVerifiedAt || null,
    cutoverEligibleAt: state.cutoverEligibleAt || null,
    cutoverStartedAt: state.cutoverStartedAt || null,
    cutoverCompletedAt: state.cutoverCompletedAt || null,
    rollbackCompletedAt: state.rollbackCompletedAt || null,
  };
}

function cleanupPolicy(state, { now = new Date(), minRetentionHours = 168 } = {}) {
  if (!state) throw restoreError('RESTORE_STATE_INVALID', 'Restore state invalid');
  const neverAutoDrop = true;
  const anchor = state.finalState === 'FAILED' ? (state.failedAt || state.startedAt)
    : state.finalState === 'ROLLED_BACK' ? (state.rollbackCompletedAt || state.startedAt)
    : state.finalState === 'ACTIVE' ? (state.cutoverCompletedAt || state.startedAt)
    : state.finalState === 'VERIFIED_NOT_ACTIVATED' ? (state.restoreVerifiedAt || state.startedAt)
    : (state.failedAt || state.restoreVerifiedAt || state.startedAt);
  const ageMs = anchor ? Math.max(0, now.getTime() - Date.parse(anchor)) : 0;
  const retentionMet = ageMs >= minRetentionHours * 3600000;
  let category = 'UNKNOWN';
  let eligibleForManualCleanup = false;
  if (state.finalState === 'FAILED') { category = 'FAILED_RESTORE_TARGET'; eligibleForManualCleanup = retentionMet; }
  else if (state.finalState === 'VERIFIED_NOT_ACTIVATED') { category = 'VERIFIED_NEVER_ACTIVATED'; eligibleForManualCleanup = retentionMet; }
  else if (state.finalState === 'ROLLED_BACK') { category = 'ROLLED_BACK_RESTORE_TARGET'; eligibleForManualCleanup = retentionMet; }
  else if (state.finalState === 'ACTIVE') { category = 'OLD_ACTIVE_DB_RETAINED'; eligibleForManualCleanup = false; }
  return { neverAutoDrop, category, retentionMet, eligibleForManualCleanup, minRetentionHours };
}

module.exports = {
  STATES,
  TRANSITIONS,
  safeFingerprint,
  sameDatabaseTarget,
  assertTransition,
  transition,
  assertCutoverEligibility,
  assertRollbackEligibility,
  calculateRecoveryMetrics,
  cleanupPolicy,
};
