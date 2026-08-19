const assert = require('node:assert/strict');
const path = require('node:path');
const { getDesktopDataRoot, getDocumentsRoot } = require('../electron/platformPaths.cjs');

const home = path.resolve('/Users/ktc-test');
assert.equal(getDesktopDataRoot({ platform: 'darwin', home }), path.join(home, 'Library', 'Application Support', 'KTC-Worker-Management'));
assert.equal(getDesktopDataRoot({ platform: 'linux', home }), path.join(home, '.config', 'KTC-Worker-Management'));
assert.equal(getDesktopDataRoot({ platform: 'win32', home }), path.join(home, 'AppData', 'Local', 'KTC-Worker-Management'));
assert.equal(getDocumentsRoot({ home }), path.join(home, 'Documents'));
console.log('Desktop platform paths OK');
