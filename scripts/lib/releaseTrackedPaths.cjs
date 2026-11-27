'use strict';

// Only these public example/build-profile env files are intentionally tracked.
// Any real .env or other .env.* path fails closed; never read secret contents.
const ALLOWED_ENV = new Set(['.env.example','backend/.env.example','frontend/.env.example','frontend/.env.test','frontend/.env.production']);
function inspectTrackedPaths(paths) {
  return paths.map(file=>String(file).replace(/\\/g,'/')).filter(file=>
    /\.(bak|orig|tmp)$/i.test(file) || /~$/.test(file) ||
    (/(^|\/)\.env(?:\.|$)/i.test(file) && !ALLOWED_ENV.has(file))
  ).sort();
}
module.exports={inspectTrackedPaths};
