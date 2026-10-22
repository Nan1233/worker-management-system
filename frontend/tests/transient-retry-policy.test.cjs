const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Regression: api.ts used to call the policy with a flat {status} object. The policy reads
// error.response.status, so `response` was undefined and EVERY failure (422, 403, 409, 500)
// was retried twice - an approval rejected by a business rule was POSTed three times and the
// manager waited ~3 s for the message.
const load = () => {
  const file = path.join(__dirname, '..', 'src', 'utils', 'transientRequestPolicy.ts');
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', js)(mod, mod.exports);
  return mod.exports;
};
const failure = (status, extra = {}) => ({ response: status ? { status } : undefined, ...extra });

test('business and permission errors are never retried', () => {
  const { isRetryableTransientFailure } = load();
  for (const status of [400, 401, 403, 404, 409, 422, 429, 500]) {
    assert.equal(isRetryableTransientFailure(failure(status)), false, `status ${status}`);
  }
});

test('dropped connections and gateway errors are retried at most twice', () => {
  const { isRetryableTransientFailure } = load();
  assert.equal(isRetryableTransientFailure({ code: 'ERR_NETWORK' }), true);
  for (const status of [408, 502, 503, 504]) assert.equal(isRetryableTransientFailure(failure(status)), true, `status ${status}`);
  assert.equal(isRetryableTransientFailure(failure(503, { retryCount: 2 })), false);
});

test('api.ts hands the policy a response object, not a flat status field', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'api.ts'), 'utf8');
  const call = source.slice(source.indexOf('isRetryableTransientFailure({'), source.indexOf('isRetryableTransientFailure({') + 260);
  assert.match(call, /response:\s*error\.response/);
  assert.doesNotMatch(call, /\bstatus,\s*\n/);
});
