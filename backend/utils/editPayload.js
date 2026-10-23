'use strict';
// The edit controller validates against current-row data merged with the request body (so partial
// payloads validate), but it must only WRITE child collections the client actually sent. Otherwise
// the "current" fallback (a merged view that also contains machine-line and legacy-column defects)
// would be written back into the worker-declared parent tables, wiping or polluting them.
const CHILD_COLLECTIONS = ["defects", "deductions"];

function omitUnsentCollections(body, update) {
  const source = body && typeof body === "object" ? body : {};
  const next = { ...update };
  for (const key of CHILD_COLLECTIONS) {
    if (!Object.prototype.hasOwnProperty.call(source, key) || source[key] === undefined || source[key] === null) delete next[key];
  }
  return next;
}

// Parent columns the controller derives from machine lines. When the client did not send machine_lines the
// controller re-validates the STORED lines only to apply policy checks; its re-derived totals (standards are
// re-resolved for today's date) must not overwrite stored lines or the parent columns that mirror them.
const MACHINE_DERIVED_FIELDS = [
  "machine_lines", "machine_no", "product_name", "standard_output", "actual_output", "tt_ok", "tt_ng",
  "exclude_kqd_from_tt", "exclude_kqd_from_tt_snapshot", "standard_version_id", "machine_standard_id", "operation_mode",
];

function preserveStoredMachineData(body, update) {
  const source = body && typeof body === "object" ? body : {};
  if (Object.prototype.hasOwnProperty.call(source, "machine_lines")) return update;
  if (!Array.isArray(update?.machine_lines) || update.machine_lines.length === 0) return update;
  const next = { ...update };
  for (const key of MACHINE_DERIVED_FIELDS) delete next[key];
  return next;
}

module.exports = { omitUnsentCollections, preserveStoredMachineData };
