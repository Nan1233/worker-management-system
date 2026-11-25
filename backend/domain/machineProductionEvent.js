'use strict';
const { calculateProductionOutput } = require('../../shared/productionOutput.cjs');

function eventError(status, code, message, details = null) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.isPublic = true;
  if (details) error.details = details;
  return error;
}

function isoDate(value) {
  const text = value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`
    : String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw eventError(422, 'INVALID_WORK_DATE', 'Ngày sản xuất không hợp lệ');
  return text;
}

function normalizeShift(value) {
  const shift = String(value || '').trim();
  if (!shift) throw eventError(422, 'SHIFT_REQUIRED', 'Thiếu ca sản xuất');
  return shift;
}

function positiveHours(value, field = 'machine_time_hours') {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw eventError(422, 'INVALID_MACHINE_TIME', `${field} phải là số dương`);
  return number;
}

function nonNegativeInteger(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || !Number.isInteger(number)) {
    throw eventError(422, 'INVALID_QUANTITY', `${field} phải là số nguyên không âm`);
  }
  return number;
}

function calculateEventPhysical({ physicalOkQuantity, defects, machineTimeHours, standardOutput }) {
  const ok = nonNegativeInteger(physicalOkQuantity || 0, 'physical_ok_quantity');
  // Physical output counts every NG defect, including KQD.
  const output = calculateProductionOutput({ ok, defects });
  return {
    physicalOkQuantity: ok,
    physicalNgQuantity: output.totalNg,
    physicalCountedOutput: output.actualOutput,
    physicalTotalOutput: ok + output.totalNg,
    machineTimeHours: positiveHours(machineTimeHours),
    maximumOutput: Number(standardOutput) * positiveHours(machineTimeHours)
  };
}

module.exports = { eventError, isoDate, normalizeShift, positiveHours, nonNegativeInteger, calculateEventPhysical };
