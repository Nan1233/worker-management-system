'use strict';

// Regression coverage for the "Không xác định duy nhất định mức sản phẩm 2801 / LONG
// trong công đoạn" production bug (GC / Cắt-Lòng report submission).
//
// Investigation summary (see PR description for full evidence chain):
//   - product_standards has a UNIQUE KEY on (process_id, product_code), so a product
//     code such as "2801" can only ever have one row of its own. Genuine ambiguity can
//     only come from a *different* product_standards row being pulled in through the
//     product_aliases chain (or a duplicated encoding_code) and disagreeing in value.
//   - Two independent places in the resolution stack discarded or skipped the
//     alias -> canonical product code translation that product_machine_standards rows
//     are actually keyed by:
//       1. models/productStandardModel.js#resolveByMachineAndProduct computed the
//          canonical code via resolveAliasToProductCode(...) and then threw it away
//          with `String(productCode||'').trim() || canonicalProductCode` (the raw,
//          non-empty input always wins over the alias-resolved value).
//       2. services/standardResolutionService.js#resolveStandard's own
//          product_machine_standards lookup compared against the raw requested
//          product code directly, with no alias resolution at all, so a
//          machine-specific standard registered under the canonical code (e.g.
//          "QC3-2801") could never be found for a worker request sent under the
//          alias code ("2801").
//   - Separately, resolveProduct()'s "not uniquely determined" error was thrown for
//     both a genuine zero-match lookup and a genuine multi-match/conflicting lookup,
//     which the bug task explicitly warned not to conflate. The two are now reported
//     under different error codes (HISTORICAL_STANDARD_NOT_FOUND vs
//     STANDARD_AMBIGUOUS_MATCH) with the conflicting candidate ids attached, so a
//     future "not found" vs "ambiguous" report can be told apart without DB access.
//
// These tests exercise the generic resolver contract with mocked DB rows standing in
// for the "2801 / Lồng" product, its canonical alias target, and its machine-specific
// standard, matching the actual GC master-data shape found in migrations
// 032/047/048/050 and database/KTC_FULL_DATABASE_CANONICAL_20260817.sql.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createStandardResolver } = require('../services/standardResolutionService');

function buildFixture({
  aliasRows = [],
  productStandardRows = [],
  machineStandardRows = [],
  machineCode = 'ML4'
} = {}) {
  return async (sql, params = []) => {
    const text = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();

    if (text.includes('from machines')) {
      return [{ id: 16, machine_code: machineCode, process_code: 'GC' }];
    }
    // Standalone alias-canonicalization lookup (new): must not be confused with the
    // nested `EXISTS(... FROM product_aliases ...)` clause inside the product_standards
    // query below, which contains the same substring.
    if (text.startsWith('select product_code from product_aliases')) {
      const aliasCode = String(params[1] || '').trim().toUpperCase();
      const match = aliasRows.find((row) => String(row.alias_code).toUpperCase() === aliasCode);
      return match ? [{ product_code: match.product_code }] : [];
    }
    if (text.includes('from product_machine_standards')) {
      const requestedProduct = String(params[2] || '').trim().toUpperCase();
      return machineStandardRows.filter((row) => String(row.product_code).toUpperCase() === requestedProduct);
    }
    if (text.includes('from product_standards')) {
      const isLong = /upper\(trim\(ps\.work_type\)\)\s*=\s*'lồng'/.test(text);
      const isCut = /upper\(trim\(ps\.work_type\)\)\s*=\s*'cắt'/.test(text);
      const requestedProduct = String(params[1] || '').trim().toUpperCase();
      return productStandardRows.filter((row) => {
        const codeMatches = String(row.product_code).toUpperCase() === requestedProduct
          || String(row.encoding_code || '').toUpperCase() === requestedProduct
          || aliasRows.some((alias) => String(alias.alias_code).toUpperCase() === requestedProduct
            && String(alias.product_code).toUpperCase() === String(row.product_code).toUpperCase());
        if (!codeMatches) return false;
        if (isLong) return String(row.work_type || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '') === 'LONG';
        if (isCut) return String(row.work_type || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '') === 'CUT';
        return true;
      });
    }
    if (text.includes('from product_standard_versions')) return [];
    throw new Error(`Unhandled test SQL: ${text}; params=${JSON.stringify(params)}`);
  };
}

// --- Scenario 1: unique resolution succeeds -------------------------------------
test('GC product 2801/Lồng resolves to exactly one standard when the master data is clean', async () => {
  const resolver = createStandardResolver({
    query: buildFixture({
      aliasRows: [{ alias_code: '2801', product_code: 'QC3-2801' }],
      productStandardRows: [
        { product_standard_id: 1, product_code: '2801', encoding_code: null, work_type: 'Lồng', standard_output: 605, exclude_kqd_from_tt: 0 }
      ],
      machineCode: 'ML4'
    })
  });
  const resolved = await resolver.resolveStandard({ processId: 1, productCode: '2801', machineCode: 'ML4', workDate: '2026-09-01' });
  assert.equal(resolved.standardOutput, 605);
  assert.equal(resolved.productCode, '2801');
});

// --- Scenario 2: genuine conflicting standards fail closed with a distinct code --
test('GC product 2801 with two disagreeing active standards throws a distinguishable ambiguity error, not an arbitrary pick', async () => {
  // "2801" matches directly; "QC3-2801" is pulled in only because the alias row
  // points at it, and its encoding_code happens to equal "2801" as well (mirrors a
  // real-world scenario where an admin's master-data import tagged the canonical
  // row with the alias as its encoding_code). The two rows disagree in standard
  // output, so neither pickExactRow (two "exact" hits now) nor pickEquivalentRow can
  // safely collapse them -- this must fail closed rather than pick either value.
  const resolver = createStandardResolver({
    query: buildFixture({
      aliasRows: [{ alias_code: '2801', product_code: 'QC3-2801' }],
      productStandardRows: [
        { product_standard_id: 1, product_code: '2801', encoding_code: '2801', work_type: 'Lồng', standard_output: 605, exclude_kqd_from_tt: 0 },
        { product_standard_id: 2, product_code: 'QC3-2801', encoding_code: '2801', work_type: 'Lồng', standard_output: 257.14, exclude_kqd_from_tt: 0 }
      ],
      machineCode: 'ML4'
    })
  });
  await assert.rejects(
    () => resolver.resolveStandard({ processId: 1, productCode: '2801', machineCode: 'ML4', workDate: '2026-09-01' }),
    (error) => {
      assert.equal(error.code, 'STANDARD_AMBIGUOUS_MATCH');
      assert.equal(error.status, 422);
      assert.deepEqual(new Set(error.details.candidate_standard_ids), new Set([1, 2]));
      return true;
    }
  );
});

// --- Scenario 3: irrelevant records for another product/work type don't leak in --
test('a Cắt-only standard for a different product does not create false ambiguity for a Lồng lookup', async () => {
  const resolver = createStandardResolver({
    query: buildFixture({
      aliasRows: [],
      productStandardRows: [
        { product_standard_id: 1, product_code: '2801', encoding_code: null, work_type: 'Lồng', standard_output: 605, exclude_kqd_from_tt: 0 },
        { product_standard_id: 9, product_code: '9999', encoding_code: null, work_type: 'Cắt', standard_output: 400, exclude_kqd_from_tt: 0 }
      ],
      machineCode: 'ML4'
    })
  });
  const resolved = await resolver.resolveStandard({ processId: 1, productCode: '2801', machineCode: 'ML4', workDate: '2026-09-01' });
  assert.equal(resolved.standardOutput, 605);
});

// --- Scenario 4: missing standard still reports as "not found", distinctly --------
test('a product with no matching standard at all reports HISTORICAL_STANDARD_NOT_FOUND, not an ambiguity error', async () => {
  const resolver = createStandardResolver({
    query: buildFixture({ aliasRows: [], productStandardRows: [], machineCode: 'ML4' })
  });
  await assert.rejects(
    () => resolver.resolveStandard({ processId: 1, productCode: '2801', machineCode: 'ML4', workDate: '2026-09-01' }),
    (error) => error.code === 'HISTORICAL_STANDARD_NOT_FOUND' && error.status === 422
  );
});

// --- Scenario 5 covered by existing machine-line-validation/authorization suites --
// (worker authorization/process-scope enforcement lives in machineLineValidationService
// and reportBusinessValidationService and is untouched by this change; see those test
// files for coverage that remains green below.)

// --- selectProductRow(): the -AUTO fallback's own ambiguity must not be masked -----
test('a genuinely ambiguous -AUTO variant is reported as ambiguous, not silently treated as not-found', async () => {
  // No row matches "X" directly (the non-auto lookup is empty), but two conflicting
  // "X-AUTO" rows exist. selectProductRow() must classify this using the -AUTO
  // lookup's own candidate set (2, conflicting) rather than falling back to the
  // non-auto lookup's candidate count (0), which would misreport this as a plain
  // "not found" and lose the real conflict.
  const resolver = createStandardResolver({
    query: buildFixture({
      aliasRows: [],
      productStandardRows: [
        { product_standard_id: 21, product_code: 'X-AUTO', encoding_code: null, work_type: 'standard', standard_output: 500, exclude_kqd_from_tt: 0 },
        { product_standard_id: 22, product_code: 'X-AUTO', encoding_code: null, work_type: 'standard', standard_output: 800, exclude_kqd_from_tt: 0 }
      ],
      machineCode: ''
    })
  });
  await assert.rejects(
    () => resolver.resolveStandard({ processId: 1, productCode: 'X', operationMode: 'AUTO', workDate: '2026-09-01' }),
    (error) => {
      assert.equal(error.code, 'STANDARD_AMBIGUOUS_MATCH');
      assert.deepEqual(new Set(error.details.candidate_standard_ids), new Set([21, 22]));
      return true;
    }
  );
});

// --- Scenario 6: normal valid submission flow succeeds with the machine-specific
//     standard once alias canonicalization is applied -----------------------------
test('machine-specific standard registered under the canonical code is now found for a request sent under the alias code', async () => {
  const resolver = createStandardResolver({
    query: buildFixture({
      aliasRows: [{ alias_code: '2801', product_code: 'QC3-2801' }],
      productStandardRows: [
        { product_standard_id: 1, product_code: '2801', encoding_code: null, work_type: 'Lồng', standard_output: 605, exclude_kqd_from_tt: 0 }
      ],
      machineStandardRows: [
        { id: 77, product_code: 'QC3-2801', standard_output: 257.14, calculated_output_per_hour: 257.142857, standard_time_seconds: 14, effective_from: null, effective_to: null, is_active: 1 }
      ],
      machineCode: '3'
    })
  });
  const resolved = await resolver.resolveStandard({ processId: 1, productCode: '2801', machineCode: '3', workDate: '2026-09-01' });
  // Before the fix this fell through silently to the generic 605 standard because the
  // machine-specific lookup compared against the raw "2801" code instead of the
  // canonical "QC3-2801" that product_machine_standards actually stores.
  assert.equal(resolved.machineStandardId, 77);
  assert.equal(resolved.standardOutput, 257.142857);
  assert.equal(resolved.source, 'MACHINE');
});

// --- Scenario 7: other processes/products remain unaffected -----------------------
test('a non-GC, non-aliased product resolves exactly as before (no alias lookup side effects)', async () => {
  const resolver = createStandardResolver({
    query: buildFixture({
      aliasRows: [],
      productStandardRows: [
        { product_standard_id: 5, product_code: 'P1', encoding_code: null, work_type: 'standard', standard_output: 300, exclude_kqd_from_tt: 0 }
      ],
      machineCode: ''
    })
  });
  const resolved = await resolver.resolveStandard({ processId: 2, productCode: 'P1', workDate: '2026-09-01' });
  assert.equal(resolved.standardOutput, 300);
  assert.equal(resolved.productCode, 'P1');
});
