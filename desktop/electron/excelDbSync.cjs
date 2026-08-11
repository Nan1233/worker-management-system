const ExcelJS = require('exceljs');
const { EXCEL_SYNC_CONTRACT_VERSION, isExcelMutableField } = require('../../shared/excelSyncContract.cjs');
const path = require('node:path');

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


const GC_HELPER_SHEET = 'TAY MÁY CẮT LỒNG';

function gcHelperRowValue(sheet, row) {
  return {
    helperRow: row,
    sourceRow: asInteger(sheet.getCell(row, 1).value),
    reportId: asInteger(sheet.getCell(row, 2).value),
    workerCode: asText(sheet.getCell(row, 3).value),
    shift: asText(sheet.getCell(row, 4).value),
    product: asText(sheet.getCell(row, 5).value),
    operationType: normalizeOperationType(sheet.getCell(row, 6).value),
    operationMode: normalizeOperationMode(sheet.getCell(row, 7).value),
    machine: asText(sheet.getCell(row, 8).value) || null
  };
}

function parseGcHelperSheet(workbook) {
  const sheet = workbook.getWorksheet(GC_HELPER_SHEET);
  if (!sheet) return { sheet: null, byId: new Map(), bySourceRow: new Map() };
  const byId = new Map();
  const bySourceRow = new Map();
  for (let row = 4; row <= sheet.rowCount; row += 1) {
    const item = gcHelperRowValue(sheet, row);
    if (item.reportId > 0) byId.set(item.reportId, item);
    if (item.sourceRow > 0) bySourceRow.set(item.sourceRow, item);
  }
  return { sheet, byId, bySourceRow };
}

function gcMissingFields(operationType, operationMode, machine) {
  const missing = [];
  if (!['CUT','NEST'].includes(operationType || '')) missing.push('Loại thao tác (CẮT/LỒNG)');
  if (!['MANUAL','MACHINE'].includes(operationMode || '')) missing.push('Chế độ (TAY/MÁY)');
  if (operationMode === 'MACHINE' && !asText(machine)) missing.push('Máy');
  return missing;
}

function helperDisplayType(value) { return value === 'CUT' ? 'CẮT' : value === 'NEST' ? 'LỒNG' : ''; }
function helperDisplayMode(value) { return value === 'MACHINE' ? 'MÁY' : value === 'MANUAL' ? 'TAY' : ''; }

function upsertGcHelperRow(helper, { sourceRow, reportId, workerCode, shift, product, operationType, operationMode, machine }) {
  if (!helper.sheet) return false;
  let item = (reportId > 0 ? helper.byId.get(reportId) : null) || helper.bySourceRow.get(sourceRow);
  let row = item?.helperRow;
  if (!row) row = Math.max(4, helper.sheet.rowCount + 1);
  const currentType = item?.operationType || operationType || null;
  const currentMode = item?.operationMode || operationMode || null;
  const currentMachine = item?.machine || machine || null;
  const missing = gcMissingFields(currentType, currentMode, currentMachine);
  const values = [sourceRow, reportId > 0 ? reportId : '', workerCode, shift, product, helperDisplayType(currentType), helperDisplayMode(currentMode), currentMachine || '', missing.length ? 'THIẾU THÔNG TIN' : 'ĐỦ THÔNG TIN', missing.join(', ')];
  const beforeValues = values.map((_, index) => helper.sheet.getCell(row, index + 1).value);
  values.forEach((value, index) => { helper.sheet.getCell(row, index + 1).value = value; });
  helper.sheet.getCell(row, 6).dataValidation = { type: 'list', allowBlank: true, formulae: ['"CẮT,LỒNG"'] };
  helper.sheet.getCell(row, 7).dataValidation = { type: 'list', allowBlank: true, formulae: ['"TAY,MÁY"'] };
  const updated = gcHelperRowValue(helper.sheet, row);
  if (updated.reportId > 0) helper.byId.set(updated.reportId, updated);
  if (updated.sourceRow > 0) helper.bySourceRow.set(updated.sourceRow, updated);
  return !item || !same(beforeValues, values);
}

function excelDateToIso(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y=value.getFullYear(), m=String(value.getMonth()+1).padStart(2,'0'), d=String(value.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  const text=asText(value);
  let m=text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m=text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function parseMeta(workbook) {
  const metaSheet = workbook.getWorksheet('_KTC_SYNC');
  if (!metaSheet) return null;
  let config;
  try { config = JSON.parse(String(metaSheet.getCell('A1').value || '')); } catch { return null; }
  if (!config?.sheetName || !Array.isArray(config?.columns)) return null;
  if (String(config.version || '') !== EXCEL_SYNC_CONTRACT_VERSION) {
    const error = new Error('File Excel đang dùng contract cũ. Hãy chạy Bước 1: Cập nhật Excel từ DB trước khi cập nhật DB từ Excel.');
    error.code = 'EXCEL_SYNC_CONTRACT_OUTDATED';
    throw error;
  }
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
    work_date: excelDateToIso(current.workDate),
    operation_type: normalizeOperationType(current.operationType),
    operation_mode: normalizeOperationMode(current.operationMode),
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
  const gcHelper = meta.config.processCode === 'GC' ? parseGcHelperSheet(workbook) : null;
  let helperDirty = false;
  const idColumn = meta.config.columns.find((col) => col.key === 'id');
  if (!idColumn) throw new Error('Workbook thiếu cột ID để đồng bộ DB');

  const rowById = new Map();
  const rowDate = new Map();
  let activeDate = null;
  for (let row = 6; row <= sheet.rowCount; row += 1) {
    const first = sheet.getCell(row, 1).value;
    const parsedDate = excelDateToIso(first);
    if (parsedDate && !Number.isInteger(Number(first))) { activeDate = parsedDate; continue; }
    const id = Number(sheet.getCell(row, idColumn.index).value);
    if (Number.isInteger(id) && id > 0) rowById.set(id, row);
    if (activeDate) rowDate.set(row, activeDate);
  }

  const changes = [];
  for (const [id, reportMeta] of meta.reports.entries()) {
    const row = rowById.get(id);
    if (!row) continue; // Không dùng Excel để xóa báo cáo; xóa phải qua UI có audit reason.
    const current = currentByKey(sheet, row, meta.config.columns);
    current.workDate = rowDate.get(row) || null;
    const helperItem = gcHelper ? (gcHelper.byId.get(id) || gcHelper.bySourceRow.get(row)) : null;
    if (helperItem?.operationType) current.operationType = helperDisplayType(helperItem.operationType);
    if (helperItem?.operationMode) current.operationMode = helperDisplayMode(helperItem.operationMode);
    if (helperItem?.machine) current.machine = helperItem.machine;
    const original = reportMeta.operationMode === 'MACHINE'
      ? { work_date: rowDate.get(row) || null, operation_type: normalizeOperationType(reportMeta.original.operation_type), operation_mode: normalizeOperationMode(reportMeta.original.operation_mode), training_percent: Number(reportMeta.original.training_percent ?? 100), note: asText(reportMeta.original.note) }
      : {
          work_date: rowDate.get(row) || null,
          shift: asText(reportMeta.original.shift),
          operation_type: normalizeOperationType(reportMeta.original.operation_type),
          operation_mode: normalizeOperationMode(reportMeta.original.operation_mode),
          machine_no: asText(reportMeta.original.machine_no) || null,
          product_name: asText(reportMeta.original.product_name) || null,
          training_percent: Number(reportMeta.original.training_percent ?? 100),
          actual_time: asNumber(reportMeta.original.actual_time),
          tt_ok: asInteger(reportMeta.original.tt_ok),
          note: asText(reportMeta.original.note),
          deductions: normalizeDetailList(reportMeta.original.deductions, 'deduction_type_id', 'hours', false),
          defects: normalizeDetailList(reportMeta.original.defects, 'defect_type_id', 'quantity', true)
        };
    if (gcHelper) {
      helperDirty = upsertGcHelperRow(gcHelper, { sourceRow: row, reportId: id, workerCode: asText(current.workerCode), shift: asText(current.shift || original.shift), product: asText(current.product || original.product_name), operationType: normalizeOperationType(current.operationType) || normalizeOperationType(original.operation_type), operationMode: normalizeOperationMode(current.operationMode) || normalizeOperationMode(original.operation_mode), machine: asText(current.machine || original.machine_no) || null }) || helperDirty;
    }
    const candidate = normalizeEditable(current, meta.config.columns, normalizeOperationMode(current.operationMode) || reportMeta.operationMode, original);

    const preview = [];
    const changedPatch = {};
    const labels = {
      work_date: 'Ngày báo cáo', shift: 'Ca', operation_type: 'Loại thao tác', operation_mode: 'Chế độ', machine_no: 'Máy', product_name: 'Sản phẩm', training_percent: '% học việc',
      actual_time: 'TG thực tế', tt_ok: 'SL OK', note: 'Ghi chú', deductions: 'Trừ giờ', defects: 'NG chi tiết'
    };
    for (const [key, afterRaw] of Object.entries(candidate)) {
      if (!isExcelMutableField(key)) continue;
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
  // Blank ID + real worker/product data means a manager intentionally added a new Excel row.
  // It is sent as CREATE and the backend remains authoritative for validation/calculation.
  const knownIds = new Set(meta.reports.keys());
  for (let row = 6; row <= sheet.rowCount; row += 1) {
    // Chỉ coi dòng có STT số nguyên dương là dòng báo cáo mới.
    // Điều này loại bỏ dòng ngày, dòng TỔNG CỘNG và các dòng công thức/trang trí.
    const stt = Number(sheet.getCell(row, 1).value);
    if (!Number.isInteger(stt) || stt <= 0) continue;
    const id = Number(sheet.getCell(row, idColumn.index).value);
    if (Number.isInteger(id) && id > 0) continue;
    const current = currentByKey(sheet, row, meta.config.columns);
    const workerCode = asText(current.workerCode);
    const productName = asText(current.product);
    const shift = asText(current.shift);
    if (!workerCode && !productName && !shift) continue;
    if (!workerCode || !productName || !shift) {
      changes.push({
        create: true, id: null, row,
        invalid: true,
        error: 'Dòng mới phải có Mã NV, Ca và Mã SP.',
        preview: [],
        source: { file: path.basename(filePath), sheet: meta.config.sheetName, process_code: meta.config.processCode, row }
      });
      continue;
    }
    const helperItem = gcHelper ? gcHelper.bySourceRow.get(row) : null;
    const operationMode = normalizeOperationMode(helperItem?.operationMode || current.operationMode) || null;
    const operationType = normalizeOperationType(helperItem?.operationType || current.operationType);
    const selectedMachine = asText(helperItem?.machine || current.machine) || null;
    if (meta.config.processCode === 'GC') {
      const missing = gcMissingFields(operationType, operationMode, selectedMachine);
      if (gcHelper) helperDirty = upsertGcHelperRow(gcHelper, { sourceRow: row, reportId: 0, workerCode, shift, product: productName, operationType, operationMode, machine: selectedMachine }) || helperDirty;
      if (missing.length) {
        changes.push({ create: true, id: null, row, invalid: true, error: `Dòng mới CẮT/LỒNG thiếu: ${missing.join(', ')}. Hãy bổ sung trong sheet ${GC_HELPER_SHEET}.`, preview: [
          { field: 'worker_code', label: 'Mã NV', before: null, after: workerCode },
          { field: 'product_name', label: 'Sản phẩm', before: null, after: productName }
        ], source: { file: path.basename(filePath), sheet: meta.config.sheetName, process_code: meta.config.processCode, row } });
        continue;
      }
    }
    const deductions = mergeEditableDetails(current, meta.config.columns, 'deduction:', [], 'deduction_type_id', 'hours', false);
    const defects = mergeEditableDetails(current, meta.config.columns, 'defect:', [], 'defect_type_id', 'quantity', true);
    const trainingRaw = asNumber(current.training);
    const extraData = {};
    for (const col of meta.config.columns.filter((col) => col.key.startsWith('extra:'))) {
      const key = col.key.slice('extra:'.length);
      const value = current[col.key];
      if (value !== null && value !== undefined && asText(value) !== '') extraData[key] = value instanceof Date ? excelDateToIso(value) : value;
    }
    const createData = {
      worker_code: workerCode,
      process_code: meta.config.processCode,
      work_date: rowDate.get(row) || null,
      shift,
      operation_type: operationType,
      operation_mode: operationMode,
      machine_no: selectedMachine,
      product_name: productName,
      training_percent: trainingRaw >= 0 && trainingRaw <= 1 ? trainingRaw * 100 : trainingRaw,
      actual_time: asNumber(current.actualTime),
      tt_ok: asInteger(current.ok),
      note: asText(current.note),
      deductions,
      defects,
      extra_data: extraData
    };
    changes.push({
      create: true,
      id: null,
      row,
      data: createData,
      preview: [
        { field: 'worker_code', label: 'Mã NV', before: null, after: workerCode },
        { field: 'work_date', label: 'Ngày báo cáo', before: null, after: createData.work_date },
        { field: 'shift', label: 'Ca', before: null, after: shift },
        { field: 'operation_type', label: 'Loại thao tác', before: null, after: operationType },
        { field: 'operation_mode', label: 'Chế độ', before: null, after: operationMode },
        { field: 'machine_no', label: 'Máy', before: null, after: createData.machine_no },
        { field: 'product_name', label: 'Sản phẩm', before: null, after: productName },
        { field: 'actual_time', label: 'TG thực tế', before: null, after: createData.actual_time },
        { field: 'tt_ok', label: 'SL OK', before: null, after: createData.tt_ok }
      ].filter((item) => item.after !== null && item.after !== ''),
      source: { file: path.basename(filePath), sheet: meta.config.sheetName, process_code: meta.config.processCode, row }
    });
  }

  let helperUpdated = false;
  let helperUpdateError = null;
  if (helperDirty && gcHelper?.sheet) {
    try { await workbook.xlsx.writeFile(filePath); helperUpdated = true; }
    catch (error) { helperUpdateError = error?.message || 'Không thể ghi sheet TAY MÁY CẮT LỒNG'; }
  }
  return { managed: true, changes, generatedAt: meta.config.generatedAt, yearMonth: meta.config.yearMonth || null, helperUpdated, helperUpdateError };
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
    fieldValue,
    normalizeOperationMode,
    normalizeOperationType,
    excelDateToIso,
    parseGcHelperSheet, gcMissingFields, upsertGcHelperRow
  }
};
