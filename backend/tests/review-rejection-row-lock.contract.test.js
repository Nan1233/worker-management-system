'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildApprovalScopeQuery, buildRejectionScopeQuery } = require('../models/productionTempApprovalQueries');
const { buildRejectedReportUpdate } = require('../models/productionTempRejectionBuilders');
const { assertApprovalSelectionVisible, assertApprovalSelectionVersions } = require('../models/productionTempApprovalSelection');

const read = name => fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const approve=read('services/productionApprovalWorkflowService.js');
const reject=read('services/productionRejectionWorkflowService.js');
const source=read('models/productionApprovalReviewBuilders.js');
const repository=read('repositories/productionApprovalReadRepository.js');

test('approval and rejection both lock pending reports with explicit manager process scope', () => {
  for (const [name, body, builder] of [
    ['approval', approve, buildApprovalScopeQuery],
    ['rejection', reject, buildRejectionScopeQuery],
  ]) {
    const manager = builder([9,3], 12, false);
    const admin = builder([9,3], 12, true);
    for (const result of [manager,admin]) {
      assert.match(result.sql, /temp\.status IN \('pending','need_fix'\)/, name);
      assert.match(result.sql, /ORDER BY temp\.id ASC\s+FOR UPDATE/, name);
      assert.match(result.sql, /temp\.id IN \(\?,\?\)/, name);
    }
    assert.match(manager.sql, /manager_processes mp/, name);
    assert.deepEqual(manager.params, [9,3,12], name);
    assert.deepEqual(admin.params, [9,3], name);
    assert.doesNotMatch(admin.sql, /manager_processes mp/, name);

    const positions = [
      'await readReviewCandidates(connection, reportIds, reviewerId, isAdmin',
      'assertApprovalSelectionVisible(rows, reportIds)',
      'assertApprovalSelectionVersions(rows, expectedById)',
    ].map(marker => body.indexOf(marker));
    assert.ok(positions.every(pos=>pos>=0), name + ' missing visible/version guard');
    assert.ok(positions[0] < positions[1] && positions[1] < positions[2], name + ' guard order');
  }
});

test('rejection SQL is status conditional and CAS-guarded when expected version exists', () => {
  const row = { id:17,updated_at:'2026-11-20 07:00:00' };
  const guarded = buildRejectedReportUpdate(row, '2026-11-20 08:00:00', 'Thiếu thông tin', 5);
  const unguarded = buildRejectedReportUpdate(row, null, 'Thiếu thông tin', 5);
  assert.match(guarded.sql, /WHERE id=\? AND status IN \('pending','need_fix'\) AND updated_at=\?/);
  assert.deepEqual(guarded.params, ['Thiếu thông tin',5,17,'2026-11-20 08:00:00']);
  assert.match(unguarded.sql, /WHERE id=\? AND status IN \('pending','need_fix'\) AND updated_at=\?$/);
  assert.deepEqual(unguarded.params, ['Thiếu thông tin',5,17,row.updated_at]);
  assert.match(repository,/action === 'reject' \? buildRejectionScopeQuery : buildApprovalScopeQuery/);
  assert.match(repository,/return qRows\(connection, sql, params\)/);
  assert.match(reject, /assertRejectedTempTransition\(updateResult, row\)/);
  assert.match(source, /!hasExactlyOneAffectedRow\(updateResult\)/);
  assert.match(source, /Number\(result\?\.affectedRows \|\| 0\) === 1/);
  assert.match(reject, /await rollbackReviewTransaction\(connection, error\)/);
  assert.match(reject, /await commit\(connection\)/);
});

test('stale or inaccessible selection and changed versions return public 409', () => {
  assert.match(reject, /assertApprovalSelectionVisible\(rows, reportIds\)/);
  assert.match(reject, /assertApprovalSelectionVersions\(rows, expectedById\)/);
  assert.throws(
    () => assertApprovalSelectionVisible([{id:9}], [9,3]),
    error => error.status===409 && error.code==='APPROVAL_SELECTION_STALE'
      && error.isPublic===true && error.details.missing_ids.join(',')==='3',
  );
  assert.throws(
    () => assertApprovalSelectionVersions([{id:9,updated_at:'2026-11-20T09:00:00Z'}],
      new Map([[9,'2026-11-20T08:00:00Z']])),
    error => error.status===409 && error.code==='TEMP_REPORT_VERSION_CONFLICT'
      && error.isPublic===true,
  );
  assert.match(reject, /assertRejectedTempTransition\(updateResult, row\)/);
});
