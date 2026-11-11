'use strict';

// Local-only isolated test runner. No CI activation, DB provisioning, HTTP calls,
// or production configuration are performed by this script.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { FLOW_SUITES } = require('../tests/flowSuiteManifest.cjs');

function usage() {
  process.stdout.write([
    'KTC isolated page/flow test runner',
    '  node scripts/runFlowTests.cjs --list',
    '  node scripts/runFlowTests.cjs --flow worker-entry',
    '  node scripts/runFlowTests.cjs --all-safe',
    '',
    'Only explicitly allowlisted, mock/pure unit tests can be run.',
    ''
  ].join('\n'));
}

function printSuites() {
  for (const [name, suite] of Object.entries(FLOW_SUITES)) {
    const count = suite.tests.length;
    process.stdout.write(`${name}: ${suite.label} | ${count ? count + ' test file(s)' : 'NO ISOLATED TESTS'}\n`);
    for (const route of suite.routes) process.stdout.write(`  ${route}\n`);
  }
}

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--list') {
  usage();
  printSuites();
} else {
  const isAllSafe = args.length === 1 && args[0] === '--all-safe';
  const isSingleFlow = args.length === 2 && args[0] === '--flow';
  if (!isAllSafe && !isSingleFlow) {
    usage();
    process.exitCode = 2;
  } else {
    const selected = isAllSafe
      ? Object.values(FLOW_SUITES)
      : (FLOW_SUITES[args[1]] ? [FLOW_SUITES[args[1]]] : []);
    if (selected.length === 0) {
      process.stderr.write('Unknown flow. Use --list to see available flows.\n');
      process.exitCode = 2;
    } else {
      const testNames = [...new Set(selected.flatMap((suite) => suite.tests))];
      if (testNames.length === 0) {
        process.stderr.write('This flow has no approved isolated tests yet; not marking it as PASS.\n');
        process.exitCode = 3;
      } else {
        const testFiles = testNames.map((name) => path.join(__dirname, '..', 'tests', name));
        process.stdout.write(`Running ${testFiles.length} allowlisted test file(s) locally.\n`);
        const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...testFiles], {
          cwd: path.join(__dirname, '..'),
          stdio: 'inherit',
          env: {
            ...process.env,
            // Test intent flag; selected tests must not make network/DB requests.
            KTC_ISOLATED_TESTS_ONLY: '1'
          }
        });
        process.exitCode = result.error ? 1 : (result.status ?? 1);
      }
    }
  }
}
