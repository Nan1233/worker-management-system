function normalizeAccessToken(token) {
  return String(token || '').replace(/^Bearer\s+/i, '').trim();
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function isUsableAccessToken(token, clockSkewSeconds = 20) {
  const normalized = normalizeAccessToken(token);
  if (!normalized) return false;
  const payload = decodeJwtPayload(normalized);
  if (!payload || !Number.isFinite(Number(payload.exp))) return true;
  return Number(payload.exp) * 1000 > Date.now() + clockSkewSeconds * 1000;
}

module.exports = { normalizeAccessToken, decodeJwtPayload, isUsableAccessToken };
