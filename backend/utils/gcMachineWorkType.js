'use strict';

// Single backend rule for the Cắt/Lồng work type of a GC machine.
// The machine master (machines.gc_work_type = 'CUT' | 'LONG' | NULL) is the only
// source of truth. The machine-code prefix (C*, ML*) is deliberately NOT used.

const LABELS = Object.freeze({ CUT: 'Cắt', LONG: 'Lồng' });

function normalizeMachineGcWorkType(value) {
  const text = String(value ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (text === 'CUT' || text === 'CAT') return 'CUT';
  if (text === 'LONG' || text === 'LNG') return 'LONG';
  return null;
}

// 'Cắt' | 'Lồng' | null
function gcWorkTypeLabel(value) {
  const normalized = normalizeMachineGcWorkType(value);
  return normalized ? LABELS[normalized] : null;
}

const isMissingColumnError = (error) =>
  Boolean(error) && (Number(error.errno) === 1054 || error.code === 'ER_BAD_FIELD_ERROR');

// Runs a machine query that selects machines.gc_work_type. If the database has not
// had migration 059 applied yet, the query is retried without the column so the
// rest of the application keeps working; gc_work_type then reads as NULL and GC
// reports get an explicit "machine type not configured" error rather than a guess.
async function queryWithOptionalGcWorkType(query, buildSql, params = []) {
  try {
    return await query(buildSql(true), params);
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    return query(buildSql(false), params);
  }
}

module.exports = { normalizeMachineGcWorkType, gcWorkTypeLabel, isMissingColumnError, queryWithOptionalGcWorkType };
