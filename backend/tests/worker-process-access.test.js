const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("current worker uses full authentication and returns structured active processes", () => {
  const routes = read("routes/workerRoutes.js");
  const controller = read("controllers/workerController.js");
  assert.match(routes, /"\/me"[\s\S]*verifyToken[\s\S]*getCurrentWorker/);
  assert.match(controller, /loadCurrentWorkerProfile\(loginUserId\)/);
  const service = read("services/currentWorkerProfileService.js");
  assert.match(service, /processes,/);
  assert.match(service, /p\.status = 'active'/);
  assert.match(service, /w\.status = 'active'/);
  assert.match(service, /u\.status = 'active'/);
});

test("defect and deduction catalogues require authentication", () => {
  for (const file of ["routes/defectRoutes.js", "routes/deductionRoutes.js"]) {
    const source = read(file);
    assert.match(source, /authMiddleware/);
    assert.match(source, /verifyToken/);
  }
});

test("admin process assignment clears worker profile cache", () => {
  const source = read("controllers/adminMasterController.js");
  assert.match(source, /clearWorkerProfile\(workers\[0\]\.user_id\)/);
  assert.match(source, /status='active'/);
});

test("worker detail and training routes consistently use worker_id", () => {
  const routes = read("routes/workerRoutes.js");
  const controller = read("controllers/workerController.js");
  assert.match(routes, /"\/:workerId"[\s\S]*getWorkerById/);
  assert.match(routes, /"\/:workerId\/training-percent"[\s\S]*updateTrainingPercent/);
  assert.match(controller, /req\.params\.workerId/);
  assert.doesNotMatch(controller, /GET WORKER BY USER ID ERROR/);
});
