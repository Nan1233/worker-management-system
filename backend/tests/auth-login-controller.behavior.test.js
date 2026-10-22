'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-only-secret';

const controllerPath = require.resolve('../controllers/authController');
const state = {
  calls: [],
  users: [],
  revokedTokens: new Set(),
  families: new Map(),
  familyTokens: new Map(),
  nextToken: 0,
  passwordValid: true,
  failRevoke: false,
  failCreate: false,
};

const worker = {
  id: 11, username: 'worker-11', worker_id: 101, worker_code: 'W011',
  full_name: 'Test Worker', role: 'worker', status: 'active',
  worker_status: 'active', password: 'unused',
};
const manager = {
  id: 21, username: 'manager-21', worker_id: null, worker_code: 'M021',
  full_name: 'Test Manager', role: 'manager', status: 'active',
  worker_status: null, password: 'hashed-password',
};

function resetState() {
  state.calls = [];
  state.users = [worker, manager];
  state.revokedTokens = new Set();
  state.families = new Map();
  state.familyTokens = new Map();
  state.nextToken = 0;
  state.passwordValid = true;
  state.failRevoke = false;
  state.failCreate = false;
}

function seedToken(token, familyId = token) {
  state.families.set(token, familyId);
  if (!state.familyTokens.has(familyId)) state.familyTokens.set(familyId, new Set());
  state.familyTokens.get(familyId).add(token);
}

function makeRequest({
  body = {},
  userAgent = 'Electron/40.0',
  origin = 'null',
  cookie = '',
  user = null,
} = {}) {
  return {
    body,
    headers: { 'user-agent': userAgent, origin, cookie },
    ip: '127.0.0.1',
    user,
  };
}

function makeResponse() {
  return {
    statusCode: 200,
    body: null,
    cookies: [],
    clearedCookies: [],
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    cookie(name, value, options) { this.cookies.push({ name, value, options }); return this; },
    clearCookie(name, options) { this.clearedCookies.push({ name, options }); return this; },
  };
}

const mocks = {
  bcrypt: {
    compare: async () => state.passwordValid,
    hash: async () => 'hashed-new-password',
  },
  jwt: { sign: () => 'ACCESS_TOKEN_TEST_ONLY' },
  userModel: {
    findExactByUsername(username, callback) {
      callback(null, state.users.filter((user) => user.username === username));
    },
    findAllByWorkerCode(code, callback) {
      callback(null, state.users.filter((user) => user.worker_code === code));
    },
  },
  refreshSessionService: {
    async revokeFamilyByRefreshToken(token) {
      state.calls.push({ op: 'revoke', token });
      if (state.failRevoke) throw new Error('synthetic database failure with private details');
      const familyId = state.families.get(token);
      if (!familyId) return { found: false, familyId: null };
      for (const familyToken of state.familyTokens.get(familyId) || []) {
        state.revokedTokens.add(familyToken);
      }
      return { found: true, familyId };
    },
    async createFamilyRoot(data) {
      state.calls.push({ op: 'create', userId: data.user_id });
      if (state.failCreate) throw new Error('synthetic database failure');
      const refreshToken = 'refresh-token-' + (++state.nextToken);
      const familyId = 'family-' + state.nextToken;
      seedToken(refreshToken, familyId);
      return {
        sessionId: state.nextToken,
        familyId,
        refreshToken,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      };
    },
    async rotateRefreshToken({ refreshToken }) {
      state.calls.push({ op: 'rotate', token: refreshToken });
      if (state.revokedTokens.has(refreshToken)) {
        const error = new Error('revoked');
        error.code = 'REFRESH_TOKEN_REVOKED';
        throw error;
      }
      const familyId = state.families.get(refreshToken);
      if (!familyId) {
        const error = new Error('invalid');
        error.code = 'REFRESH_TOKEN_INVALID';
        throw error;
      }
      const successor = refreshToken + '-successor';
      seedToken(successor, familyId);
      return {
        refreshToken: successor,
        familyId,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        user: {
          user_id: worker.id, username: worker.username, full_name: worker.full_name,
          role: worker.role, status: worker.status, worker_id: worker.worker_id,
          worker_code: worker.worker_code, worker_status: worker.worker_status,
        },
      };
    },
    async revokeAllUserFamilies() { return { affectedRows: 1 }; },
  },
  auditService: { logActivity: async () => undefined },
  authUserCache: { setCachedAuthUser: () => undefined },
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent && path.resolve(parent.filename) === controllerPath) {
    if (request === 'bcrypt') return mocks.bcrypt;
    if (request === 'jsonwebtoken') return mocks.jwt;
    if (request === '../models/userModel') return mocks.userModel;
    if (request === '../services/refreshSessionService') return mocks.refreshSessionService;
    if (request === '../services/auditService') return mocks.auditService;
    if (request === '../utils/authUserCache') return mocks.authUserCache;
  }
  return originalLoad.call(this, request, parent, isMain);
};

delete require.cache[controllerPath];
const controller = require(controllerPath);
Module._load = originalLoad;

test('Electron account switch revokes A before creating B and A cannot refresh afterwards', async () => {
  resetState();
  const firstResponse = makeResponse();
  await controller.login(makeRequest({ body: { username: 'W011', access_type: 'worker' } }), firstResponse);
  assert.equal(firstResponse.statusCode, 200);
  const tokenA = firstResponse.body.refreshToken;
  assert.ok(tokenA);

  state.calls = [];
  const secondResponse = makeResponse();
  await controller.login(makeRequest({
    body: { username: 'W011', access_type: 'worker', previous_refresh_token: tokenA },
  }), secondResponse);

  assert.equal(secondResponse.statusCode, 200);
  const tokenB = secondResponse.body.refreshToken;
  assert.ok(tokenB);
  assert.notEqual(tokenA, tokenB);
  assert.deepEqual(state.calls.map((call) => call.op), ['revoke', 'create']);
  assert.ok(state.revokedTokens.has(tokenA));

  const refreshResponse = makeResponse();
  await controller.refresh(makeRequest({ body: { refreshToken: tokenA } }), refreshResponse);
  assert.equal(refreshResponse.statusCode, 401);
  assert.equal(refreshResponse.body.code, 'REFRESH_TOKEN_REVOKED');
});

test('HTTP(S) browser ignores previous_refresh_token body, uses cookie, and never returns refresh token in JSON', async () => {
  resetState();
  seedToken('cookie-token-A', 'family-cookie-A');
  seedToken('body-token-B', 'family-body-B');
  const response = makeResponse();

  await controller.login(makeRequest({
    body: {
      username: 'W011',
      access_type: 'worker',
      previous_refresh_token: 'body-token-B',
    },
    userAgent: 'Mozilla/5.0',
    origin: 'https://app.example.test',
    cookie: 'ktc_refresh_token=cookie-token-A',
  }), response);

  assert.equal(response.statusCode, 200);
  assert.ok(state.revokedTokens.has('cookie-token-A'));
  assert.ok(!state.revokedTokens.has('body-token-B'));
  assert.equal(Object.hasOwn(response.body, 'refreshToken'), false);
  assert.ok(response.cookies.some((cookie) => cookie.name === 'ktc_refresh_token'));
});

test('body token is ignored unless both Electron user-agent and opaque/file origin match', async (t) => {
  for (const headers of [
    { userAgent: 'Mozilla/5.0', origin: 'null' },
    { userAgent: 'Electron/40.0', origin: 'https://app.example.test' },
  ]) {
    await t.test(headers.userAgent + ' / ' + headers.origin, async () => {
      resetState();
      const response = makeResponse();
      await controller.login(makeRequest({
        body: { username: 'W011', access_type: 'worker', previous_refresh_token: 'must-not-be-used' },
        ...headers,
      }), response);
      assert.equal(response.statusCode, 200);
      assert.equal(state.calls.some((call) => call.op === 'revoke'), false);
      assert.equal(Object.hasOwn(response.body, 'refreshToken'), false);
    });
  }
});

test('revocation infrastructure failure returns generic 503 and never creates a new family or logs raw error', async () => {
  resetState();
  state.failRevoke = true;
  const originalError = console.error;
  const captured = [];
  console.error = (...args) => captured.push(args.map(String).join(' '));
  try {
    const response = makeResponse();
    await controller.login(makeRequest({
      body: { username: 'W011', access_type: 'worker', previous_refresh_token: 'sensitive-refresh-token' },
    }), response);
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.code, 'AUTH_PREVIOUS_SESSION_REVOCATION_FAILED');
    assert.equal(state.calls.some((call) => call.op === 'create'), false);
    assert.ok(!JSON.stringify(response.body).includes('sensitive-refresh-token'));
    assert.ok(!captured.join('\n').includes('sensitive-refresh-token'));
    assert.ok(!captured.join('\n').includes('synthetic database failure'));
    assert.deepEqual(captured, ['AUTH_PREVIOUS_SESSION_REVOCATION_FAILED']);
  } finally {
    console.error = originalError;
  }
});

test('unknown previous token follows found:false no-op and permits new login', async () => {
  resetState();
  const response = makeResponse();
  await controller.login(makeRequest({
    body: { username: 'W011', access_type: 'worker', previous_refresh_token: 'unknown-token' },
  }), response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(state.calls.map((call) => call.op), ['revoke', 'create']);
  assert.equal(state.revokedTokens.size, 0);
});

test('wrong manager password does not revoke the previous family or create a session', async () => {
  resetState();
  seedToken('manager-old-token', 'manager-old-family');
  state.passwordValid = false;
  const response = makeResponse();
  await controller.login(makeRequest({
    body: {
      username: 'manager-21',
      access_type: 'management',
      password: 'wrong-password',
      previous_refresh_token: 'manager-old-token',
    },
  }), response);
  assert.equal(response.statusCode, 401);
  assert.equal(state.calls.length, 0);
  assert.equal(state.revokedTokens.size, 0);
});

test('management login preserves password gate and browser refresh-token response boundary', async () => {
  resetState();
  const response = makeResponse();
  await controller.login(makeRequest({
    body: { username: 'manager-21', access_type: 'management', password: 'correct-password' },
    userAgent: 'Mozilla/5.0',
    origin: 'https://app.example.test',
  }), response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.user.role, 'manager');
  assert.equal(Object.hasOwn(response.body, 'refreshToken'), false);
  assert.equal(state.calls.some((call) => call.op === 'create'), true);
});

test('browser refresh rotation keeps refresh token in HttpOnly cookie rather than JSON', async () => {
  resetState();
  seedToken('browser-current-token', 'browser-family');
  const response = makeResponse();
  await controller.refresh(makeRequest({
    body: {},
    userAgent: 'Mozilla/5.0',
    origin: 'https://app.example.test',
    cookie: 'ktc_refresh_token=browser-current-token',
  }), response);
  assert.equal(response.statusCode, 200);
  assert.equal(Object.hasOwn(response.body, 'refreshToken'), false);
  assert.ok(response.cookies.some((cookie) => cookie.name === 'ktc_refresh_token' && cookie.options.httpOnly === true));
});

test('Electron hosted on HTTPS uses the HttpOnly cookie and does not require a body refresh token', async () => {
  resetState();
  seedToken('hosted-electron-current-token', 'hosted-electron-family');
  const response = makeResponse();
  await controller.refresh(makeRequest({
    body: {},
    userAgent: 'Electron/40.0',
    origin: 'https://ktc-fe-test.nan978971.workers.dev',
    cookie: 'ktc_refresh_token=hosted-electron-current-token',
  }), response);
  assert.equal(response.statusCode, 200);
  assert.equal(Object.hasOwn(response.body, 'refreshToken'), false);
  assert.ok(response.cookies.some((cookie) => cookie.name === 'ktc_refresh_token' && cookie.options.httpOnly === true));
});

test('Electron refresh rotation returns the successor token for native persistence', async () => {
  resetState();
  seedToken('electron-current-token', 'electron-family');
  const response = makeResponse();
  await controller.refresh(makeRequest({
    body: { refreshToken: 'electron-current-token' },
    userAgent: 'Electron/40.0',
    origin: 'null',
  }), response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.refreshToken, 'electron-current-token-successor');
});

test('logout revokes the supplied family and clears the HttpOnly cookie', async () => {
  resetState();
  seedToken('logout-token', 'logout-family');
  const response = makeResponse();
  await controller.logout(makeRequest({
    body: { refreshToken: 'logout-token' },
    userAgent: 'Electron/40.0',
    origin: 'null',
  }), response);
  assert.equal(response.statusCode, 200);
  assert.ok(state.revokedTokens.has('logout-token'));
  assert.ok(response.clearedCookies.some((cookie) => cookie.name === 'ktc_refresh_token'));
});
