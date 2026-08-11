const ExcelJS = require('exceljs');
const path = require('node:path');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const asText = (value) => String(value ?? '').trim();
const asNumber = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'object' && value.result !== undefined) return asNumber(value.result);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const asInteger = (value) => Math.round(asNumber(value));

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

function detailsFromColumns(current, columns, prefix, idField, valueField, integer = false) {
  return columns
    .filter((col) => col.key.startsWith(prefix) && Number.isInteger(Number(col.typeId)) && Number(col.typeId) > 0)
    .map((col) => ({
      [idField]: Number(col.typeId),
      [valueField]: integer ? asInteger(current[col.key]) : asNumber(current[col.key])
    }))
    .filter((item) => item[valueField] > 0);
}

function normalizeEditable(current, columns, operationMode) {
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
  patch.deductions = detailsFromColumns(current, columns, 'deduction:', 'deduction_type_id', 'hours', false);
  patch.defects = detailsFromColumns(current, columns, 'defect:', 'defect_type_id', 'quantity', true);
  return patch;
}

function comparable(patch) {
  return {
    ...patch,
    deductions: [...(patch.deductions || [])].sort((a,b) => a.deduction_type_id - b.deduction_type_id),
    defects: [...(patch.defects || [])].sort((a,b) => a.defect_type_id - b.defect_type_id)
  };
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
    const patch = normalizeEditable(current, meta.config.columns, reportMeta.operationMode);
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
          deductions: reportMeta.original.deductions || [],
          defects: reportMeta.original.defects || []
        };
    if (!same(comparable(patch), comparable(original))) {
      const preview = [];
      const labels = {
        shift: 'Ca', machine_no: 'Máy', product_name: 'Sản phẩm', training_percent: '% học việc',
        actual_time: 'TG thực tế', tt_ok: 'SL OK', note: 'Ghi chú', deductions: 'Trừ giờ', defects: 'NG chi tiết'
      };
      for (const [key, after] of Object.entries(patch)) {
        const before = original[key];
        const left = (key === 'deductions' || key === 'defects') ? comparable({ [key]: before })[key] : before;
        const right = (key === 'deductions' || key === 'defects') ? comparable({ [key]: after })[key] : after;
        if (!same(left, right)) preview.push({ field: key, label: labels[key] || key, before, after });
      }
      changes.push({
        id,
        expected_updated_at: reportMeta.expectedUpdatedAt,
        patch,
        preview,
        source: { file: path.basename(filePath), sheet: meta.config.sheetName, process_code: meta.config.processCode }
      });
    }
  }
  return { managed: true, changes, generatedAt: meta.config.generatedAt, yearMonth: meta.config.yearMonth || null };
}

module.exports = { readExcelChanges, _private: { parseMeta, normalizeEditable, comparable } };
