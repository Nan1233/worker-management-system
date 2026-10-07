'use strict';

// Playwright reporter that writes the same summary format as lib/reporter.cjs,
// so test/e2e/full.cjs counts web results exactly like the node:test layers.

const path = require('node:path');
const config = require('./config.cjs');
const { writeSummary, formatResult, formatCounts, maskString } = require('./reporter.cjs');

class E2EPlaywrightReporter {
  constructor() {
    this.results = [];
  }

  onTestEnd(test, result) {
    const file = path.relative(config.ROOT, test.location.file);
    const name = `${path.basename(file)} › ${test.titlePath().slice(3).join(' › ') || test.title}`;
    let item;
    if (result.status === 'skipped') {
      const reason = test.annotations.filter((a) => a.type === 'skip').map((a) => a.description).filter(Boolean).join('; ').trim();
      item = reason
        ? { layer: 'web', name, status: 'SKIP', file, reason }
        : { layer: 'web', name, status: 'FAIL', file, error: 'SKIP without a reason is not allowed' };
    } else if (result.status === 'passed') {
      item = { layer: 'web', name, status: 'PASS', file };
    } else {
      const error = result.errors?.[0]?.message || result.error?.message || result.status;
      item = { layer: 'web', name, status: 'FAIL', file, error: maskString(String(error).replace(/\u001b\[[0-9;]*m/g, '')) };
    }
    // Retries report the same test more than once; keep the final outcome only.
    this.results = this.results.filter((r) => r.name !== name);
    this.results.push(item);
    process.stdout.write(`${formatResult(item)}\n`);
  }

  onEnd() {
    const summary = writeSummary('web', this.results);
    process.stdout.write(`\n${config.LAYERS.web.title}\n${formatCounts(summary.counts)}\n`);
  }

  printsToStdio() {
    return true;
  }
}

module.exports = E2EPlaywrightReporter;
