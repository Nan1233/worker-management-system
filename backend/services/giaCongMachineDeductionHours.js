'use strict';

// Physical-machine deduction precedence is intentionally a maximum, not a sum.
// Worker-level deduction fields must never be used here.
const calculateMachineLineDeductionHours = ({ line, lineDeductions, legacyMachineDeductionTime = 0 }) => {
  const detailDeductionHours = lineDeductions.reduce(
    (sum, item) => sum + Math.max(0, Number(item?.hours) || 0), 0
  );
  return Math.max(
    0,
    Number(line.deduction_time_hours) || 0,
    (Number(line.adjustment_minutes) || 0) / 60,
    detailDeductionHours,
    legacyMachineDeductionTime
  );
};

module.exports = { calculateMachineLineDeductionHours };
