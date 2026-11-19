'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeProposalReadRow } = require('../services/reportEditProposalReadNormalization');

test('proposal list and detail decode JSON into the same original row', () => {
    const row = { id: 7, proposed_data: '{"actual_time":8,"tt_ok":20}' };
    const normalized = normalizeProposalReadRow(row);
    assert.strictEqual(normalized, row);
    assert.deepEqual(row.proposed_data, { actual_time: 8, tt_ok: 20 });
});

test('invalid JSON returns an empty object for read only, without raising', () => {
    const row = { id: 8, proposed_data: '{invalid' };
    assert.deepEqual(normalizeProposalReadRow(row).proposed_data, {});
});

test('already parsed data and missing rows keep existing semantics', () => {
    const parsed = { proposed_data: { note: 'ok' } };
    assert.strictEqual(normalizeProposalReadRow(parsed), parsed);
    assert.deepEqual(parsed.proposed_data, { note: 'ok' });
    assert.equal(normalizeProposalReadRow(null), null);
});

test('both proposal read endpoints use the shared decoder; transactional approval stays strict', () => {
    const routes = fs.readFileSync(path.join(__dirname, '../routes/productionTempRoutes.js'), 'utf8');
    assert.match(routes, /return normalizeProposalReadRow\(rows\[0\]\)/);
    assert.match(routes, /accessible\.push\(normalizeProposalReadRow\(row\)\)/);
    const review = routes.slice(routes.indexOf('router.post("/edit-proposals/:id/review"'), routes.indexOf('router.delete("/edit-proposals/:id"'));
    assert.match(review, /if \(typeof proposed === "string"\)/);
    assert.match(review, /Dữ liệu đề xuất không hợp lệ/);
    assert.match(review, /await beginReadCommittedTransaction\(connection\)/);
    assert.match(review, /await rollbackTransaction\(connection\)/);
    assert.match(review, /await commitTransaction\(connection\)/);
});
