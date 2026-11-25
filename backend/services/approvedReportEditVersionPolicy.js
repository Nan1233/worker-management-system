'use strict';
function timestampsEqual(expected, actual) {
  if (!expected) return true;
  const a = new Date(expected).getTime();
  const b = new Date(actual || 0).getTime();
  // Do not treat different versions in the same second as equal.
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

function httpError(status, code, message, details) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.isPublic = true;
  if (details) error.details = details;
  return error;
}

module.exports = {timestampsEqual,httpError};
