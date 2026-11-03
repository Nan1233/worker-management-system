'use strict';

function workerMachineLineDefects(line, machineDefectsByLine) {
  const persisted = machineDefectsByLine?.get(Number(line?.id)) || [];
  if (persisted.length) return persisted;

  // defects_json belongs to the worker's machine line. Never read hydrated
  // event details here: physical event defects are not Worker credit.
  const raw = line?.defects_json;
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function resolveReportDefects({ processCode, operationMode, reportDefects, machineLines, machineDefectsByLine }) {
  const reportRows = Array.isArray(reportDefects) ? reportDefects : [];
  if (reportRows.length || String(processCode || '').toUpperCase() !== 'GC'
      || String(operationMode || '').toUpperCase() !== 'MACHINE') {
    return reportRows;
  }

  return (Array.isArray(machineLines) ? machineLines : [])
    .flatMap((line) => workerMachineLineDefects(line, machineDefectsByLine));
}

module.exports = { workerMachineLineDefects, resolveReportDefects };
