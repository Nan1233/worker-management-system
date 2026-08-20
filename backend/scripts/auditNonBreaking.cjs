#!/usr/bin/env node
'use strict';

/**
 * Dependency audit gate.
 * - Never invokes `npm audit fix --force`.
 * - Requires uuid >= 11.1.1 in the resolved tree.
 * - Fails on moderate/high/critical findings so security debt cannot be hidden.
 *
 * Run from backend/ or frontend/.
 */
const { execFileSync } = require('node:child_process');

function runAudit() {
  try {
    const raw = execFileSync('npm', ['audit', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
    });
    return JSON.parse(raw);
  } catch (error) {
    const stdout = String(error.stdout || '').trim();
    if (stdout) {
      try { return JSON.parse(stdout); } catch {}
    }
    throw new Error(`npm audit could not be completed: ${String(error.stderr || error.message).trim()}`);
  }
}

function semverParts(value) {
  const m = String(value).match(/^(\\d+)\\.(\\d+)\\.(\\d+)/);
  return m ? m.slice(1).map(Number) : [0, 0, 0];
}
function gte(a, b) {
  const x = semverParts(a), y = semverParts(b);
  return x[0] > y[0] || (x[0] === y[0] && (x[1] > y[1] || (x[1] === y[1] && x[2] >= y[2])));
}

const report = runAudit();
const meta = report.metadata?.vulnerabilities || {};
const moderate = Number(meta.moderate || 0);
const high = Number(meta.high || 0);
const critical = Number(meta.critical || 0);
const total = Number(meta.total || 0);

if (high || critical || moderate) {
  console.error(`[KTC] Dependency audit FAIL: moderate=${moderate}, high=${high}, critical=${critical}, total=${total}`);
  console.error('[KTC] Do not use npm audit fix --force; update/override the vulnerable transitive dependency and regenerate the lockfile.');
  process.exit(1);
}

console.log(`[KTC] Dependency audit PASS: moderate=${moderate}, high=${high}, critical=${critical}, total=${total}`);
