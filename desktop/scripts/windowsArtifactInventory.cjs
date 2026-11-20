'use strict';

// These names are the electron-builder NSIS and Portable artifactName contracts.
// Presence is a build gate, not evidence of installation, signing or runtime QA.
const REQUIRED = Object.freeze([
  'KTC-Production-Control-Setup.exe',
  'KTC-Production-Control.exe',
]);

function verifyWindowsArtifactInventory(entries) {
  const inventory = new Map(entries.map(entry => [String(entry.name), Number(entry.size) || 0]));
  const issues = [];
  for (const name of REQUIRED) {
    if (!inventory.has(name)) issues.push(`missing ${name}`);
    else if (inventory.get(name) <= 0) issues.push(`empty ${name}`);
  }
  return {
    ok: issues.length === 0,
    issues,
    artifacts: REQUIRED.map(name => ({ name, size: inventory.get(name) || 0 })),
  };
}

module.exports = { REQUIRED, verifyWindowsArtifactInventory };
