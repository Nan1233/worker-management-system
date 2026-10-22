const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

function loadApprovalError() {
  const file = path.join(root, "src/utils/approvalError.ts");
  const out = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const m = new Module(file, module); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(out, file);
  return m.exports.describeApprovalError;
}
const axiosError = (status, data, headers = {}, code) => Object.assign(new Error("x"), { isAxiosError: true, code, response: status ? { status, data, headers } : undefined });

test("the pending-review page a manager reaches by clicking a row exposes the physical machine event panel", () => {
  // /manager/report/review (ReportReviewDetail) is what the pending list navigates to; the dead end was that
  // only /manager/report/:id had the panel, so MACHINE_EVENT_REQUIRED could not be resolved from the normal flow.
  const src = read("src/pages/manager/ReportReviewDetail.tsx");
  assert.match(src, /import MachineEventPanel from "\.\/MachineEventPanel"/);
  assert.match(src, /source === "pending" && Array\.isArray\(report\.machine_lines\)/);
  assert.match(src, /<MachineEventPanel[^>]*source=\{source\}/);
  const workspace = read("src/pages/manager/ManagerReportWorkspaceFix.tsx");
  assert.match(workspace, /report\/review\?source=pending/, "pending rows still open ReportReviewDetail");
});

test("every manager approve handler reports status, code and request id instead of a bare message", () => {
  for (const rel of ["src/pages/manager/ReportDetail.tsx", "src/pages/manager/ReportReviewDetail.tsx", "src/pages/manager/SelectedReportsReview.tsx", "src/pages/manager/Reports.tsx"]) {
    assert.match(read(rel), /describeApprovalError\(/, rel);
  }
});

test("describeApprovalError keeps the server message and adds HTTP status, code and short request id", () => {
  const describe = loadApprovalError();
  const msg = describe(axiosError(422, { code: "MACHINE_EVENT_REQUIRED", message: "Máy M11 cần production event" }, { "x-request-id": "abcdef12-3456" }), "fallback");
  assert.match(msg, /^Máy M11 cần production event/);
  assert.match(msg, /Production event máy dùng chung/);
  assert.match(msg, /\[HTTP 422 · MACHINE_EVENT_REQUIRED · ref abcdef12\]$/);
  assert.equal(describe(axiosError(400, { message: "Không thể duyệt báo cáo", requestId: "98765432-aaaa" }), "f"), "Không thể duyệt báo cáo [HTTP 400 · ref 98765432]", "request id from the JSON body");
  assert.equal(describe(axiosError(400, { message: "Không thể duyệt báo cáo" }), "f"), "Không thể duyệt báo cáo [HTTP 400]");
  // gateway timeouts return an HTML/empty body: the fallback is used but the status still identifies the cause
  assert.equal(describe(axiosError(524, "<html>timeout</html>"), "Không thể duyệt báo cáo."), "Không thể duyệt báo cáo. [HTTP 524]");
  assert.match(describe(axiosError(0, null, {}, "ECONNABORTED"), "f"), /chưa được xác nhận/);
  assert.match(describe(axiosError(0, null), "f"), /Không thể kết nối máy chủ/);
});

test("pending list drawer sends the manager to the event-capable detail page when a shared machine event is missing", () => {
  const src = read("src/pages/manager/Reports.tsx");
  assert.match(src, /code === "MACHINE_EVENT_REQUIRED"\) navigate\(`\$\{basePath\}\/report\/\$\{Number\(detail\.id\)\}\?source=pending`\)/);
});
