const ExcelJS = require('exceljs');
const path = require('node:path');

const asText = (value) => String(value ?? '').trim();
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

function parseMeta(workbook) {
  const metaSheet = workbook.getWorksheet('_KTC_SYNC');
  if (!metaSheet) return null;
  let config;
  try { config = JSON.parse(String(metaSheet.getCell('A1').value || '')); } catch { return null; }
  if (!config?.sheetName || !Array.isArray(config?.columns)) return null;
  const reports = new Map();
  for (let row = 3; row <= metaSheet.rowCount; row += 1) {
    const id = Number(metaSheet.getCell(row, 1).value);
    if (!Number.isInteger(id) || id <= 0) continue;
    let original = {};
    try { original = JSON.parse(String(metaSheet.getCell(row, 4).value || '{}')); } catch {}
    reports.set(id, {
      expectedUpdatedAt: metaSheet.getCell(row, 2).value || null,
      operationMode: asText(metaSheet.getCell(row, 3).value).toUpperCase(),
      original
    });
  }
  return { config, reports };
}

function currentByKey(sheet, row, columns) {
  const output = {};
  for (const col of columns) output[col.key] = sheet.getCell(row, col.index).value;
  return output;
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

  // For represented columns, Excel is authoritative: zero/blank removes that represented detail.
  const edited = editableColumns
    .map((col) => ({
      [idField]: Number(col.typeId),
      [valueField]: integer ? asInteger(current[col.key]) : asNumber(current[col.key])
    }))
    .filter((item) => item[valueField] > 0);

  return [...preserved, ...edited].sort((a, b) => a[idField] - b[idField]);
}

function normalizeEditable(current, columns, operationMode, original = {}) {
  const trainingRaw = asNumber(current.training);
  const patch = {
    training_percent: trainingRaw >= 0 && trainingRaw <= 1 ? trainingRaw * 100 : trainingRaw,
    note: asText(current.note)
  };
  if (operationMode === 'MACHINE') return patch;
  patch.shift = asText(current.shift);
  patch.machine_no = asText(current.machine) || null;
  patch.product_name = asText(current.product) || null;
  patch.actual_time = asNumber(current.actualTime);
  patch.tt_ok = asInteger(current.ok);
  patch.deductions = mergeEditableDetails(current, columns, 'deduction:', original.deductions, 'deduction_type_id', 'hours', false);
  patch.defects = mergeEditableDetails(current, columns, 'defect:', original.defects, 'defect_type_id', 'quantity', true);
  return patch;
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

async function readExcelChanges(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const meta = parseMeta(workbook);
  if (!meta) return { managed: false, changes: [] };
  const sheet = workbook.getWorksheet(meta.config.sheetName);
  if (!sheet) throw new Error(`Không tìm thấy sheet dữ liệu ${meta.config.sheetName}`);
  const idColumn = meta.config.columns.find((col) => col.key === 'id');
  if (!idColumn) throw new Error('Workbook thiếu cột ID để đồng bộ DB');

  const rowById = new Map();
  for (let row = 6; row <= sheet.rowCount; row += 1) {
    const id = Number(sheet.getCell(row, idColumn.index).value);
    if (Number.isInteger(id) && id > 0) rowById.set(id, row);
  }

  const changes = [];
  for (const [id, reportMeta] of meta.reports.entries()) {
    const row = rowById.get(id);
    if (!row) continue; // Không dùng Excel để xóa báo cáo; xóa phải qua UI có audit reason.
    const current = currentByKey(sheet, row, meta.config.columns);
    const original = reportMeta.operationMode === 'MACHINE'
      ? { training_percent: Number(reportMeta.original.training_percent ?? 100), note: asText(reportMeta.original.note) }
      : {
          shift: asText(reportMeta.original.shift),
          machine_no: asText(reportMeta.original.machine_no) || null,
          product_name: asText(reportMeta.original.product_name) || null,
          training_percent: Number(reportMeta.original.training_percent ?? 100),
          actual_time: asNumber(reportMeta.original.actual_time),
          tt_ok: asInteger(reportMeta.original.tt_ok),
          note: asText(reportMeta.original.note),
          deductions: normalizeDetailList(reportMeta.original.deductions, 'deduction_type_id', 'hours', false),
          defects: normalizeDetailList(reportMeta.original.defects, 'defect_type_id', 'quantity', true)
        };
    const candidate = normalizeEditable(current, meta.config.columns, reportMeta.operationMode, original);

    const preview = [];
    const changedPatch = {};
    const labels = {
      shift: 'Ca', machine_no: 'Máy', product_name: 'Sản phẩm', training_percent: '% học việc',
      actual_time: 'TG thực tế', tt_ok: 'SL OK', note: 'Ghi chú', deductions: 'Trừ giờ', defects: 'NG chi tiết'
    };
    for (const [key, afterRaw] of Object.entries(candidate)) {
      const beforeRaw = original[key];
      const before = fieldValue(key, beforeRaw);
      const after = fieldValue(key, afterRaw);
      if (!same(before, after)) {
        changedPatch[key] = afterRaw;
        preview.push({ field: key, label: labels[key] || key, before, after });
      }
    }

    // Never send a report merely because object key order / enriched metadata differs.
    // A report is editable only when at least one concrete field has a real before -> after diff.
    if (!preview.length) continue;

    changes.push({
      id,
      expected_updated_at: reportMeta.expectedUpdatedAt,
      patch: changedPatch,
      preview,
      source: { file: path.basename(filePath), sheet: meta.config.sheetName, process_code: meta.config.processCode }
    });
  }
  return { managed: true, changes, generatedAt: meta.config.generatedAt, yearMonth: meta.config.yearMonth || null };
}

module.exports = {
  readExcelChanges,
  _private: {
    parseMeta,
    normalizeEditable,
    comparable,
    stableValue,
    same,
    normalizeDetailList,
    mergeEditableDetails,
    fieldValue
  }
};
