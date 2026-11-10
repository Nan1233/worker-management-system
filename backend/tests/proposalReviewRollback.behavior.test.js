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

function harness({ approvalFails = false, updateFails = false, decision = "approve", statusAfter = "approved", postCommitReadFails = false } = {}) {
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
      if (sql.includes("NOT EXISTS")) return [];
      if (sql.startsWith("UPDATE report_edit_proposals")) return { affectedRows: 1 };
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
    commitTransaction: async () => { events.push("commit"); },
    rollbackTransaction: async () => { events.push("rollback"); return { ok: true }; },
    invalidateManagerReportLists: () => { events.push("invalidate"); },
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
