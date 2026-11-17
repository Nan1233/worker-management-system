'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('async function recordApprovedTempVersion(');
const end = source.indexOf('module.exports = {', start);
assert.ok(start >= 0 && end > start);

function harness({ loadError = null, versionError = null } = {}) {
  const events = [], connection = { transaction: true };
  const ctx = {
    AuditService: {
      loadTempReportSnapshot: async (id, conn, options) => {
        events.push({ step: 'load', id, conn, options });
        if (loadError) throw loadError;
        return { id, saved: true };
      },
      createReportVersion: async (payload, conn) => {
        events.push({ step: 'version', payload, conn });
        if (versionError) throw versionError;
      },
    },
    buildApprovedTempSnapshotOptions: (item, cache) =>
      cache.has(Number(item.id)) ? { machineLines: cache.get(Number(item.id)) } : null,
    buildApprovedTempReportVersion: (item, id, reviewer, snapshot) =>
      ({ reportType: 'temp', reportId: item.id, approvedId: id, reviewer, snapshot }),
    buildRejectedReportVersion: (item, snapshot, reason, reviewer) =>
      ({ reportType: 'temp', reportId: item.id, reason, reviewer, snapshot }),
  };
  vm.runInNewContext(source.slice(start, end), ctx);
  return {
    approve: vm.runInNewContext('recordApprovedTempVersion', ctx),
    reject: vm.runInNewContext('recordRejectedTempVersion', ctx),
    connection, events,
  };
}

for (const kind of ['approved', 'rejected']) {
  test(kind + ' snapshot load failure propagates without writing an audit version', async () => {
    const failure = new Error('snapshot read failed');
    const h = harness({ loadError: failure });
    const action = kind === 'approved'
      ? h.approve({ id: 7 }, 10, 3, h.connection, new Map())
      : h.reject({ id: 7 }, 'needs correction', 3, h.connection);
    await assert.rejects(action, (error) => error === failure);
    assert.deepEqual(h.events.map((event) => event.step), ['load']);
    assert.strictEqual(h.events[0].conn, h.connection);
  });

  test(kind + ' audit version write failure propagates to transaction owner', async () => {
    const failure = new Error('audit insert failed');
    const h = harness({ versionError: failure });
    const action = kind === 'approved'
      ? h.approve({ id: 7 }, 10, 3, h.connection, new Map([[7, [{ id: 2 }]]]))
      : h.reject({ id: 7 }, 'needs correction', 3, h.connection);
    await assert.rejects(action, (error) => error === failure);
    assert.deepEqual(h.events.map((event) => event.step), ['load', 'version']);
    assert.ok(h.events.every((event) => event.conn === h.connection));
    assert.equal(h.events[1].payload.reportId, 7);
  });
}

test('both approval and rejection catch audit errors and rollback before releasing connection', () => {
  for (const method of ['async approveSelected(', 'async rejectSelected(']) {
    const start = source.indexOf(method);
    const end = source.indexOf('async ', start + method.length);
    const flow = source.slice(start, end < 0 ? undefined : end);
    assert.match(flow, /catch \(error\) \{\s*(?:if \(ownsTransaction\) )?await rollbackReviewTransaction\(connection, error\);\s*throw error;\s*\} finally \{\s*(?:if \(ownsTransaction\) )?connection\.release\(\)/);
  }
});
