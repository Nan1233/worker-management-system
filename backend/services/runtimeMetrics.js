'use strict';

const startedAt = Date.now();
const MAX_ROUTE_ENTRIES = 120;
const MAX_RECENT_ERRORS = 20;
const state = {
  requests: 0,
  errors4xx: 0,
  errors5xx: 0,
  slowRequests: 0,
  totalDurationMs: 0,
  maxDurationMs: 0,
  byStatus: new Map(),
  byRoute: new Map(),
  recentErrors: []
};

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

function pushRecentError(item) {
  state.recentErrors.unshift(item);
  state.recentErrors = state.recentErrors.slice(0, MAX_RECENT_ERRORS);
}

function getRouteBucket(method, path) {
  const key = `${String(method || 'GET').toUpperCase()} ${String(path || '/').split('?')[0]}`;
  let bucket = state.byRoute.get(key);
  if (!bucket) {
    if (state.byRoute.size >= MAX_ROUTE_ENTRIES) return null;
    bucket = { requests: 0, errors4xx: 0, errors5xx: 0, slowRequests: 0, durations: [] };
    state.byRoute.set(key, bucket);
  }
  return bucket;
}

function recordHttp({ requestId, method, path, status, durationMs }) {
  const duration = Math.max(0, Number(durationMs || 0));
  state.requests += 1;
  state.totalDurationMs += duration;
  state.maxDurationMs = Math.max(state.maxDurationMs, duration);
  if (status >= 400 && status < 500) state.errors4xx += 1;
  if (status >= 500) state.errors5xx += 1;
  if (duration >= 1000) state.slowRequests += 1;
  state.byStatus.set(String(status), (state.byStatus.get(String(status)) || 0) + 1);

  const route = getRouteBucket(method, path);
  if (route) {
    route.requests += 1;
    if (status >= 400 && status < 500) route.errors4xx += 1;
    if (status >= 500) route.errors5xx += 1;
    if (duration >= 1000) route.slowRequests += 1;
    route.durations.push(duration);
    if (route.durations.length > 500) route.durations.shift();
  }

  if (status >= 500) {
    pushRecentError({
      requestId,
      method,
      path: String(path || '').split('?')[0],
      status,
      at: new Date().toISOString()
    });
  }
}

function snapshot() {
  const memory = process.memoryUsage();
  const routes = Object.fromEntries(
    [...state.byRoute.entries()]
      .map(([key, value]) => [key, {
        requests: value.requests,
        errors4xx: value.errors4xx,
        errors5xx: value.errors5xx,
        slowRequests: value.slowRequests,
        p50Ms: Math.round(percentile(value.durations, 0.50)),
        p95Ms: Math.round(percentile(value.durations, 0.95)),
        maxMs: Math.round(Math.max(0, ...value.durations))
      }])
  );

  return {
    startedAt: new Date(startedAt).toISOString(),
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    http: {
      requests: state.requests,
      errors4xx: state.errors4xx,
      errors5xx: state.errors5xx,
      slowRequests: state.slowRequests,
      averageDurationMs: state.requests ? Math.round(state.totalDurationMs / state.requests) : 0,
      p50DurationMs: Math.round(percentile([...state.byRoute.values()].flatMap((r) => r.durations), 0.50)),
      p95DurationMs: Math.round(percentile([...state.byRoute.values()].flatMap((r) => r.durations), 0.95)),
      maxDurationMs: Math.round(state.maxDurationMs),
      byStatus: Object.fromEntries(state.byStatus),
      byRoute: routes
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
