'use strict';

// The TEST release workflow builds with --publish never to prevent any asset
// from being uploaded before test/manifest checks. electron-builder v26 can
// leave out beta.yml in that mode, so generate it from the actual NSIS bytes.
// Never copy latest.yml from production or reuse hashes from another build.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const INSTALLER = 'KTC-Production-Control-Setup.exe';
const BLOCKMAP = INSTALLER + '.blockmap';
const MANIFEST = 'beta.yml';

async function hashFile(filepath) {
  const stream = fs.createReadStream(filepath);
  const hash = createHash('sha512');
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('base64');
}

function ensurePresent(file) {
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size <= 0) throw new Error('Missing or empty TEST release asset: ' + file);
  return stat.size;
}

async function ensureBetaManifest({ directory, version }) {
  if (!/^\d+\.\d+\.\d+-beta\.\d+$/.test(version || '')) {
    throw new Error('Invalid TEST beta version: ' + version);
  }
  const installerPath = path.join(directory, INSTALLER);
  const blockmapPath = path.join(directory, BLOCKMAP);
  const manifestPath = path.join(directory, MANIFEST);
  const size = ensurePresent(installerPath);
  ensurePresent(blockmapPath);
  const sha512 = await hashFile(installerPath);
  if (!/^[A-Za-z0-9+/]{86}==$/.test(sha512) && !/^[A-Za-z0-9+/]{86}=$/.test(sha512)) {
    throw new Error('Invalid base64 SHA-512 for installer');
  }

  let manifest = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8') : '';
  if (!manifest.trim()) {
    manifest = [
      'version: ' + version,
      'files:',
      '  - url: ' + INSTALLER,
      '    sha512: ' + sha512,
      '    size: ' + size,
      'path: ' + INSTALLER,
      'sha512: ' + sha512,
      "releaseDate: '" + new Date().toISOString() + "'",
      ''
    ].join('\n');
    fs.writeFileSync(manifestPath, manifest, { encoding: 'utf8', flag: 'wx' });
  }

  const versionMatch = /^version:\s*['"]?([^\s'"]+)/m.exec(manifest);
  const hashes = [...manifest.matchAll(/^\s*sha512:\s*(\S+)\s*$/gm)].map(match => match[1]);
  const urlMatch = /^\s*-\s*url:\s*['"]?([^\s'"]+)/m.exec(manifest);
  const pathMatch = /^path:\s*['"]?([^\s'"]+)/m.exec(manifest);
  const sizeMatch = /^\s+size:\s*(\d+)\s*$/m.exec(manifest);
  if (versionMatch?.[1] !== version
    || urlMatch?.[1] !== INSTALLER
    || pathMatch?.[1] !== INSTALLER
    || sizeMatch?.[1] !== String(size)
    || hashes.length < 1
    || hashes.some(value => value !== sha512)) {
    throw new Error('TEST beta.yml does not match the actual NSIS Setup bytes/version; refusing release.');
  }
  console.log('TEST beta update manifest verified:', { version, installer: INSTALLER, size, hashPrefix: sha512.slice(0, 12) });
  return { manifestPath, size, sha512 };
}

function parseArgs(argv) {
  const value = (flag) => argv[argv.indexOf(flag) + 1];
  return { version: value('--version'), directory: path.resolve(value('--directory') || 'release') };
}

if (require.main === module) {
  ensureBetaManifest(parseArgs(process.argv.slice(2))).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { ensureBetaManifest };
