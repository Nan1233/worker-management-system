'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontendRoot = path.join(__dirname, '..');
const packageJson = require(path.join(frontendRoot, 'package.json'));
const scripts = packageJson.scripts;

test('normal frontend lifecycle commands never rewrite application source', () => {
  for (const name of ['prebuild', 'pretypecheck', 'pretest', 'prepare:source']) {
    assert.equal(scripts[name], undefined, `${name} must not mutate source before a command`);
  }
});

test('Cloudflare build commands use the same deterministic build pipeline', () => {
  assert.equal(scripts['build:cloudflare'], 'npm run build:cloudflare:test');
  for (const name of ['build:cloudflare:test', 'build:cloudflare:production']) {
    assert.match(scripts[name], /^npm run clean && tsc -b && vite build --mode (test|production)/);
    assert.match(scripts[name], /forceFrontendVersion\.cjs/);
    assert.match(scripts[name], /check:bundle/);
    assert.doesNotMatch(scripts[name], /prepare:source|patch[A-Z]/);
  }
});

test('obsolete source patch scripts are removed after their changes were promoted to source', () => {
  for (const name of [
    'patchManagerReportSave.cjs',
    'patchWorkerReportEdit.cjs',
    'patchCvkWorkerEntryV3.cjs',
    'patchCvkClickFix.cjs',
    'patchCvkFinalCleanup.cjs',
  ]) {
    assert.equal(fs.existsSync(path.join(frontendRoot, 'scripts', name)), false, name);
  }
});

test('CVK component styles are kept in a stylesheet, not injected as runtime style JSX', () => {
  const component = fs.readFileSync(path.join(frontendRoot, 'src', 'pages', 'worker', 'components', 'ProcessBasicInfoSection.tsx'), 'utf8');
  const stylesheet = path.join(frontendRoot, 'src', 'pages', 'worker', 'components', 'ProcessBasicInfoSection.css');
  assert.match(component, /import ["']\.\/ProcessBasicInfoSection\.css["']/);
  assert.equal(fs.existsSync(stylesheet), true);
  assert.doesNotMatch(component, /cvkWorkerInlineStyle|<style className=/);
});
