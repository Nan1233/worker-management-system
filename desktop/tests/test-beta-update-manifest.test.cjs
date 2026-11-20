'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { ensureBetaManifest } = require('../scripts/ensureBetaUpdateManifest.cjs');

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ktc-beta-update-'));
  fs.writeFileSync(path.join(directory, 'KTC-Production-Control-Setup.exe'), Buffer.from('simulated NSIS setup bytes'));
  fs.writeFileSync(path.join(directory, 'KTC-Production-Control-Setup.exe.blockmap'), Buffer.from('blockmap'));
  return directory;
}

test('beta manifest is generated from installer bytes and checked on the second pass', async (t) => {
  const directory = fixture();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const a = await ensureBetaManifest({ directory, version: '1.9.18-beta.1' });
  assert.equal(a.size, Buffer.byteLength('simulated NSIS setup bytes'));
  const yml = fs.readFileSync(a.manifestPath, 'utf8');
  assert.match(yml, /^version: 1\.9\.18-beta\.1$/m);
  assert.match(yml, /^path: KTC-Production-Control-Setup\.exe$/m);
  assert.match(yml, /^\s+size: 26$/m);
  assert.equal((yml.match(/sha512:/g) || []).length, 2);
  const b = await ensureBetaManifest({ directory, version: '1.9.18-beta.1' });
  assert.equal(b.sha512, a.sha512);
});

test('a stale beta manifest never authorizes a changed installer', async (t) => {
  const directory = fixture();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  await ensureBetaManifest({ directory, version: '1.9.18-beta.1' });
  fs.appendFileSync(path.join(directory, 'KTC-Production-Control-Setup.exe'), 'changed');
  await assert.rejects(
    ensureBetaManifest({ directory, version: '1.9.18-beta.1' }),
    /does not match/
  );
});

test('release refuses to generate metadata without blockmap or with invalid version', async (t) => {
  const directory = fixture();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  await assert.rejects(ensureBetaManifest({ directory, version: 'e.g. 1.9.18-beta.1' }), /Invalid/);
  fs.rmSync(path.join(directory, 'KTC-Production-Control-Setup.exe.blockmap'));
  await assert.rejects(ensureBetaManifest({ directory, version: '1.9.18-beta.1' }), /Missing/);
  assert.equal(fs.existsSync(path.join(directory, 'beta.yml')), false);
});
