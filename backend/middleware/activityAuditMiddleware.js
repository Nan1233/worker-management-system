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

// Chỉ ghi nhật ký cho các nghiệp vụ mà người quản lý thực sự cần theo dõi.
// API kỹ thuật/nội bộ như công thức, quyền, governance, notification,
// health và đồng bộ Excel không được biến thành hoạt động của người dùng.
const AUDITED_PREFIXES = [
  '/api/production',
  '/api/production-temp',
  '/api/users',
  '/api/workers',
  '/api/admin/master',
  '/api/machines',
  '/api/product-standards',
  '/api/deductions',
  '/api/defects',
];

const IGNORED_PATHS = [
  '/api/auth/refresh',
  '/api/system/notifications/',
  '/api/system/notifications/read-all',
  '/api/formula-settings',
  '/api/permissions',
  '/api/governance',
  '/api/excel-master-sync',
  '/api/sync-jobs',
];

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

function getPath(req) {
  return String(req.originalUrl || req.path || '').split('?')[0];
}

function shouldAudit(path) {
  if (IGNORED_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return false;
  return AUDITED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function inferEntity(req) {
  const path = getPath(req);
  const normalized = path.replace(/^\/api\//, '');
  const parts = normalized.split('/').filter(Boolean);

  let entityType = 'system';
  if (parts[0] === 'production') entityType = 'production_report';
  else if (parts[0] === 'production-temp') entityType = 'temp_report';
  else if (parts[0] === 'users') entityType = 'user';
  else if (parts[0] === 'workers') entityType = 'worker';
  else if (parts[0] === 'machines') entityType = 'machine';
  else if (parts[0] === 'product-standards') entityType = 'product';
  else if (parts[0] === 'deductions') entityType = 'deduction';
  else if (parts[0] === 'defects') entityType = 'defect';
  else if (parts[0] === 'admin' && parts[1] === 'master') {
    const resource = parts[2];
    entityType = ({ machines: 'machine', standards: 'product', deductions: 'deduction', defects: 'defect', workers: 'worker' })[resource] || 'system';
  }

  const candidate = [...parts].reverse().find((segment) => /^\d+$/.test(segment));
  const entityId = candidate || req.body?.id || null;
  return { entityType, entityId };
}

function actionForMethod(method) {
  if (method === 'POST') return 'CREATE';
  if (method === 'DELETE') return 'DELETE';
  return 'UPDATE';
}

module.exports = function activityAuditMiddleware(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) return next();

  const path = getPath(req);
  if (!shouldAudit(path)) return next();

  const startedBody = sanitize(req.body || {});

  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 400) return;

    // Login/logout và các nghiệp vụ duyệt/từ chối đã có audit semantic riêng.
    if (path.startsWith('/api/auth/login') || path.startsWith('/api/auth/logout')) return;

    const { entityType, entityId } = inferEntity(req);
    const actor = req.user || null;

    void AuditService.logActivity({
      userId: actor?.id || null,
      action: actionForMethod(req.method),
      entityType,
      entityId,
      description: `${req.method} ${path}`,
      metadata: {
        method: req.method,
        path,
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
