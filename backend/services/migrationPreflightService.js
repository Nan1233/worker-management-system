'use strict';

const FORMULA_EFFECTIVE_RANGE_MIGRATION = '025_formula_settings_effective_range_20260813.sql';
const FORMULA_EFFECTIVE_RANGE_COLUMNS = new Set(['effective_from', 'effective_to']);

function assertFormulaEffectiveRangeCompatibility(rows = []) {
  for (const row of rows) {
    const name = String(row?.column_name || '').toLowerCase();
    if (!FORMULA_EFFECTIVE_RANGE_COLUMNS.has(name)) continue;
    const compatible = String(row?.data_type || '').toLowerCase() === 'date'
      && String(row?.is_nullable || '').toUpperCase() === 'YES'
      && row?.column_default == null;
    if (!compatible) {
      const error = new Error(`Migration 025 yêu cầu ${name} có định nghĩa DATE NULL không default.`);
      error.code = 'MIGRATION_SCHEMA_INCOMPATIBLE';
      error.column = name;
      throw error;
    }
  }
  return { compatible: true };
}

async function preflightFormulaEffectiveRangeMigration(executor) {
  const [rows] = await executor.query(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'production_formula_settings'
       AND column_name IN ('effective_from', 'effective_to')`,
  );
  return assertFormulaEffectiveRangeCompatibility(rows);
}

module.exports = {
  FORMULA_EFFECTIVE_RANGE_MIGRATION,
  assertFormulaEffectiveRangeCompatibility,
  preflightFormulaEffectiveRangeMigration,
};
