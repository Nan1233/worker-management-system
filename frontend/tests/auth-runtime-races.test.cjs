const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const userA = { id: 101, username: 'account-A', full_name: 'Account A', role: 'manager', worker_id: null, worker_code: null };
const userB = { id: 202, username: 'account-B', full_name: 'Account B', role: 'admin', worker_id: null, worker_code: null };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

class MemoryStorage {
  constructor(initial = {}) { this.values = new Map(Object.entries(initial).map(([k, v]) => [k, String(v)])); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index) { return [...this.values.keys()][index] ?? null; }
  get length() { return this.values.size; }
}

function makeHarness() {
  const originalGlobals = {};
  for (const key of ['localStorage', 'sessionStorage', 'window', 'navigator', 'CustomEvent']) {
    originalGlobals[key] = Object.getOwnPropertyDescriptor(globalThis, key);
  }

  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  localStorage.setItem('ktcAuthEpoch', '1');
  const eventHandlers = new Map();
  const windowMock = {
    location: {
      hash: '#/manager',
      origin: 'https://ktc.example.test',
      pathname: '/',
      replaced: null,
      replace(value) { this.replaced = value; }
    },
    addEventListener(type, fn) {
      if (!eventHandlers.has(type)) eventHandlers.set(type, []);
      eventHandlers.get(type).push(fn);
    },
    dispatchEvent(event) {
      for (const fn of eventHandlers.get(event.type) || []) fn(event);
      return true;
    },
    setTimeout() { return 1; },
    clearTimeout() {}
  };
  class FakeCustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorage });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: sessionStorage });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Mozilla/5.0' } });
  Object.defineProperty(globalThis, 'CustomEvent', { configurable: true, value: FakeCustomEvent });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: windowMock });

  class FakeAxiosHeaders {
    constructor(values = {}) {
      this.values = new Map();
      for (const [key, value] of Object.entries(values || {})) this.set(key, value);
    }
    set(key, value) { this.values.set(String(key).toLowerCase(), value); }
    get(key) { return this.values.get(String(key).toLowerCase()); }
    delete(key) { return this.values.delete(String(key).toLowerCase()); }
    static from(value) { return value instanceof FakeAxiosHeaders ? value : new FakeAxiosHeaders(value || {}); }
  }

  const requestHandlers = [];
  const responseHandlers = [];
  const axiosPostQueue = [];
  const apiPostQueue = [];
  const axiosCalls = [];
  const apiCalls = [];
  const mockApi = {
    interceptors: {
      request: { use(fulfilled, rejected) { requestHandlers.push({ fulfilled, rejected }); } },
      response: { use(fulfilled, rejected) { responseHandlers.push({ fulfilled, rejected }); } }
    },
    request(config) { return Promise.reject(new Error('Unexpected api.request in this test harness: ' + (config?.url || 'unknown'))); },
    post(...args) {
      apiCalls.push(args);
      const next = apiPostQueue.shift();
      return next ? next.promise : Promise.resolve({ data: {} });
    }
  };
  class FakeCanceledError extends Error {
    constructor(message) {
      super(message);
      this.name = 'CanceledError';
      this.code = 'ERR_CANCELED';
      this.__CANCEL__ = true;
    }
  }
  const axiosMock = {
    __esModule: true,
    create() { return mockApi; },
    post(...args) {
      axiosCalls.push(args);
      const next = axiosPostQueue.shift();
      return next ? next.promise : Promise.reject(new Error('No deferred axios.post response configured'));
    },
    CanceledError: FakeCanceledError,
    isCancel(error) { return Boolean(error && error.__CANCEL__); },
    isAxiosError(error) { return Boolean(error && error.isAxiosError); },
    AxiosHeaders: FakeAxiosHeaders
  };
  axiosMock.default = axiosMock;

  let generatedSessionId = 0;
  const authStorage = {
    getAuthEpoch() {
      const parsed = Number(localStorage.getItem('ktcAuthEpoch'));
      return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
    },
    bumpAuthEpoch() {
      const next = (Number(localStorage.getItem('ktcAuthEpoch')) || 0) + 1;
      localStorage.setItem('ktcAuthEpoch', String(next));
      return next;
    },
    getAuthSessionId() { return localStorage.getItem('ktcAuthSessionId') || sessionStorage.getItem('ktcAuthSessionId'); },
    getAccessToken() { return localStorage.getItem('accessToken') || localStorage.getItem('token') || sessionStorage.getItem('accessToken') || sessionStorage.getItem('token'); },
    setAccessToken(token) {
      localStorage.setItem('accessToken', token);
      localStorage.setItem('token', token);
      sessionStorage.removeItem('accessToken');
      sessionStorage.removeItem('token');
    },
    getStoredUser() {
      const raw = localStorage.getItem('user') || sessionStorage.getItem('user');
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    },
    setStoredUser(user) { localStorage.setItem('user', JSON.stringify(user)); sessionStorage.removeItem('user'); },
    getRefreshToken() { return null; },
    setRefreshToken(token) { localStorage.setItem('refreshToken', token); },
    hasRefreshSessionHint() { return localStorage.getItem('ktcRefreshSessionHint') === '1'; },
    markRefreshSessionAvailable() { localStorage.setItem('ktcRefreshSessionHint', '1'); },
    clearRefreshSessionHint() { localStorage.removeItem('ktcRefreshSessionHint'); },
    isElectronRuntime() { return false; },
    supportsElectronRefreshTokenBody() { return false; },
    clearLegacyRefreshToken() { localStorage.removeItem('refreshToken'); sessionStorage.removeItem('refreshToken'); },
    clearPreviousRefreshTokenForLogin() {},
    preservePreviousRefreshTokenForLogin() {},
    getPreviousRefreshTokenForLogin() { return null; },
    createAuthSessionId() { generatedSessionId += 1; return 'generated-session-' + generatedSessionId; },
    saveAuthSession(data) {
      authStorage.setAccessToken(data.accessToken);
      if (data.sessionId) localStorage.setItem('ktcAuthSessionId', data.sessionId);
      if (data.refreshToken) authStorage.setRefreshToken(data.refreshToken);
      if (data.user) authStorage.setStoredUser(data.user);
      authStorage.markRefreshSessionAvailable();
    },
    clearCurrentTabAuthSession() {
      for (const key of ['auth', 'authUser', 'currentUser', 'accessToken', 'token', 'user', 'ktcAuthSessionId', 'refreshToken']) {
        sessionStorage.removeItem(key);
      }
      windowMock.dispatchEvent(new FakeCustomEvent('ktc:tab-auth-cleared'));
    },
    clearAuthSession(options = {}) {
      if (options.bumpEpoch !== false) authStorage.bumpAuthEpoch();
      for (const key of ['auth', 'authUser', 'currentUser', 'accessToken', 'token', 'refreshToken', 'user', 'ktcAuthSessionId', 'ktcRefreshSessionHint']) {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      }
    }
  };

  function loadTs(relativePath, virtualFilename, mocks) {
    const diskPath = path.join(root, relativePath);
    let source = fs.readFileSync(diskPath, 'utf8');
    if (relativePath === 'src/services/api.ts') {
      source = source.replace('String(import.meta.env.VITE_BUILD_VERSION || "1.8.22")', 'String("runtime-test")');
    }
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText;
    const filename = path.join(root, virtualFilename);
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    const originalLoad = Module._load;
    try {
      Module._load = function(request, parent, isMain) {
        if (parent && parent.filename === filename && Object.prototype.hasOwnProperty.call(mocks, request)) {
          return mocks[request];
        }
        return originalLoad.call(this, request, parent, isMain);
      };
      loaded._compile(compiled, filename);
      return loaded.exports;
    } finally {
      Module._load = originalLoad;
    }
  }

  const apiModule = loadTs('src/services/api.ts', 'src/services/__auth-runtime-api.cjs', {
    axios: axiosMock,
    '../config/env': { API_BASE_URL: 'https://ktc.example.test/api', REQUEST_TIMEOUT_MS: 30000 },
    '../utils/transientRequestPolicy': {
      isRetryableTransientFailure() { return false; },
      transientRetryDelayMs() { return 0; },
      waitForTransientRetry() { return Promise.resolve(); }
    },
    './requestRecoveryEvents': { emitRequestRetry() {} },
    './authRuntimeEvents': {
      AUTH_EPOCH_CHANGED_EVENT: 'ktc:auth-epoch-changed',
      CONNECTION_LOST_EVENT: 'ktc:connection-lost',
      CONNECTION_RESTORED_EVENT: 'ktc:connection-restored'
    },
    '../utils/authStorage': authStorage,
    './authRefreshCoordinator': {
      coordinateBrowserRefresh(operation) { return operation(); }
    }
  });

  function installSession(user, token, sessionId) {
    authStorage.setAccessToken(token);
    authStorage.setStoredUser(user);
    localStorage.setItem('ktcAuthSessionId', sessionId);
    authStorage.markRefreshSessionAvailable();
  }

  function switchSessionInSameRenderer(user, token, sessionId) {
    apiModule.beginLoginTransition();
    authStorage.clearAuthSession({ bumpEpoch: false });
    installSession(user, token, sessionId);
    apiModule.finishLoginTransition();
  }

  function queueAxiosPost() {
    const item = deferred();
    axiosPostQueue.push(item);
    return item;
  }
  function queueApiPost() {
    const item = deferred();
    apiPostQueue.push(item);
    return item;
  }

  return {
    localStorage, sessionStorage, windowMock, authStorage, axiosCalls, apiCalls,
    apiModule, mockApi, requestHandlers, responseHandlers,
    installSession, switchSessionInSameRenderer, queueAxiosPost, queueApiPost,
    loadRealAuthStorage(tag) {
      return loadTs('src/utils/authStorage.ts', 'src/utils/__auth-runtime-storage-' + tag + '.cjs', {
        '../services/sessionCache': { clearSessionCache() {}, setSessionCacheScope() {} }
      });
    },
    loadAuthService() {
      return loadTs('src/services/authService.ts', 'src/services/__auth-runtime-service.cjs', {
        axios: axiosMock,
        './api': apiModule,
        '../config/env': { API_BASE_URL: 'https://ktc.example.test/api', REQUEST_TIMEOUT_MS: 30000 },
        '../utils/authStorage': authStorage
      });
    },
    dispose() {
      for (const key of Object.keys(originalGlobals)) {
        if (originalGlobals[key]) Object.defineProperty(globalThis, key, originalGlobals[key]);
        else delete globalThis[key];
      }
    }
  };
}

function isCanceled(error) {
  return Boolean(error && (error.code === 'ERR_CANCELED' || error.__CANCEL__));
}

test('runtime: late A refresh 401 after B login leaves B token, user and session intact', async () => {
  const h = makeHarness();
  try {
    h.installSession(userA, 'A-access', 'session-A');
    const refreshRequest = h.queueAxiosPost();
    const refreshPromise = h.apiModule.refreshAccessToken(true);
    assert.equal(h.axiosCalls.length, 1);
    h.switchSessionInSameRenderer(userB, 'B-access', 'session-B');
    refreshRequest.reject({ isAxiosError: true, response: { status: 401, data: { code: 'REFRESH_TOKEN_INVALID' } } });
    await assert.rejects(refreshPromise, isCanceled);
    assert.equal(h.authStorage.getAccessToken(), 'B-access');
    assert.equal(h.authStorage.getStoredUser().id, userB.id);
    assert.equal(h.authStorage.getAuthSessionId(), 'session-B');
    assert.equal(h.localStorage.getItem('ktcAuthEpoch'), '2');
    assert.equal(h.windowMock.location.replaced, null);
  } finally { h.dispose(); }
});

test('runtime: stale refresh cleanup does not detach the newer refresh promise', async () => {
  const h = makeHarness();
  try {
    h.installSession(userA, 'A-access', 'session-A');
    const oldRequest = h.queueAxiosPost();
    const oldRefresh = h.apiModule.refreshAccessToken(true);
    h.switchSessionInSameRenderer(userB, 'B-access', 'session-B');
    const newRequest = h.queueAxiosPost();
    const newRefresh = h.apiModule.refreshAccessToken(true);
    assert.equal(h.axiosCalls.length, 2);
    oldRequest.reject(new Error('old network failure'));
    await assert.rejects(oldRefresh, isCanceled);
    assert.equal(h.apiModule.isAuthRefreshInProgress(), true);
    newRequest.resolve({ data: { accessToken: 'B-refreshed', user: userB } });
    assert.equal(await newRefresh, 'B-refreshed');
    assert.equal(h.apiModule.isAuthRefreshInProgress(), false);
    assert.equal(h.authStorage.getAccessToken(), 'B-refreshed');
    assert.equal(h.authStorage.getStoredUser().id, userB.id);
    assert.equal(h.authStorage.getAuthSessionId(), 'session-B');
  } finally { h.dispose(); }
});

test('runtime: A to B to A does not allow the first A refresh to overwrite the later A session', async () => {
  const h = makeHarness();
  try {
    h.installSession(userA, 'A-access', 'session-A-old');
    const oldRequest = h.queueAxiosPost();
    const oldRefresh = h.apiModule.refreshAccessToken(true);
    h.switchSessionInSameRenderer(userB, 'B-access', 'session-B');
    h.switchSessionInSameRenderer(userA, 'A-new-access', 'session-A-new');
    oldRequest.resolve({ data: { accessToken: 'A-stale-refresh', user: userA } });
    await assert.rejects(oldRefresh, isCanceled);
    assert.equal(h.authStorage.getAccessToken(), 'A-new-access');
    assert.equal(h.authStorage.getStoredUser().id, userA.id);
    assert.equal(h.authStorage.getAuthSessionId(), 'session-A-new');
  } finally { h.dispose(); }
});

test('runtime: cross-tab epoch change rejects an old successful response before storage event arrives', async () => {
  const h = makeHarness();
  try {
    h.installSession(userA, 'A-access', 'session-A');
    const request = await h.requestHandlers[0].fulfilled({ url: '/reports', method: 'get', headers: { Authorization: 'Bearer A-stale' } });
    assert.equal(request.headers.get('Authorization'), 'Bearer A-access');
    h.localStorage.setItem('ktcAuthEpoch', '2');
    h.authStorage.setAccessToken('B-access');
    h.authStorage.setStoredUser(userB);
    h.localStorage.setItem('ktcAuthSessionId', 'session-B');

    await assert.rejects(
      Promise.resolve(h.responseHandlers[0].fulfilled({ config: request, data: { userId: userA.id } })),
      isCanceled
    );
    assert.equal(h.authStorage.getAccessToken(), 'B-access');
    assert.equal(h.authStorage.getStoredUser().id, userB.id);
    assert.equal(h.authStorage.getAuthSessionId(), 'session-B');
  } finally { h.dispose(); }
});

test('runtime: stale 401 after cross-tab epoch change is canceled instead of refreshing with B cookie', async () => {
  const h = makeHarness();
  try {
    h.installSession(userA, 'A-access', 'session-A');
    const request = await h.requestHandlers[0].fulfilled({ url: '/reports', method: 'get', headers: {} });
    h.localStorage.setItem('ktcAuthEpoch', '2');
    h.authStorage.setAccessToken('B-access');
    h.authStorage.setStoredUser(userB);
    h.localStorage.setItem('ktcAuthSessionId', 'session-B');
    const error = new Error('old account unauthorized');
    error.config = request;
    error.response = { status: 401, data: {}, headers: {} };

    await assert.rejects(h.responseHandlers[0].rejected(error), isCanceled);
    assert.equal(h.axiosCalls.length, 0, 'stale 401 must not start refresh using the current cookie');
    assert.equal(h.authStorage.getAccessToken(), 'B-access');
    assert.equal(h.authStorage.getStoredUser().id, userB.id);
    assert.equal(h.authStorage.getAuthSessionId(), 'session-B');
  } finally { h.dispose(); }
});

test('runtime: request checks the shared epoch before a delayed storage event and preserves B session', async () => {
  const h = makeHarness();
  try {
    h.installSession(userA, 'A-access', 'session-A');
    h.localStorage.setItem('ktcAuthEpoch', '2');
    h.authStorage.setAccessToken('B-access');
    h.authStorage.setStoredUser(userB);
    h.localStorage.setItem('ktcAuthSessionId', 'session-B');

    await assert.rejects(
      h.requestHandlers[0].fulfilled({ url: '/reports', method: 'get', headers: { Authorization: 'Bearer A-stale' } }),
      isCanceled
    );
    assert.equal(h.authStorage.getAccessToken(), 'B-access');
    assert.equal(h.authStorage.getStoredUser().id, userB.id);
    assert.equal(h.authStorage.getAuthSessionId(), 'session-B');
  } finally { h.dispose(); }
});

test('runtime: delayed logout A completion cannot clear account B session', async () => {
  const h = makeHarness();
  try {
    h.installSession(userA, 'A-access', 'session-A');
    const authService = h.loadAuthService();
    const logoutRequest = h.queueApiPost();
    const logoutPromise = authService.logout();
    assert.equal(h.apiCalls.length, 1);
    h.switchSessionInSameRenderer(userB, 'B-access', 'session-B');
    logoutRequest.resolve({ data: { success: true } });
    await logoutPromise;
    assert.equal(h.authStorage.getAccessToken(), 'B-access');
    assert.equal(h.authStorage.getStoredUser().id, userB.id);
    assert.equal(h.authStorage.getAuthSessionId(), 'session-B');
  } finally { h.dispose(); }
});

test('runtime: failed B login follows current contract and leaves no partial identity', async () => {
  const h = makeHarness();
  try {
    h.installSession(userA, 'A-access', 'session-A');
    const authService = h.loadAuthService();
    const loginRequest = h.queueAxiosPost();
    const loginPromise = authService.login('account-B', 'management', 'not-a-real-password');
    assert.equal(h.axiosCalls.length, 1);
    loginRequest.reject(new Error('invalid credentials'));
    await assert.rejects(loginPromise, /invalid credentials/);
    assert.equal(h.authStorage.getAccessToken(), null);
    assert.equal(h.authStorage.getStoredUser(), null);
    assert.equal(h.authStorage.getAuthSessionId(), null);
    assert.equal(h.authStorage.getAuthEpoch(), 2);
    assert.equal(h.apiModule.isLoginTransitionActive(), false);
  } finally { h.dispose(); }
});


test('runtime: persisted web identity and session restore after auth module reload', () => {
  const h = makeHarness();
  try {
    const firstInstance = h.loadRealAuthStorage('before-reload');
    firstInstance.saveAuthSession({ accessToken: 'persisted-B-access', sessionId: 'session-B-reload', user: userB });
    const reloadedInstance = h.loadRealAuthStorage('after-reload');

    assert.equal(reloadedInstance.getAccessToken(), 'persisted-B-access');
    assert.equal(reloadedInstance.getStoredUser().id, userB.id);
    assert.equal(reloadedInstance.getAuthSessionId(), 'session-B-reload');
    assert.equal(reloadedInstance.hasRefreshSessionHint(), true);
  } finally { h.dispose(); }
});


test('runtime: concurrent refresh calls in one session share one network rotation', async () => {
  const h = makeHarness();
  try {
    h.installSession(userA, 'A-access', 'session-A');
    const networkRefresh = h.queueAxiosPost();
    const first = h.apiModule.refreshAccessToken(true);
    const second = h.apiModule.refreshAccessToken(true);
    assert.equal(h.axiosCalls.length, 1, 'same-session refreshes must share the in-flight network request');

    networkRefresh.resolve({ data: { accessToken: 'A-refreshed', user: userA } });
    const tokens = await Promise.all([first, second]);
    assert.deepEqual(tokens, ['A-refreshed', 'A-refreshed']);
    assert.equal(h.authStorage.getAccessToken(), 'A-refreshed');
    assert.equal(h.authStorage.getStoredUser().id, userA.id);
    assert.equal(h.authStorage.getAuthSessionId(), 'session-A');
    assert.equal(h.apiModule.isAuthRefreshInProgress(), false);
  } finally { h.dispose(); }
});
