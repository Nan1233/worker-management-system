'use strict';

// Windows-only post-build verification; never imports private signing keys.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

function readAuthenticode(file) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$s = Get-AuthenticodeSignature -LiteralPath $env:KTC_VERIFY_FILE",
    "[pscustomobject]@{",
    "  status = [string]$s.Status",
    "  message = [string]$s.StatusMessage",
    "  thumbprint = if ($s.SignerCertificate) { [string]$s.SignerCertificate.Thumbprint } else { '' }",
    "  subject = if ($s.SignerCertificate) { [string]$s.SignerCertificate.Subject } else { '' }",
    "  expires = if ($s.SignerCertificate) { $s.SignerCertificate.NotAfter.ToString('o') } else { '' }",
    "} | ConvertTo-Json -Compress"
  ].join('\n');
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded
  ], {
    encoding: 'utf8',
    env: { ...process.env, KTC_VERIFY_FILE: file },
    windowsHide: true
  });
  if (result.error || result.status !== 0) {
    throw new Error('Cannot read Authenticode signature: ' + (result.stderr || result.error?.message || 'PowerShell failed'));
  }
  return JSON.parse(result.stdout.replace(/^\uFEFF/, '').trim());
}

function sha256(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.alloc(1024 * 1024);
  try {
    let n;
    while ((n = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function assertTrustedSignature(signature, file) {
  if (!signature?.thumbprint || signature.status !== 'Valid') {
    throw new Error('Trusted Authenticode signature required for ' + path.basename(file) + ': ' + (signature?.status || 'Missing'));
  }
}

function verify(file) {
  if (!fs.existsSync(file)) throw new Error('Missing build artifact: ' + file);
  const signature = readAuthenticode(file);
  assertTrustedSignature(signature, file);
  if (signature.expires && Date.parse(signature.expires) < Date.now()) {
    throw new Error('Signing certificate expired: ' + path.basename(file));
  }
  return {
    file: path.basename(file),
    sha256: sha256(file),
    signatureStatus: signature.status,
    signerSubject: signature.subject,
    signerThumbprint: signature.thumbprint,
    signerExpires: signature.expires
  };
}

function main() {
  if (process.platform !== 'win32') throw new Error('Release verification must run on Windows.');
  const root = path.resolve(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const release = path.resolve(root, pkg.build.directories.output);
  const setup = path.join(release, pkg.build.nsis.artifactName);
  const appExe = path.join(release, 'win-unpacked', pkg.build.productName + '.exe');

  const artifacts = [verify(setup), verify(appExe)];
  if (process.argv.includes('--include-portable')) artifacts.push(verify(path.join(release, pkg.build.portable.artifactName)));
  const manifest = {
    packageVersion: pkg.version,
    verifiedAt: new Date().toISOString(),
    platform: os.platform(),
    artifacts,
    note: 'Self-signed certificates do not establish SmartScreen reputation or bypass Smart App Control.'
  };
  fs.writeFileSync(path.join(release, 'KTC-release-verification.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(release, 'SHA256SUMS.txt'), artifacts.map(a => a.sha256 + '  ' + a.file).join('\n') + '\n');
  console.log('[PASS] All checked EXEs have trusted Authenticode signatures. SHA-256 manifest generated.');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('[FAIL] Windows release verification:', error.message);
    process.exitCode = 1;
  }
}

module.exports = { sha256, verify, assertTrustedSignature };
