'use strict';
const db = require('../config/db');
const snapshot = require('../data/mau-goc-ktc.json');
const q = () => db.promise();
const norm = (v) => String(v ?? '').trim().toUpperCase();
const codeKey = (p, m) => `${norm(p)}|${norm(m)}`;

async function audit() {
  const expectedMachines = new Set(snapshot.machines.map(m => codeKey(m.process_code, m.machine_code)));
  const expectedWorkers = new Set(snapshot.workers.map(w => norm(w.worker_code)));
  const expectedAssignments = new Set();
  for (const w of snapshot.workers) for (const p of (w.process_codes || [])) {
    expectedAssignments.add(`${norm(w.worker_code)}|${norm(p)}`);
  }

  const [machineRows] = await q().query(`SELECT p.process_code, m.machine_code FROM machines m INNER JOIN processes p ON p.id=m.process_id WHERE m.status='active'`);
  const [workerRows] = await q().query(`SELECT worker_code FROM workers WHERE status='active'`);
  const [assignmentRows] = await q().query(`SELECT w.worker_code, p.process_code FROM worker_processes wp INNER JOIN workers w ON w.id=wp.worker_id INNER JOIN processes p ON p.id=wp.process_id`);

  const actualMachines = new Set(machineRows.map(r => codeKey(r.process_code, r.machine_code)));
  const actualWorkers = new Set(workerRows.map(r => norm(r.worker_code)));
  const actualAssignments = new Set(assignmentRows.map(r => `${norm(r.worker_code)}|${norm(r.process_code)}`));

  const diff = {
    missingMachines: [...expectedMachines].filter(x => !actualMachines.has(x)),
    extraMachines: [...actualMachines].filter(x => !expectedMachines.has(x)),
    missingWorkers: [...expectedWorkers].filter(x => !actualWorkers.has(x)),
    extraWorkers: [...actualWorkers].filter(x => !expectedWorkers.has(x)),
    missingAssignments: [...expectedAssignments].filter(x => !actualAssignments.has(x)),
    extraAssignments: [...actualAssignments].filter(x => !expectedAssignments.has(x))
  };
  const result = {
    sourceSha256: snapshot.meta.sha256,
    expected: {
      machines: expectedMachines.size,
      workers: expectedWorkers.size,
      assignments: expectedAssignments.size,
      personnelSourceRows: snapshot.personnel_source?.length || 0,
      productSourceRows: snapshot.product_source?.length || 0,
      unresolvedPersonnelCodes: snapshot.personnel_unresolved?.length || 0
    },
    actual: {
      machines: actualMachines.size,
      workers: actualWorkers.size,
      assignments: actualAssignments.size
    },
    diff,
    unresolvedPersonnel: snapshot.personnel_unresolved || []
  };
  console.log(JSON.stringify(result, null, 2));
  if (Object.values(diff).some(v => v.length)) throw new Error('KTC MASTER DATA RECONCILIATION FAILED');
  console.log('[KTC] MASTER DATA RECONCILIATION PASS');
  return result;
}
if (require.main === module) audit().catch(e => { console.error('[KTC] MASTER DATA RECONCILIATION FAILED:', e.message); process.exitCode = 1; }).finally(() => db.closePool().catch(() => undefined));
module.exports = { audit };
