const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createCurrentWorkerProfileLoader
} = require("../services/currentWorkerProfileService");

test("current worker loader returns only active assigned processes", async () => {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("FROM workers w")) {
      return [{
        worker_id: 12,
        user_id: 7,
        worker_code: "599",
        full_name: "Công nhân thử nghiệm",
        status: "active"
      }];
    }
    if (sql.includes("FROM worker_processes wp")) {
      return [
        { id: 1, code: "GC", name: "Gia công" },
        { id: 3, code: "MAI", name: "Mài" }
      ];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const load = createCurrentWorkerProfileLoader({ query });
  const profile = await load(7);

  assert.deepEqual(profile.processes, [
    { id: 1, code: "GC", name: "Gia công" },
    { id: 3, code: "MAI", name: "Mài" }
  ]);
  assert.equal(profile.process_ids, "1,3");
  assert.equal(profile.process_codes, "GC,MAI");
  assert.equal(profile.process_names, "Gia công, Mài");
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /w\.user_id = \?/);
  assert.match(calls[0].sql, /w\.status = 'active'/);
  assert.match(calls[0].sql, /u\.status = 'active'/);
  assert.doesNotMatch(calls[0].sql, /GROUP_CONCAT/);
});

test("current worker loader returns null for inactive or missing profile", async () => {
  const load = createCurrentWorkerProfileLoader({ query: async () => [] });
  assert.equal(await load(7), null);
});

test("worker profile loader resolves a profile by worker_id with the same process structure", async () => {
  const { createWorkerProfileLoader } = require("../services/currentWorkerProfileService");
  const query = async (sql, params) => {
    if (sql.includes("WHERE w.id = ?")) {
      assert.deepEqual(params, [12]);
      return [{ worker_id: 12, user_id: 7, worker_code: "599", status: "active", user_status: "active" }];
    }
    if (sql.includes("FROM worker_processes wp")) {
      return [{ id: 1, code: "GC", name: "Gia công" }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const loader = createWorkerProfileLoader({ query });
  const profile = await loader.loadByWorkerId(12, { activeOnly: false });
  assert.equal(profile.worker_id, 12);
  assert.deepEqual(profile.processes, [{ id: 1, code: "GC", name: "Gia công" }]);
  assert.equal(profile.process_codes, "GC");
});
