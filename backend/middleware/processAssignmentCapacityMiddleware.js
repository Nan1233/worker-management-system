// Personnel process assignments are intentionally unlimited.
// Keep this middleware as a pass-through so existing route wiring remains stable
// without enforcing the old 1-manager / 3-lead capacity policy.
module.exports = function processAssignmentCapacity(_req, _res, next) {
  return next();
};
