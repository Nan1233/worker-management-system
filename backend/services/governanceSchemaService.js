const db = require('../config/db');

let readyPromise = null;

async function ensureSchema() {
  // Schema creation belongs exclusively to the canonical database snapshot.
  // Runtime governance requests never CREATE/ALTER schema.
  if (!readyPromise) readyPromise = Promise.resolve(true);
  return readyPromise;
}

module.exports = { ensureSchema };
