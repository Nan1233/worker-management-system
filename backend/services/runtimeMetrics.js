'use strict';

const startedAt = Date.now();
const state = {
  requests: 0,
  errors4xx: 0,
  errors5xx: 0,
  slowRequests: 0,
  totalDurationMs: 0,
  maxDurationMs: 0,
  byStatus: new Map(),
  recentErrors: []
};

function pushRecentError(item) {
  state.recentErrors.unshift(item);
  state.recentErrors = state.recentErrors.slice(0, 20);
}

function recordHttp({ requestId, method, path, status, durationMs }) {
  state.requests += 1;
  state.totalDurationMs += Number(durationMs || 0);
  state.maxDurationMs = Math.max(state.maxDurationMs, Number(durationMs || 0));
  if (status >= 400 && status < 500) state.errors4xx += 1;
  if (status >= 500) state.errors5xx += 1;
  if (durationMs >= 1000) state.slowRequests += 1;
  state.byStatus.set(String(status), (state.byStatus.get(String(status)) || 0) + 1);
  if (status >= 500) pushRecentError({ requestId, method, path: String(path || '').split('?')[0], status, at: new Date().toISOString() });
}

function snapshot() {
  const memory = process.memoryUsage();
  return {
    startedAt: new Date(startedAt).toISOString(),
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    http: {
      requests: state.requests,
      errors4xx: state.errors4xx,
      errors5xx: state.errors5xx,
      slowRequests: state.slowRequests,
      averageDurationMs: state.requests ? Math.round(state.totalDurationMs / state.requests) : 0,
      maxDurationMs: Math.round(state.maxDurationMs),
      byStatus: Object.fromEntries(state.byStatus)
    },
    memory: {
      rssMb: Math.round(memory.rss / 1024 / 1024),
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024)
    },
    recentErrors: state.recentErrors
  };
}

module.exports = { recordHttp, snapshot };
