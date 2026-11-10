"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const routes = fs.readFileSync(path.join(__dirname, "../routes/productionTempRoutes.js"), "utf8");
const start = routes.indexOf('router.post("/edit-proposals/:id/review"');
const end = routes.indexOf('router.delete("/edit-proposals/:id"', start);
assert.ok(start >= 0 && end > start, "proposal review route must exist");
const section = routes.slice(start, end);
const prefix = 'permission("REPORT_APPROVE"), ';
const handlerStart = section.indexOf(prefix);
assert.ok(handlerStart >= 0, "review handler must be registered");
const handlerSource = section.slice(handlerStart + prefix.length, section.lastIndexOf("\n});") + 2);

function harness({ approvalFails = false, updateFails = false, decision = "approve", statusAfter = "approved", postCommitReadFails = false, transitionFails = false, commitFails = false, legacyMachine = false, cacheFails = false, staleMachineRef = false } = {}) {
  const events = [];
  const proposal = { id: 9, report_id: 31, status: "pending", proposed_data: JSON.stringify({ actual_output: 12 }) };
  const connection = { release() { events.push("release"); } };
  const context = {
    proposalDetail: async () => { if (postCommitReadFails && events.includes("commit")) throw new Error("Read failed after commit"); return { ...proposal }; },
    assertProposalAccess: async () => true,
    getConnection: async () => connection,
    beginReadCommittedTransaction: async () => { events.push("begin"); },
    transactionQuery: async (_connection, sql) => {
      if (sql.includes("FOR UPDATE")) return [{ ...proposal }];
      if (sql.includes("NOT EXISTS")) return legacyMachine ? [{ id: 31 }] : [];
      if (sql.includes("LEFT JOIN machines m")) return staleMachineRef ? [{ id: 12 }] : [];
      if (sql.startsWith("UPDATE report_edit_proposals")) return { affectedRows: transitionFails ? 0 : 1 };
      throw new Error("Unexpected SQL: " + sql);
    },
    controller: {
      updateTempReport: async (_req, res) => {
        events.push("update");
        if (updateFails) return res.status(422).json({ success: false, message: "Invalid edit" });
        return res.status(200).json({ success: true });
      },
    },
    atomicApprovalModel: {
      approveSelected: async () => {
        events.push("approve");
        if (approvalFails) throw Object.assign(new Error("Approval failed"), { status: 409 });
      },
    },
    commitTransaction: async () => { events.push("commit"); if (commitFails) throw new Error("Commit failed"); },
    rollbackTransaction: async () => { events.push("rollback"); return { ok: true }; },
    invalidateManagerReportLists: () => { events.push("invalidate"); if (cacheFails) throw new Error("Cache unavailable"); },
    console: { error() {} },
  };
  const handler = vm.runInNewContext("(" + handlerSource + ")", context);
  const req = { params: { id: "9" }, body: { decision, status_after: statusAfter, reason: "Rejected for test" }, user: { id: 1, role: "admin" } };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  return { events, run: async () => { await handler(req, res); return res; } };
}

test("approval failure rolls back edit and does not commit or invalidate cache", async () => {
  const h = harness({ approvalFails: true });
  const res = await h.run();
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.success, false);
  assert.deepEqual(h.events, ["begin", "update", "approve", "rollback", "release"]);
});

test("edit validation failure rolls back before approval", async () => {
  const h = harness({ updateFails: true });
  const res = await h.run();
  assert.equal(res.statusCode, 422);
  assert.deepEqual(h.events, ["begin", "update", "rollback", "release"]);
});

test("successful approval commits before cache invalidation", async () => {
  const h = harness();
  const res = await h.run();
  assert.equal(res.body.success, true);
  assert.deepEqual(h.events, ["begin", "update", "approve", "commit", "invalidate", "release"]);
});

test("rejection commits once without editing or approving report", async () => {
  const h = harness({ decision: "reject" });
  const res = await h.run();
  assert.equal(res.body.success, true);
  assert.deepEqual(h.events, ["begin", "commit", "invalidate", "release"]);
});

test("post-commit read failure still returns success and never rolls back committed edit", async () => {
  const h = harness({ postCommitReadFails: true });
  const res = await h.run();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(h.events, ["begin", "update", "approve", "commit", "invalidate", "release"]);
});

test("proposal CAS conflict rolls back edit and approval", async () => {
  const h = harness({ transitionFails: true });
  const res = await h.run();
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.success, false);
  assert.deepEqual(h.events, ["begin", "update", "approve", "rollback", "release"]);
});

test("legacy machine without lines fails closed and rolls back edit", async () => {
  const h = harness({ legacyMachine: true });
  const res = await h.run();
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "LEGACY_MACHINE_LINE_REQUIRES_REVIEW");
  assert.deepEqual(h.events, ["begin", "update", "rollback", "release"]);
});

test("commit failure is not reported as success", async () => {
  const h = harness({ commitFails: true });
  const res = await h.run();
  assert.equal(res.body.success, false);
  assert.deepEqual(h.events, ["begin", "update", "approve", "commit", "rollback", "release"]);
});

test("accepted pending edit commits without approving the report", async () => {
  const h = harness({ statusAfter: "pending" });
  const res = await h.run();
  assert.equal(res.body.success, true);
  assert.deepEqual(h.events, ["begin", "update", "commit", "invalidate", "release"]);
});

test("cache failure after commit must not turn a successful review into HTTP 500", async () => {
  const h = harness({ cacheFails: true });
  const res = await h.run();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(h.events, ["begin", "update", "approve", "commit", "invalidate", "release"]);
});

test("stale machine reference blocks atomic approval and rolls back", async () => {
  const h = harness({ staleMachineRef: true });
  const res = await h.run();
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "STALE_MACHINE_REFERENCE_REQUIRES_REVIEW");
  assert.deepEqual(h.events, ["begin", "update", "rollback", "release"]);
});
