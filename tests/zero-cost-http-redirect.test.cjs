'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { Client } = require('../scripts/zero-cost/http.cjs');

test('E2E HTTP client never follows a redirect with worker bearer token or cookies', async () => {
  let requests = 0;
  let redirectedRequests = 0;
  const server = http.createServer((req, res) => {
    requests += 1;
    if (req.url === '/redirected') {
      redirectedRequests += 1;
      res.writeHead(200);
      res.end('should not be reached');
      return;
    }
    res.writeHead(307, { Location: '/redirected' });
    res.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const client = new Client('http://127.0.0.1:' + server.address().port);
    client.token = 'test-secret-token';
    client.cookies = 'session=test-secret-cookie';
    await assert.rejects(client.req('POST', '/api/test', { test: true }), /fetch failed|redirect/i);
    assert.equal(requests, 1);
    assert.equal(redirectedRequests, 0);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
