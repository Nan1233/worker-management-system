'use strict';

// Resolve a new, strictly increasing TEST prerelease version without asking
// operators to type semver into GitHub Actions. Pure calculation is unit-tested.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function parseCore(value) {
  const match = /^(\\d+)\\.(\\d+)\\.(\\d+)$/.exec(String(value || '').trim());
  if (!match) throw new Error('Desktop package version must be x.y.z');
  return match.slice(1).map(Number);
}
function compareCore(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}
function nextBetaVersion(packageVersion, gitTagRefs) {
  const current = parseCore(packageVersion);
  // Every TEST beta must be newer than the unmodified stable base package.
  const minimumBase = [current[0], current[1], current[2] + 1];
  let latestBase = minimumBase;
  let maxBeta = 0;
  for (const item of gitTagRefs || []) {
    const ref = typeof item === 'string' ? item : String(item?.ref || item?.tag_name || '');
    const match = /(?:^|\\/)v?(\\d+)\\.(\\d+)\\.(\\d+)-beta\\.(\\d+)$/.exec(ref);
    if (!match) continue;
    const base = match.slice(1, 4).map(Number);
    const beta = Number(match[4]);
    const cmp = compareCore(base, latestBase);
    if (cmp > 0) {
      latestBase = base;
      maxBeta = beta;
    } else if (cmp === 0) {
      maxBeta = Math.max(maxBeta, beta);
    }
  }
  return latestBase.join('.') + '-beta.' + (maxBeta + 1);
}

function resolveFromGitHub({ repository, packageVersion, envFile }) {
  if (!/^[A-Za-z0-9_.-]+\\/[A-Za-z0-9_.-]+$/.test(repository || '')) {
    throw new Error('Missing or invalid GITHUB_REPOSITORY');
  }
  if (!envFile) throw new Error('Missing GITHUB_ENV');
  const stableCore = parseCore(packageVersion);
  const base = [stableCore[0], stableCore[1], stableCore[2] + 1].join('.');
  // Git refs, unlike the release list, include prerelease tags even if
  // older stable releases swamp the first 100 list entries.
  const apiPath = 'repos/' + repository + '/git/matching-refs/tags/v';
  const text = execFileSync('gh', ['api', apiPath, '--paginate'], {
    encoding: 'utf8', maxBuffer: 12 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']
  });
  // --paginate emits one JSON array per page, not one combined JSON document.
  const refs = [];
  for (const chunk of text.match(/\\[[\\s\\S]*?\\](?=\\s*\\[|\\s*$)/g) || []) {
    refs.push(...JSON.parse(chunk));
  }
  if (!refs.length && text.trim()) throw new Error('Could not parse GitHub tags');
  const version = nextBetaVersion(packageVersion, refs);
  const [major, minor, patch] = parseCore(version.split('-')[0]);
  if (compareCore([major, minor, patch], stableCore) <= 0) {
    throw new Error('Refusing a downgrade or equal stable-version release');
  }
  fs.appendFileSync(envFile, 'RELEASE_VERSION=' + version + '\\n', 'utf8');
  console.log('Selected unique TEST version: ' + version);
  return version;
}

if (require.main === module) {
  try {
    const packageVersion = require(path.join(__dirname, '..', 'package.json')).version;
    resolveFromGitHub({
      repository: process.env.GITHUB_REPOSITORY,
      packageVersion,
      envFile: process.env.GITHUB_ENV
    });
  } catch (error) {
    console.error('Unable to resolve new TEST beta release version:', error.message);
    process.exitCode = 1;
  }
}

module.exports = { parseCore, compareCore, nextBetaVersion, resolveFromGitHub };
