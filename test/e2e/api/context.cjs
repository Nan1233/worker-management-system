'use strict';

// Per-file API context for node:test files of the api/ and db/ layers.

const { before, after } = require('node:test');
const { E2EClient, resolveApiTarget, hasDatabase } = require('../lib/api-client.cjs');
const dbh = require('../lib/db-helpers.cjs');

/**
 * Read-only context: an API target (given or local). `state.dbReason` explains
 * why DB-backed reads must SKIP when the backend has no E2E database.
 */
function useApi(layer = 'api') {
  const state = { target: null, client: null, dbReason: '' };
  before(async () => {
    state.target = await resolveApiTarget({ layer });
    state.client = (label = 'anon') => new E2EClient(state.target.baseUrl, { layer, label });
    state.dbReason = hasDatabase(state.target) ? '' : `API ${state.target.mode} backend has no E2E database (DB_NAME=worker_management_e2e unavailable)`;
  });
  after(async () => { await state.target?.stop(); });
  return state;
}

/**
 * Write context: guarded E2E DB + API on that DB + E2E accounts. When anything
 * is missing `state.reason` is set and tests call t.skip(state.reason).
 */
function useWriteContext(layer, { dayOffset = 0 } = {}) {
  // Each submit gets its own (work_date, shift) slot so the backend's logical
  // duplicate check (worker + date + shift + ...) never links two test reports.
  const state = { ok: false, reason: 'write context not prepared', ctx: null, runId: dbh.newRunId(layer.toUpperCase()), slot: 0 };
  before(async () => {
    const ctx = await dbh.prepareWriteContext({ layer });
    state.ok = ctx.ok;
    state.reason = ctx.reason;
    state.ctx = ctx.ok ? ctx : null;
  });
  after(async () => {
    if (!state.ctx) return;
    try { await dbh.cleanupRun(state.ctx.db, state.runId); } finally { await state.ctx.close(); }
  });
  state.client = (label) => new E2EClient(state.ctx.target.baseUrl, { layer, label });
  state.worker = async () => {
    const client = state.client('worker');
    const login = await client.loginWorker(state.ctx.fixture.workerCode);
    if (login.status !== 200) throw new Error(`worker login failed: HTTP ${login.status}`);
    return client;
  };
  state.manager = async () => {
    const client = state.client('manager');
    const login = await client.loginManager(state.ctx.fixture.managerUsername, state.ctx.fixture.managerPassword);
    if (login.status !== 200) throw new Error(`manager login failed: HTTP ${login.status}`);
    return client;
  };
  /** Submit the 2-machine GC scenario through the API; returns { response, lines, payload }. */
  state.submitGc = async (client, suffix = '') => {
    const { fixture, db } = state.ctx;
    const master = await dbh.gcMasterData(db, fixture.gcProcessId);
    const lines = dbh.gcTwoMachineScenario({ machines: fixture.gcMachines, product: fixture.gcProduct, deductionTypes: master.deductions, defectTypes: master.defects });
    const n = state.slot++;
    const payload = dbh.gcPayload({
      processId: fixture.gcProcessId, lines, runId: `${state.runId}${suffix}`,
      shift: 'ABCD'[n % 4], workDate: dbh.localDate(-(dayOffset + Math.floor(n / 4)))
    });
    const response = await client.req('POST', '/api/production-temp', payload);
    return { response, lines, payload };
  };
  return state;
}

/** Wrap a test body so it SKIPs with the context's reason instead of running. */
const needs = (state, fn) => async (t) => {
  if (!state.ok) return t.skip(state.reason);
  return fn(t);
};

module.exports = { useApi, useWriteContext, needs };
