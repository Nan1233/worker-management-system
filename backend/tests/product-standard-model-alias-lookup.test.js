'use strict';

// Regression test for models/productStandardModel.js#resolveByMachineAndProduct.
//
// The function computed the alias-canonicalized product code
// (resolveAliasToProductCode) and then discarded it:
//   const lookupProductCode = String(productCode || '').trim() || canonicalProductCode;
// Since the raw productCode is virtually always non-empty, `canonicalProductCode` was
// dead: the function always called resolveStandard() with the raw/alias code instead
// of the canonical code that product_machine_standards rows are actually keyed by.
//
// This test mocks both ../config/db (for the alias lookup) and
// ../services/standardResolutionService (to capture what productCode
// resolveByMachineAndProduct actually forwards) to prove the canonical code is now
// used end to end.

const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../config/db');
const resolverPath = require.resolve('../services/standardResolutionService');
const modelPath = require.resolve('../models/productStandardModel');

function withMocks({ aliasTarget }, run) {
  const oldDb = require.cache[dbPath];
  const oldResolver = require.cache[resolverPath];
  delete require.cache[modelPath];

  const capturedCalls = [];
  const fakeDb = {
    query(sql, params, callback) {
      if (/FROM product_aliases/i.test(sql)) {
        if (aliasTarget) return callback(null, [{ product_code: aliasTarget }]);
        return callback(null, []);
      }
      return callback(new Error(`Unexpected SQL in mocked db: ${sql}`));
    }
  };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

  const fakeResolverModule = {
    resolveStandard: async (args) => {
      capturedCalls.push(args);
      return {
        productStandardId: 1, standardVersionId: null, machineStandardId: 77,
        processId: args.processId, productCode: args.productCode, machineId: 16,
        machineCode: args.machineCode, standardTimeSeconds: 14, standardOutput: 257.142857,
        source: 'MACHINE', excludeKqdFromTt: 0
      };
    }
  };
  require.cache[resolverPath] = { id: resolverPath, filename: resolverPath, loaded: true, exports: fakeResolverModule };

  try {
    const model = require(modelPath);
    return run(model, capturedCalls);
  } finally {
    delete require.cache[modelPath];
    if (oldDb) require.cache[dbPath] = oldDb; else delete require.cache[dbPath];
    if (oldResolver) require.cache[resolverPath] = oldResolver; else delete require.cache[resolverPath];
  }
}

test('resolveByMachineAndProduct forwards the alias-canonicalized product code, not the raw alias', async () => {
  await withMocks({ aliasTarget: 'QC3-2801' }, async (model, calls) => {
    await model.resolveByMachineAndProduct(1, '3', '2801', '2026-09-01');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].productCode, 'QC3-2801', 'must resolve "2801" to its canonical "QC3-2801" before calling resolveStandard');
  });
});

test('resolveByMachineAndProduct passes the original code through unchanged when it has no alias', async () => {
  await withMocks({ aliasTarget: null }, async (model, calls) => {
    await model.resolveByMachineAndProduct(1, 'M1', 'P1', '2026-09-01');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].productCode, 'P1');
  });
});
