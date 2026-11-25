'use strict';

// Side-effect-free normalization for Excel -> DB review. The workbook reader
// owns physical row IDs and _KTC_SYNC validation, but must never write during parsing.
// Preserve all legacy parsing / comparison semantics during this extraction.
const asText = (value) => {
  if (value && typeof value === 'object' && value.result !== undefined) return asText(value.result);
  if (value && typeof value === 'object' && value.text !== undefined) return asText(value.text);
  return String(value ?? '').trim();
};
const asNumber = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'object' && value.result !== undefined) return asNumber(value.result);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const asInteger = (value) => Math.round(asNumber(value));

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

const same = (a, b) => JSON.stringify(stableValue(a)) === JSON.stringify(stableValue(b));

function normalizeOperationMode(value) {
  const text = asText(value).toUpperCase();
  if (['MACHINE','MÁY','MAY'].includes(text)) return 'MACHINE';
  if (['MANUAL','TAY','THỦ CÔNG','THU CONG'].includes(text)) return 'MANUAL';
  return text || null;
}

function normalizeOperationType(value) {
  const text = asText(value).toUpperCase();
  if (['CUT','CẮT','CAT'].includes(text)) return 'CUT';
  if (['NEST','LỒNG','LONG'].includes(text)) return 'NEST';
  return text || null;
}


function excelDateToIso(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y=value.getUTCFullYear(), m=String(value.getUTCMonth()+1).padStart(2,'0'), d=String(value.getUTCDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  const text=asText(value);
  let m=text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m=text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function detailColumns(columns, prefix) {
  return columns.filter((col) => col.key.startsWith(prefix) && Number.isInteger(Number(col.typeId)) && Number(col.typeId) > 0);
}

function normalizeDetailList(items, idField, valueField, integer = false) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      [idField]: Number(item?.[idField]),
      [valueField]: integer ? asInteger(item?.[valueField]) : asNumber(item?.[valueField])
    }))
    .filter((item) => Number.isInteger(item[idField]) && item[idField] > 0 && item[valueField] > 0)
    .sort((a, b) => a[idField] - b[idField]);
}

function mergeEditableDetails(current, columns, prefix, originalItems, idField, valueField, integer = false) {
  const editableColumns = detailColumns(columns, prefix);
  const editableIds = new Set(editableColumns.map((col) => Number(col.typeId)));

  // Preserve DB details that are NOT represented by a column in this workbook.
  // Missing Excel columns mean "not editable here", not "delete from DB".
  const preserved = normalizeDetailList(originalItems, idField, valueField, integer)
    .filter((item) => !editableIds.has(item[idField]));

  // Invalid cells must not silently become zero and erase approved NG/deductions.
  // Only a truly blank cell or numeric zero explicitly clears a mapped detail.
  const edited = editableColumns
    .map((col) => {
      const raw = current[col.key];
      if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return null;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) {
        const error = new Error('Giá trị NG / trừ giờ trong Excel không hợp lệ. Hãy nhập số không âm đúng định dạng.');
        error.code = 'EXCEL_SYNC_INVALID_DETAIL_VALUE';
        error.details = { column: col.key, value: String(raw) };
        throw error;
      }
      return { [idField]: Number(col.typeId), [valueField]: value };
    })
    .filter((item) => item && item[valueField] > 0);

  return [...preserved, ...edited].sort((a, b) => a[idField] - b[idField]);
}

function normalizeEditable(current, columns, operationMode, original = {}) {
  const rawTraining = current.training;
  const trainingRaw = rawTraining == null || (typeof rawTraining === 'string' && !rawTraining.trim()) ? null : Number(rawTraining?.result ?? rawTraining);
  if (trainingRaw !== null && (!Number.isFinite(trainingRaw) || trainingRaw < 0 || trainingRaw > 100)) {
    throw Object.assign(new Error('Giá trị % học việc trong Excel không hợp lệ.'),{code:'EXCEL_SYNC_INVALID_TRAINING'});
  }
  // Excel Import/Sync phải so sánh cùng một contract field cho cả TAY và MÁY.
  // Trước đây MACHINE return sớm nên thay đổi SL OK / TG thực tế / SP / NG / trừ giờ
  // không bao giờ được phát hiện và Import Center báo sai "không có thay đổi".
  return {
    work_date: excelDateToIso(current.workDate),
    shift: asText(current.shift),
    operation_type: normalizeOperationType(current.operationType),
    operation_mode: normalizeOperationMode(current.operationMode) || operationMode || null,
    machine_no: asText(current.machine) || null,
    product_name: asText(current.product) || null,
    training_percent: trainingRaw === null ? original.training_percent ?? null : (trainingRaw <= 1 ? trainingRaw * 100 : trainingRaw),
    actual_time: asNumber(current.actualTime),
    tt_ok: asInteger(current.ok),
    note: asText(current.note),
    deductions: mergeEditableDetails(current, columns, 'deduction:', original.deductions, 'deduction_type_id', 'hours', false),
    defects: mergeEditableDetails(current, columns, 'defect:', original.defects, 'defect_type_id', 'quantity', true)
  };
}

function comparable(patch) {
  const output = { ...patch };
  if (Object.prototype.hasOwnProperty.call(output, 'deductions')) {
    output.deductions = normalizeDetailList(output.deductions, 'deduction_type_id', 'hours', false);
  }
  if (Object.prototype.hasOwnProperty.call(output, 'defects')) {
    output.defects = normalizeDetailList(output.defects, 'defect_type_id', 'quantity', true);
  }
  return stableValue(output);
}

function fieldValue(key, value) {
  if (key === 'deductions') return normalizeDetailList(value, 'deduction_type_id', 'hours', false);
  if (key === 'defects') return normalizeDetailList(value, 'defect_type_id', 'quantity', true);
  return value;
}


module.exports = {
  asText,
  asNumber,
  asInteger,
  stableValue,
  same,
  normalizeOperationMode,
  normalizeOperationType,
  excelDateToIso,
  detailColumns,
  normalizeDetailList,
  mergeEditableDetails,
  normalizeEditable,
  comparable,
  fieldValue,
};
