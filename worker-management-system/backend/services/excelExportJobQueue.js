const store = require('./excelExportJobStore');
const manager = require('./excelExportJobManager');
let pumpTimer = null;
let pumping = false;

function schedule(delay = 25) {
  clearTimeout(pumpTimer);
  pumpTimer = setTimeout(() => pump().catch((e) => console.error('EXCEL JOB PUMP ERROR:', e)), delay);
  pumpTimer.unref?.();
}

async function enqueue(type, payload, options = {}) {
  const job = await store.create({ type, payload, requestedBy: options.requestedBy, maxAttempts: options.maxAttempts || 3 });
  schedule();
  return job;
}

async function pump() {
  if (pumping || manager.getActiveStatus()) return;
  pumping = true;
  try {
    const next = await store.claimNextReady();
    if (!next) return;
    const heapBefore = process.memoryUsage().heapUsed;
    const started = Date.now();
    try {
      const result = await manager.run(next.type, next.payload, { externalJobId: next.id });
      const metrics = {
        heapBefore,
        heapAfter: process.memoryUsage().heapUsed,
        durationMs: Date.now() - started,
        reportCount: Number(result?.reportCount || 0),
        fileSize: Number(result?.fileSize || 0),
        ...(result?.metrics || {})
      };
      await store.complete(next.id, result, metrics);
    } catch (error) {
      await store.fail(next.id, error, Math.min(300000, 30000 * Math.max(1, next.attempts + 1)));
    }
  } finally {
    pumping = false;
    const pending = await store.nextReady().catch(() => null);
    if (pending) schedule(1000);
  }
}

async function enqueueMonthlyDates(dates, requestedBy) {
  const values = Array.isArray(dates) ? dates : [dates];
  const months = [...new Set(values.map((v) => String(v || '').slice(0, 7)).filter((v) => /^\d{4}-\d{2}$/.test(v)))];
  const jobs = [];
  for (const yearMonth of months) jobs.push(await enqueue('monthly', { yearMonth }, { requestedBy }));
  return jobs;
}

async function initialize() {
  const recovered = await store.recoverStaleRunning(10);
  if (recovered > 0) {
    console.warn(`[KTC] Re-queued ${recovered} stale Excel export job(s).`);
  }
  schedule(1000);
}

module.exports = { enqueue, enqueueMonthlyDates, pump, schedule, initialize };
