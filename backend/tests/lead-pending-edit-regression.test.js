const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backend = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(
    path.join(backend, relativePath),
    "utf8"
  );
}

test("Lead pending edit does not require proposal ownership", () => {
  const routes = read("routes/productionTempRoutes.js");

  const editRoute = routes
    .split('router.put("/:id",')[1]
    ?.split("controller.updateTempReport);")[0];

  assert.ok(editRoute, "Pending edit route must exist");

  assert.doesNotMatch(
    editRoute,
    /proposer_user_id/,
    "Pending report edit must not use proposal ownership"
  );

  assert.match(editRoute, /authMiddleware/);
  assert.match(editRoute, /denyAdminOpsPendingEdit/);
  assert.match(editRoute, /REPORT_PENDING_EDIT/);
  assert.match(editRoute, /notifyWorkerOnTempEdit/);
});

test("Pending edit controller enforces process scope", () => {
  const controller = read(
    "controllers/productionTempManagementController.js"
  );

  const editController = controller
    .split("exports.updateTempReport =")[1];

  assert.ok(editController, "Update controller must exist");

  assert.match(
    editController,
    /assertProcessesScope\(req\.user,\s*\[current\.process_id\]/
  );

  assert.match(
    editController,
    /WORKER_OWNERSHIP_FORBIDDEN/
  );

  assert.match(
    editController,
    /REPORT_PENDING_EDIT/
  );
});

test("Lead retains mandatory pending edit permission", () => {
  const permissions = read("services/permissionService.js");

  assert.match(
    permissions,
    /lead:\s*new Set\(\[[^\]]*'REPORT_PENDING_EDIT'/
  );
});