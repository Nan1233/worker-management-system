const AUTO_MACHINE_NUMBERS = new Set([5, 6, 7, 11]);

function machineNumber(value) {
  const raw = String(value || '').trim().toUpperCase().replace(/[\s_-]+/g, '');
  const match = raw.match(/^(?:MÁY|MAY|MACHINE|M|GC|G|C)?(\d{1,2})$/);
  return match ? Number(match[1]) : null;
}

function grossHours(line) {
  const stored = Number(line?.machine_time_hours);
  if (Number.isFinite(stored) && stored >= 0) return stored;
  return Math.max(0, Number(line?.actual_time_hours) || 0)
    + Math.max(0, Number(line?.deduction_time_hours) || 0);
}

function calculateGcShiftHours(lines) {
  const items = Array.isArray(lines) ? lines : [];
  let sequentialHours = 0;
  let automaticHours = 0;
  for (const line of items) {
    const hours = grossHours(line);
    if (AUTO_MACHINE_NUMBERS.has(machineNumber(line?.machine_code))) {
      automaticHours = Math.max(automaticHours, hours);
    } else {
      sequentialHours += hours;
    }
  }
  return sequentialHours + automaticHours;
}

module.exports = { AUTO_MACHINE_NUMBERS, machineNumber, grossHours, calculateGcShiftHours };
