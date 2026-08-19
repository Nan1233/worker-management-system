const crypto = require('crypto');

const TOKEN_VERSION = 1;
const DEFAULT_TTL_SECONDS = 5 * 60;

function secret() {
  const value = String(process.env.DUPLICATE_CONFIRMATION_SECRET || process.env.JWT_SECRET || '').trim();
  if (!value) {
    const error = new Error('Duplicate confirmation secret is not configured');
    error.code = 'DUPLICATE_CONFIRMATION_UNAVAILABLE';
    error.status = 500;
    throw error;
  }
  return value;
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signBody(body) {
  return crypto.createHmac('sha256', secret()).update(body, 'utf8').digest('base64url');
}

function issueDuplicateConfirmation({ workerId, logicalDuplicateKey, existingReportId, existingReportType = 'temp', ttlSeconds = DEFAULT_TTL_SECONDS, now = Date.now() }) {
  const payload = {
    v: TOKEN_VERSION,
    w: Number(workerId),
    k: String(logicalDuplicateKey || ''),
    r: Number(existingReportId),
    t: String(existingReportType || 'temp'),
    exp: Math.floor(now / 1000) + Math.max(30, Number(ttlSeconds) || DEFAULT_TTL_SECONDS),
    n: crypto.randomBytes(12).toString('hex'),
  };
  if (!Number.isInteger(payload.w) || payload.w <= 0 || !/^[a-f0-9]{64}$/i.test(payload.k) || !Number.isInteger(payload.r) || payload.r <= 0) {
    throw new Error('Invalid duplicate confirmation context');
  }
  const body = b64url(JSON.stringify(payload));
  return `${body}.${signBody(body)}`;
}

function verifyDuplicateConfirmation(token, expected = {}, now = Date.now()) {
  const raw = String(token || '').trim();
  const [body, signature, extra] = raw.split('.');
  if (!body || !signature || extra) return { valid: false, reason: 'malformed' };
  let expectedSignature;
  try { expectedSignature = signBody(body); } catch (error) { throw error; }
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { valid: false, reason: 'signature' };

  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); }
  catch { return { valid: false, reason: 'payload' }; }
  if (payload?.v !== TOKEN_VERSION) return { valid: false, reason: 'version' };
  if (!Number.isInteger(payload.exp) || payload.exp <= Math.floor(now / 1000)) return { valid: false, reason: 'expired' };

  const checks = [
    ['w', Number(expected.workerId)],
    ['k', String(expected.logicalDuplicateKey || '')],
    ['r', Number(expected.existingReportId)],
    ['t', String(expected.existingReportType || 'temp')],
  ];
  for (const [field, expectedValue] of checks) {
    if (expectedValue && payload[field] !== expectedValue) return { valid: false, reason: field };
  }
  return { valid: true, payload };
}

module.exports = {
  DEFAULT_TTL_SECONDS,
  issueDuplicateConfirmation,
  verifyDuplicateConfirmation,
};
