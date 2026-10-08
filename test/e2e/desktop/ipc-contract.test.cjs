'use strict';

// Renderer <-> main process contract, read from source (Electron is not loaded).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../lib/config.cjs');

const ELECTRON = path.join(config.ROOT, 'desktop', 'electron');
const read = (file) => fs.readFileSync(path.join(ELECTRON, file), 'utf8');
const preload = read('preload.cjs');
const mainSources = fs.readdirSync(ELECTRON).filter((f) => f.endsWith('.cjs') && f !== 'preload.cjs').map((f) => read(f)).join('\n');
const channels = (source, pattern) => [...source.matchAll(pattern)].map((m) => m[1]);

const invoked = channels(preload, /ipcRenderer\.invoke\(\s*'([^']+)'/g);
const sent = channels(preload, /ipcRenderer\.send\(\s*'([^']+)'/g);
const listened = channels(preload, /ipcRenderer\.on\(\s*'([^']+)'/g);
const handled = new Set(channels(mainSources, /ipcMain\.handle\(\s*'([^']+)'/g));
const onMain = new Set(channels(mainSources, /ipcMain\.on\(\s*'([^']+)'/g));
const emitted = new Set(channels(mainSources, /(?:webContents\.send|sendRenderer)\(\s*'([^']+)'/g));

test('preload exposes a fixed API through contextBridge, never ipcRenderer itself', () => {
  assert.match(preload, /contextBridge\.exposeInMainWorld\(/);
  assert.doesNotMatch(preload, /exposeInMainWorld\([^)]*ipcRenderer\s*[,)]/);
  assert.ok(invoked.length >= 10, `expected the desktop API channels, found ${invoked.length}`);
});

test('every ipcRenderer.invoke channel has an ipcMain.handle', () => {
  const missing = invoked.filter((channel) => !handled.has(channel));
  assert.deepEqual(missing, []);
});

test('every ipcRenderer.send channel has an ipcMain.on listener', () => {
  const missing = sent.filter((channel) => !onMain.has(channel));
  assert.deepEqual(missing, []);
});

test('every channel the renderer listens to is emitted by the main process', () => {
  const missing = listened.filter((channel) => !emitted.has(channel));
  assert.deepEqual(missing, []);
});

test('all channels use the ktc- namespace and are not handled twice', () => {
  for (const channel of [...invoked, ...sent, ...listened]) assert.match(channel, /^ktc-[a-z0-9-]+$/);
  const all = channels(mainSources, /ipcMain\.handle\(\s*'([^']+)'/g);
  const duplicates = all.filter((channel, i) => all.indexOf(channel) !== i);
  assert.deepEqual(duplicates, [], 'ipcMain.handle twice for one channel throws at runtime');
});
