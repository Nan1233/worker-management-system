'use strict';

// Combine machine-level deductions while retaining the original ID/code/name
// matching priority and display fields from the first matching detail.
function deductionKey(item) {
  return Number(item?.deduction_type_id)
    || String(item?.deduction_code || item?.deduction_type_code || item?.deduction_name || '');
}

function existingDeductionKey(item) {
  return String(item.deduction_type_id || item.deduction_code || item.deduction_name);
}

function appendGiaCongMachineDeductions(deductions, lineDeductions) {
  for (const item of lineDeductions) {
    const hours = Math.max(0, Number(item?.hours) || 0);
    if (!hours) continue;

    const key = String(deductionKey(item));
    const existing = deductions.find((entry) => existingDeductionKey(entry) === key);
    if (existing) {
      existing.hours += hours;
      continue;
    }

    deductions.push({
      deduction_type_id: Number(item?.deduction_type_id) || undefined,
      deduction_code: String(item?.deduction_code || item?.deduction_type_code || '').trim(),
      deduction_name: String(item?.deduction_name || '').trim(),
      hours
    });
  }
  return deductions;
}

module.exports = { appendGiaCongMachineDeductions };
