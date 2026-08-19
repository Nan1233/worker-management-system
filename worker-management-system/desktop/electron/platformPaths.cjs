const os = require('node:os');
const path = require('node:path');

function getDesktopDataRoot({ platform = process.platform, home = os.homedir() } = {}) {
  if (platform === 'win32') return path.join(home, 'AppData', 'Local', 'KTC-Worker-Management');
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'KTC-Worker-Management');
  return path.join(home, '.config', 'KTC-Worker-Management');
}

function getDocumentsRoot({ home = os.homedir() } = {}) {
  return path.join(home, 'Documents');
}

module.exports = { getDesktopDataRoot, getDocumentsRoot };
