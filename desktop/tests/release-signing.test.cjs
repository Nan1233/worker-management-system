'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { sha256 } = require('../scripts/verifyWindowsRelease.cjs');

test('Windows setup build keeps code signing enabled', () => {
  const pkg = require('../package.json');
  assert.equal(pkg.build.win.signAndEditExecutable, true);
  assert.equal(pkg.build.win.signExecutable, true);
  assert.equal(pkg.build.nsis.perMachine, false);
  assert.equal(pkg.build.win.requestedExecutionLevel, 'asInvoker');
  assert.match(pkg.scripts['dist:win:verified'], /release:signing-check.*dist:win.*release:verify:windows/);
});

test('SHA-256 matches the Node crypto reference digest', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ktc-signing-test-'));
  const file = path.join(dir, 'test-file.bin');
  try {
    fs.writeFileSync(file, Buffer.from('KTC Windows release validation\n'));
    const expected = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    assert.equal(sha256(file), expected);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
