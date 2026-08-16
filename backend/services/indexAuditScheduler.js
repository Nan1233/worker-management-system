const { logProductionIndexAudit } = require('./productionIndexAuditService');

function startProductionIndexAuditScheduler(db, intervalMs = Number(process.env.KTC_INDEX_AUDIT_INTERVAL_MS || 6 * 60 * 60 * 1000)) {
  if (!db) return null;
  const timer = setInterval(() => {
    void logProductionIndexAudit(db);
  }, Math.max(60_000, intervalMs));
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

module.exports = { startProductionIndexAuditScheduler };
