"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("proposal review locks the proposal and commits only after the final transition", () => {
  const routes = source("routes/productionTempRoutes.js");
  const start = routes.indexOf('router.post("/edit-proposals/:id/review"');
  const end = routes.indexOf('router.delete("/edit-proposals/:id"', start);
  assert.ok(start >= 0 && end > start, "review endpoint must exist");
  const review = routes.slice(start, end);
  const lock = review.indexOf("FROM report_edit_proposals WHERE id=? FOR UPDATE");
  const update = review.indexOf("await controller.updateTempReport(");
  const approve = review.indexOf("await atomicApprovalModel.approveSelected(");
  const transition = review.indexOf("const transitioned = await transactionQuery(");
  const finalCommit = review.lastIndexOf("await commitTransaction(connection)");
  assert.ok(lock >= 0 && update > lock && approve > update && transition > approve && finalCommit > transition);
  assert.match(review, /await rollbackTransaction\(connection\)/);
  assert.match(review, /if \(connection\) connection\.release\(\)/);
  assert.match(review, /postCommitCallbacks/);
  assert.match(review, /LEGACY_MACHINE_LINE_REQUIRES_REVIEW/);
  assert.equal(review.includes("await ProductionTemp.approveSelected("), false);
});

test("update and approval models must not commit or release a caller-owned transaction", () => {
  const update = source("models/productionTempUpdateModel.js");
  const approval = source("models/productionTempApprovalModel.js");
  assert.match(update, /const ownsTransaction = !options\.connection/);
  assert.match(update, /if \(ownsTransaction\) await commit\(connection\)/);
  assert.match(update, /if \(ownsTransaction\) connection\.release\(\)/);
  assert.match(approval, /const ownsTransaction = !options\.connection/);
  assert.match(approval, /if \(ownsTransaction\) await beginTransaction\(connection\)/);
  assert.match(approval, /if \(ownsTransaction\) await rollbackReviewTransaction\(connection, error\)/);
  assert.match(approval, /if \(ownsTransaction\) connection\.release\(\)/);
  assert.match(approval, /options\.postCommitCallbacks\.push\(/);
});

test("controller passes transaction connection and proposal writes guard pending status", () => {
  const controller = source("controllers/productionTempManagementController.js");
  const routes = source("routes/productionTempRoutes.js");
  assert.match(controller, /connection: req\.transactionConnection/);
  assert.match(routes, /DELETE FROM report_edit_proposals WHERE id=\? AND status='pending'/);
  assert.match(routes, /UPDATE report_edit_proposals SET reason=\?, proposed_data=\?, updated_at=CURRENT_TIMESTAMP WHERE id=\? AND status='pending'/);
  assert.match(routes, /UPDATE report_edit_proposals SET status=\?, updated_at=CURRENT_TIMESTAMP WHERE id=\? AND status='pending'/);
});

test("proposal review invalidates cached manager lists only after commit", () => {
  const routes = source("routes/productionTempRoutes.js");
  const start = routes.indexOf('router.post("/edit-proposals/:id/review"');
  const end = routes.indexOf('router.delete("/edit-proposals/:id"', start);
  const review = routes.slice(start, end);
  const commits = [...review.matchAll(/await commitTransaction\(connection\);/g)].map((m) => m.index);
  const invalidations = [...review.matchAll(/invalidateManagerReportLists\(\);/g)].map((m) => m.index);
  assert.equal(commits.length, 2, "reject and approve must each commit once");
  assert.equal(invalidations.length, 2, "both outcomes must invalidate manager report caches");
  assert.ok(invalidations[0] > commits[0] && invalidations[1] > commits[1]);
  assert.match(review, /try \{ finalProposal = await proposalDetail\(id\) \|\| finalProposal; \}/);
  assert.match(review, /try \{ rejectedProposal = await proposalDetail\(id\) \|\| rejectedProposal; \}/);
});
