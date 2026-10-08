'use strict';

// Result accounting shared by every layer.
//
// Used two ways:
//   * as a node:test reporter  (node --test --test-reporter=test/e2e/lib/reporter.cjs)
//   * as a library             (summaries, artifacts, secret masking, final table)
//
// PASS, FAIL and SKIP are kept apart everywhere. A SKIP must carry a reason; a
// reasonless skip is reported as FAIL so nothing can quietly drop out.

const fs = require('node:fs');
const path = require('node:path');
const config = require('./config.cjs');

const SECRET_KEY = /pass(word)?|secret|token|authori[sz]ation|cookie|api[-_]?key|credential|private/i;
const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g;
const BEARER = /(Bearer\s+)[^\s"']+/gi;

function maskString(value) {
  let out = String(value).replace(JWT, '***JWT***').replace(BEARER, '$1***');
  const password = process.env.DB_PASSWORD;
  if (password && password.length >= 4) out = out.split(password).join('***');
  const managerPassword = process.env.E2E_MANAGER_PASSWORD;
  if (managerPassword && managerPassword.length >= 4) out = out.split(managerPassword).join('***');
  return out;
}

/** Deep copy with every secret-looking key and token-looking value masked. */
function mask(value, depth = 0) {
  if (depth > 12) return '[depth]';
  if (value == null) return value;
  if (typeof value === 'string') return maskString(value);
  if (Buffer.isBuffer(value)) return `[buffer ${value.length} bytes]`;
  if (Array.isArray(value)) return value.map((item) => mask(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SECRET_KEY.test(key) && item != null && item !== '' ? '***' : mask(item, depth + 1);
    }
    return out;
  }
  return value;
}

const safeName = (name) => String(name).replace(/[^\w.-]+/g, '_').slice(0, 120);

/** Write a masked JSON / text artifact under test-results/e2e-results/<layer>/. */
function writeArtifact(layer, name, data) {
  const file = path.join(config.layerDir(layer), safeName(name));
  const body = typeof data === 'string' ? maskString(data) : JSON.stringify(mask(data), null, 2);
  fs.writeFileSync(file, body);
  return file;
}

function summaryFile(layer) {
  return path.join(config.ARTIFACT_ROOT, `summary-${layer}.json`);
}

function emptyCounts() {
  return { PASS: 0, FAIL: 0, SKIP: 0 };
}

function count(results) {
  const counts = emptyCounts();
  for (const item of results) counts[item.status] += 1;
  return counts;
}

function writeSummary(layer, results, extra = {}) {
  fs.mkdirSync(config.ARTIFACT_ROOT, { recursive: true });
  const meta = config.LAYERS[layer] || { category: layer.toUpperCase() };
  const summary = { layer, category: meta.category, finishedAt: new Date().toISOString(), counts: count(results), results: mask(results), ...extra };
  fs.writeFileSync(summaryFile(layer), JSON.stringify(summary, null, 2));
  return summary;
}

function readSummary(layer) {
  try { return JSON.parse(fs.readFileSync(summaryFile(layer), 'utf8')); } catch { return null; }
}

function clearSummary(layer) {
  fs.rmSync(summaryFile(layer), { force: true });
}

function formatResult(item) {
  const lines = [`[${item.status}] ${item.layer ? `${item.layer.toUpperCase()} ` : ''}${item.name}`];
  if (item.status === 'SKIP') lines.push(`  Reason: ${item.reason}`);
  if (item.status === 'FAIL' && item.error) lines.push(...String(item.error).split('\n').slice(0, 12).map((line) => `  ${line}`));
  return lines.join('\n');
}

function formatCounts(counts) {
  return `PASS: ${counts.PASS}\nFAIL: ${counts.FAIL}\nSKIP: ${counts.SKIP}`;
}

function errorText(error) {
  if (!error) return '';
  const cause = error.cause || error;
  const message = cause?.message || String(cause);
  const where = String(cause?.stack || '').split('\n').find((line) => /test[\\/]e2e/.test(line)) || '';
  return maskString(`${message}${where ? `\n${where.trim()}` : ''}`);
}

/** node:test custom reporter. Layer comes from E2E_LAYER (set by test/e2e/full.cjs). */
async function* nodeTestReporter(source) {
  const layer = process.env.E2E_LAYER || 'adhoc';
  const results = [];
  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    const data = event.data || {};
    if (data.details?.type === 'suite') continue;
    const file = data.file ? path.relative(config.ROOT, data.file) : '';
    const name = data.name && file && data.name !== data.file ? `${path.basename(file)} › ${data.name}` : (data.name || file);
    let item;
    if (event.type === 'test:fail') {
      item = { layer, name, status: 'FAIL', file, error: errorText(data.details?.error) };
    } else if (data.skip !== undefined && data.skip !== false) {
      const reason = typeof data.skip === 'string' ? data.skip.trim() : '';
      item = reason
        ? { layer, name, status: 'SKIP', file, reason }
        : { layer, name, status: 'FAIL', file, error: 'SKIP without a reason is not allowed' };
    } else if (data.todo !== undefined && data.todo !== false) {
      item = { layer, name, status: 'SKIP', file, reason: `TODO: ${typeof data.todo === 'string' ? data.todo : 'not implemented'}` };
    } else {
      item = { layer, name, status: 'PASS', file };
    }
    results.push(item);
    yield `${formatResult(item)}\n`;
  }
  const summary = writeSummary(layer, results);
  yield `\n${config.LAYERS[layer]?.title || layer}\n${formatCounts(summary.counts)}\n`;
}

module.exports = nodeTestReporter;
Object.assign(module.exports, {
  mask,
  maskString,
  writeArtifact,
  writeSummary,
  readSummary,
  clearSummary,
  summaryFile,
  count,
  emptyCounts,
  formatResult,
  formatCounts
});
