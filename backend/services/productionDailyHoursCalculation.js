'use strict';

// Pure calculation for the optional daily working-hours policy.
// GC and Mài can run machines in parallel; only the highest aggregate
// worker participation time for a machine counts toward the daily limit.
function incomingDailyWorkHours(data, machineLines = [], processCode = '') {
  const isParallelMachineProcess = processCode === 'GC' || processCode === 'MAI';
  if (!isParallelMachineProcess || !machineLines.length) {
    return Number(data?.actual_time) || 0;
  }

  const netHoursByMachine = new Map();
  for (const line of machineLines) {
    const machine = String(line?.machine_code || line?.machine_id || '')
      .trim().toUpperCase() || '__UNKNOWN__';
    const grossHours = Number(line?.machine_time_hours ?? line?.actual_time_hours) || 0;
    const deductionHours = Number(line?.deduction_time_hours ?? line?.deduction_time ?? 0) || 0;
    const netHours = Math.max(0, grossHours - deductionHours);
    netHoursByMachine.set(machine, (netHoursByMachine.get(machine) || 0) + netHours);
  }

  return Math.max(0, ...netHoursByMachine.values());
}

module.exports = { incomingDailyWorkHours };
