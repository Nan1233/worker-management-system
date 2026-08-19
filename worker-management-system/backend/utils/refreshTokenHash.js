const crypto = require('node:crypto');

function hashRefreshToken(token) {
    const normalized = String(token || '').trim();
    if (!normalized) return '';
    return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

module.exports = { hashRefreshToken };
