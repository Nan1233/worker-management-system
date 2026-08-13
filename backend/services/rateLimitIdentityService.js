const crypto = require('crypto');

function normalizeLoginIdentifier(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || 'unknown';
}

function safeClientIp(req) {
  return String(req?.ip || req?.socket?.remoteAddress || 'unknown').trim() || 'unknown';
}

function hashKey(value, namespace = 'ktc-rate-limit') {
  return crypto.createHash('sha256').update(`${namespace}:${String(value || '')}`).digest('hex').slice(0, 32);
}

function bearerToken(req) {
  const raw = String(req?.headers?.authorization || '');
  const [scheme, token] = raw.split(' ');
  return scheme === 'Bearer' && token ? token : '';
}

function authenticatedIdentityKey(req, verifyToken) {
  const token = bearerToken(req);
  if (token && typeof verifyToken === 'function') {
    try {
      const decoded = verifyToken(token);
      const id = Number(decoded?.id);
      if (Number.isInteger(id) && id > 0) return `user:${id}`;
      const username = normalizeLoginIdentifier(decoded?.username);
      if (username !== 'unknown') return `account:${hashKey(username, 'account')}`;
    } catch {
      // Invalid/untrusted credentials fall back to the trusted network identity.
    }
  }
  return `ip:${hashKey(safeClientIp(req), 'ip')}`;
}

function requestUserKey(req) {
  const id = Number(req?.user?.id);
  if (Number.isInteger(id) && id > 0) return `user:${id}`;
  const workerId = Number(req?.user?.worker_id);
  if (Number.isInteger(workerId) && workerId > 0) return `worker:${workerId}`;
  const username = normalizeLoginIdentifier(req?.user?.username);
  if (username !== 'unknown') return `account:${hashKey(username, 'account')}`;
  return `ip:${hashKey(safeClientIp(req), 'ip')}`;
}

function routeUserKey(req) {
  const route = String(req?.baseUrl || req?.route?.path || req?.path || 'route').replace(/\?.*$/, '');
  return `${requestUserKey(req)}:route:${hashKey(route, 'route')}`;
}

function loginAccountKey(req) {
  return `login-account:${hashKey(normalizeLoginIdentifier(req?.body?.username), 'login')}`;
}

function loginNetworkKey(req) {
  return `login-ip:${hashKey(safeClientIp(req), 'login-ip')}`;
}

function extractCookie(req, name) {
  const cookieHeader = String(req?.headers?.cookie || '');
  for (const part of cookieHeader.split(';')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    if (part.slice(0, at).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(at + 1).trim()); } catch { return part.slice(at + 1).trim(); }
  }
  return '';
}

function refreshCredentialKey(req) {
  const bodyToken = typeof req?.body?.refreshToken === 'string' ? req.body.refreshToken.trim() : '';
  const token = bodyToken || extractCookie(req, 'ktc_refresh_token');
  if (token) return `refresh:${hashKey(token, 'refresh-token')}`;
  return `refresh-ip:${hashKey(safeClientIp(req), 'refresh-ip')}`;
}

module.exports = {
  normalizeLoginIdentifier,
  safeClientIp,
  hashKey,
  bearerToken,
  authenticatedIdentityKey,
  requestUserKey,
  routeUserKey,
  loginAccountKey,
  loginNetworkKey,
  refreshCredentialKey,
};
