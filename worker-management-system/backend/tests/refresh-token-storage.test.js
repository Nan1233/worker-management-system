const test = require('node:test');
const assert = require('node:assert/strict');
const { hashRefreshToken } = require('../utils/refreshTokenHash');

test('refresh tokens are hashed deterministically before DB storage', () => {
    const raw = '0123456789abcdef'.repeat(4);
    const hashed = hashRefreshToken(raw);
    assert.equal(hashed.length, 64);
    assert.notEqual(hashed, raw);
    assert.equal(hashRefreshToken(raw), hashed);
});

test('empty refresh tokens are rejected by hash helper', () => {
    assert.equal(hashRefreshToken(''), '');
    assert.equal(hashRefreshToken('   '), '');
});

test('session model never inserts raw refresh tokens', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'models', 'sessionModel.js'), 'utf8');
    assert.match(source, /hashRefreshToken\(data\.refresh_token\)/);
    assert.match(source, /refresh_token IN \(\?, \?\)/);
});
