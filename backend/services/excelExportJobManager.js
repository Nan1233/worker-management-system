const { Worker } = require('worker_threads');
const crypto = require('crypto');
const path = require('path');

const jobs = new Map();
let activeJobId = null;
let externalHeavyTask = null;

const DEFAULT_TIMEOUT_MS = Math.max(Number(process.env.EXCEL_JOB_TIMEOUT_MS || 240000), 30000);
const HISTORY_TTL_MS = Math.max(Number(process.env.EXCEL_JOB_HISTORY_TTL_MS || 3600000), 60000);

function cleanupHistory() {
  const cutoff = Date.now() - HISTORY_TTL_MS;
  for (const [id, job] of jobs.entries()) {
    if (job.finishedAt && job.finishedAt < cutoff) jobs.delete(id);
  }
}

function publicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    createdAt: new Date(job.createdAt).toISOString(),
    startedAt: job.startedAt ? new Date(job.startedAt).toISOString() : null,
    finishedAt: job.finishedAt ? new Date(job.finishedAt).toISOString() : null,
    durationMs: job.finishedAt && job.startedAt ? job.finishedAt - job.startedAt : null,
    error: job.error || null,
    result: job.status === 'completed' ? job.result : null
  };
}

function getStatus(id) {
  cleanupHistory();
  return publicJob(jobs.get(id));
}

function getActiveStatus() {
  if (activeJobId) return getStatus(activeJobId);
  return externalHeavyTask ? { id: externalHeavyTask.id, type: externalHeavyTask.type, status: 'running', createdAt: new Date(externalHeavyTask.startedAt).toISOString() } : null;
}

function acquireHeavyTask(type, id = crypto.randomUUID()) {
  if (activeJobId || externalHeavyTask) {
    const error = new Error('Một tác vụ Excel nặng khác đang chạy. Vui lòng thử lại sau.');
    error.statusCode = 429; error.code = 'EXCEL_JOB_BUSY'; error.activeJob = getActiveStatus(); throw error;
  }
  externalHeavyTask = { id, type, startedAt: Date.now() };
  return () => { if (externalHeavyTask?.id === id) externalHeavyTask = null; };
}


function run(type, payload, options = {}) {
  cleanupHistory();
  if (activeJobId || externalHeavyTask) {
    const error = new Error('Một tác vụ Excel nặng khác đang chạy. Vui lòng thử lại sau.');
    error.statusCode = 429;
    error.code = 'EXCEL_JOB_BUSY';
    error.activeJob = getActiveStatus();
    return Promise.reject(error);
  }

  const id = options.externalJobId || crypto.randomUUID();
  const job = {
    id,
    type,
    status: 'queued',
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    result: null,
    error: null
  };
  jobs.set(id, job);
  activeJobId = id;

  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, '../workers/excelExportWorker.js'), {
      workerData: { type, payload }
    });
    job.status = 'running';
    job.startedAt = Date.now();

    let settled = false;
    const finish = (status, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      job.status = status;
      job.finishedAt = Date.now();
      activeJobId = null;
      worker.removeAllListeners();
      worker.terminate().catch(() => undefined);
      if (status === 'completed') {
        job.result = value;
        resolve({ jobId: id, ...value });
      } else {
        job.error = value?.message || String(value || 'Excel job failed');
        const error = value instanceof Error ? value : new Error(job.error);
        if (value?.statusCode) error.statusCode = value.statusCode;
        error.jobId = id;
        reject(error);
      }
    };

    const timeoutMs = Math.max(Number(options.timeoutMs || DEFAULT_TIMEOUT_MS), 30000);
    const timer = setTimeout(() => {
      worker.terminate().catch(() => undefined);
      const error = new Error(`Tác vụ Excel vượt quá thời gian ${Math.round(timeoutMs / 1000)} giây`);
      error.statusCode = 504;
      error.code = 'EXCEL_JOB_TIMEOUT';
      finish('timeout', error);
    }, timeoutMs);

    worker.once('message', (message) => {
      if (message?.ok) finish('completed', message.result);
      else {
        const error = new Error(message?.error?.message || 'Không thể tạo file Excel');
        error.statusCode = message?.error?.statusCode || 500;
        error.stack = message?.error?.stack || error.stack;
        finish('failed', error);
      }
    });
    worker.once('error', (error) => {
      if (error?.code === 'ERR_WORKER_OUT_OF_MEMORY') {
        const oom = new Error('Máy chủ không đủ RAM để tạo workbook. Hãy dùng chức năng xuất trên ứng dụng Desktop.');
        oom.statusCode = 503;
        oom.code = 'DESKTOP_EXCEL_REQUIRED';
        oom.cause = error;
        finish('failed', oom);
        return;
      }
      finish('failed', error);
    });
    worker.once('exit', (code) => {
      if (!settled && code !== 0) finish('failed', new Error(`Excel worker dừng với mã ${code}`));
    });
  });
}

module.exports = { run, getStatus, getActiveStatus, acquireHeavyTask };
