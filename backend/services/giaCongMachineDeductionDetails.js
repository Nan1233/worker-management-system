'use strict';

// Combine machine-level deduction details while preserving the original
// identifier priority and first-seen display fields.
const appendGiaCongMachineDeductions = (deductions, lineDeductions) => {
  for (const item of lineDeductions) {
    const key = Number(item?.deduction_type_id) || String(item?.deduction_code || item?.deduction_type_code || item?.deduction_name || '');
    const existing = deductions.find((entry) => String(entry.deduction_type_id || entry.deduction_code || entry.deduction_name) === String(key));
    const hours = Math.max(0, Number(item?.hours) || 0);
    if (!hours) continue;
    if (existing) existing.hours += hours;
    else deductions.push({
      deduction_type_id: Number(item?.deduction_type_id) || undefined,
      deduction_code: String(item?.deduction_code || item?.deduction_type_code || '').trim(),
      deduction_name: String(item?.deduction_name || '').trim(),
      hours
    });
  }
  return deductions;
};

module.exports = { appendGiaCongMachineDeductions };
