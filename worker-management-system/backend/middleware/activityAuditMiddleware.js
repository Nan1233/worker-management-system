const AuditService = require('../services/auditService');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SECRET_KEYS = new Set([
  'password',
  'current_password',
  'new_password',
  'token',
  'accessToken',
  'refreshToken',
  'refresh_token',
]);

function sanitize(value, depth = 0) {
  if (depth > 5) return '[truncated]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, depth + 1));
  if (typeof value !== 'object') {
    if (typeof value === 'string' && value.length > 1500) return `${value.slice(0, 1500)}…`;
    return value;
  }

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEYS.has(key)) {
      result[key] = '[redacted]';
      continue;
    }
    result[key] = sanitize(item, depth + 1);
  }
  return result;
}

function inferEntity(req) {
  const path = String(req.originalUrl || req.path || '').split('?')[0];
  const segments = path.split('/').filter(Boolean);
  const apiIndex = segments.indexOf('api');
  const relevant = apiIndex >= 0 ? segments.slice(apiIndex + 1) : segments;

  const entityType = (relevant[0] || 'system')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80);

  const candidate = [...relevant].reverse().find((segment) => /^\d+$/.test(segment));
  const entityId = candidate || req.body?.id || null;

  return { entityType, entityId };
}

function actionForMethod(method) {
  if (method === 'POST') return 'DATA_CREATE';
  if (method === 'DELETE') return 'DATA_DELETE';
  return 'DATA_UPDATE';
}

module.exports = function activityAuditMiddleware(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) return next();

  const path = String(req.originalUrl || req.path || '');
  if (
    path.startsWith('/api/auth/refresh') ||
    path.startsWith('/api/system/notifications/') ||
    path === '/api/system/notifications/read-all'
  ) {
    return next();
  }

  const startedBody = sanitize(req.body || {});

  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 400) return;

    // Login/logout already have explicit semantic audit entries.
    if (path.startsWith('/api/auth/login') || path.startsWith('/api/auth/logout')) return;

    const { entityType, entityId } = inferEntity(req);
    const actor = req.user || null;

    void AuditService.logActivity({
      userId: actor?.id || null,
      action: actionForMethod(req.method),
      entityType,
      entityId,
      description: `${req.method} ${path.split('?')[0]}`,
      metadata: {
        method: req.method,
        path: path.split('?')[0],
        request_id: req.requestId || null,
        role: actor?.role || null,
        username: actor?.username || null,
        body: startedBody,
        status: res.statusCode,
      },
      req,
    }).catch((error) => {
      console.error('[KTC] ACTIVITY_AUDIT_FAILED', {
        requestId: req.requestId || null,
        path,
        message: error.message,
      });
    });
  });

  return next();
};
