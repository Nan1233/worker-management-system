-- KTC 025 - Move formula effective-range schema ownership into canonical migrations.
-- Legacy databases may already contain one or both columns from the retired request-time
-- ensureSchema() path. The migration runner performs a read-only compatibility preflight
-- before these statements: exact DATE NULL columns are accepted; incompatible definitions
-- fail closed before any DDL or migration-ledger write. No formula data is rewritten.

ALTER TABLE production_formula_settings
  ADD COLUMN IF NOT EXISTS effective_from DATE NULL AFTER process_id;

ALTER TABLE production_formula_settings
  ADD COLUMN IF NOT EXISTS effective_to DATE NULL AFTER effective_from;
