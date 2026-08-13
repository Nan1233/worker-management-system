const test = require('node:test');
const assert = require('node:assert/strict');
const { requestMeta } = require('../controllers/productionTempControllerUtils');

test('audit request metadata uses Express trusted req.ip and ignores raw X-Forwarded-For', () => {
  const req = {
    ip: '203.0.113.10',
    socket: { remoteAddress: '10.0.0.5' },
    headers: { 'x-forwarded-for': '1.1.1.1', 'user-agent': 'test-agent' }
  };
  const meta = requestMeta(req);
  assert.equal(meta.ipAddress, '203.0.113.10');
  assert.equal(meta.userAgent, 'test-agent');
});
