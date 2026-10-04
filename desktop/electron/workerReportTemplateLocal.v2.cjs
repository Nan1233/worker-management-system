'use strict';

const ExcelJS = require('exceljs');
const fs = require('node:fs/promises');
const path = require('node:path');

const TEMPLATE_NAME = 'Mau_Bao_Cao_Cong_Nhan_DB_day_du_chi_tiet_STT_FIX.xlsx';
const PROCESS_FILE_PREFIXES = Object.freeze({
  CAN: '01_CAN', EP: '02_EP', XLBV: '03_XU_LY_BAVIA', GC: '04_CAT_LONG',
  MAI: '05_MAI', DO: '06_DO', K1: '07_KIEM_1', K2: '08_KIEM_2', SX3: '09_SAN_XUAT_3'
});

let cachedTemplatePath = '';
let cachedTemplateBuffer = null;

const normalize = (value) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'd').replace(/\s+/g, ' ').trim().toLowerCase();
const number = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

const DETAIL_ALIASES = Object.freeze({
  'kqd dap lai': 'kqd', 'kqd tuột': 'kqd', 'kqd dl': 'kqd',
  'vo do long': 'vo cao su', 'vo long': 'vo cao su', 'vcs': 'vo cao su',
  'xuoc do long': 'k xuoc cong gay', 'xuoc long': 'k xuoc cong gay',
  'cong gay': 'k xuoc cong gay', 'xoay': 'cao su xoay',
  'khong dut': 'cat khong dut', 'bavia hut': 'bavia',
  'cao su': 'lcs', 'loi cao su': 'lcs', 'ng kich thuoc': 'kt lon',
  'cat lem': 'cat lem', '5s': '5s', 'hoc viec dao tao': 'hoc viec',
  'di muon ve som': 'di muon ve som'
});

function detailVariants(value) {
  const raw = normalize(value);
  if (!raw) return [];
  const variants = new Set([raw]);
  const compact = raw.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (compact) variants.add(compact);
  const strippedPrefix = compact.replace(/^(ded|def|deduction|defect)[_-]+/, '').replace(/[_-]+db$/, '');
  if (strippedPrefix) variants.add(strippedPrefix);
  const alias = DETAIL_ALIASES[raw] || DETAIL_ALIASES[compact] || DETAIL_ALIASES[strippedPrefix];
  if (alias) variants.add(normalize(alias));
  return [...variants];
}
function canonicalDetailKey(value) {
  return normalize(DETAIL_ALIASES[normalize(value)] || normalize(value));
}

function templateCandidates(appPath) {
  const candidates = [
    path.resolve(appPath || process.cwd(), '..', 'backend', 'templates', TEMPLATE_NAME),
    path.resolve(appPath || process.cwd(), 'backend', 'templates', TEMPLATE_NAME),
    path.resolve(__dirname, '..', '..', 'backend', 'templates', TEMPLATE_NAME),
    path.resolve(process.cwd(), 'backend', 'templates', TEMPLATE_NAME)
  ];
  if (process.resourcesPath) candidates.unshift(path.join(process.resourcesPath, 'templates', TEMPLATE_NAME));
  return [...new Set(candidates)];
}
async function resolveTemplatePath(appPath) {
  for (const candidate of templateCandidates(appPath)) {
    try { await fs.access(candidate); return candidate; } catch (_) {}
  }
  throw Object.assign(new Error(`Không tìm thấy template ${TEMPLATE_NAME}`), { code: 'KTC_WORKER_TEMPLATE_MISSING' });
}
async function getTemplateBuffer(appPath) {
  const templatePath = await resolveTemplatePath(appPath);
  if (cachedTemplateBuffer && cachedTemplatePath === templatePath) return { templatePath, buffer: cachedTemplateBuffer };
  cachedTemplatePath = templatePath;
  cachedTemplateBuffer = await fs.readFile(templatePath);
  return { templatePath, buffer: cachedTemplateBuffer };
}

function cellText(cell) {
  const value = cell?.value;
  if (value && typeof value === 'object') {
    if (value.result != null) return String(value.result);
    if (Array.isArray(value.richText)) return value.richText.map((x) => String(x?.text ?? '')).join('');
  }
  return String(value ?? '');
}
function findHeader(sheet) {
  let best = null;
  for (let r = 1; r <= Math.min(sheet.rowCount, 80); r += 1) {
    const labels = [];
    for (let c = 1; c <= sheet.columnCount; c += 1) {
      const text = normalize(cellText(sheet.getRow(r).getCell(c)));
      if (text) labels.push(text);
    }
    const score = labels.reduce((sum, t) => sum + (t === 'stt' ? 5 : 0)
      + (t.includes('ngay') ? 2 : 0) + (t.includes('ma nv') || t.includes('ma nhan vien') || t.includes('ma so') ? 3 : 0)
      + (t.includes('ho ten') || t === 'ten' ? 3 : 0) + (t === 'ca' ? 2 : 0)
      + (t.includes('may') ? 2 : 0) + (t.includes('thoi gian') ? 2 : 0), 0);
    if (!best || score > best.score) best = { row: r, score };
  }
  if (!best || best.score < 7) throw Object.assign(new Error('Không nhận diện được hàng tiêu đề của template công nhân'), { code: 'KTC_WORKER_TEMPLATE_HEADER_NOT_FOUND' });
  return best.row;
}
function findColumnMap(sheet, headerRow) {
  const map = new Map();
  for (let c = 1; c <= sheet.columnCount; c += 1) {
    const label = normalize(cellText(sheet.getRow(headerRow).getCell(c)));
    if (label) map.set(c, label);
  }
  return map;
}
function findColumn(map, predicates) {
  for (const [column, label] of map.entries()) if (predicates.every((p) => p(label))) return column;
  return null;
}
function pick(map, ...terms) {
  return findColumn(map, terms.map((term) => (label) => label.includes(normalize(term))));
}
function pickExact(map, ...terms) {
  const targets = terms.map(normalize);
  for (const [column, label] of map.entries()) if (targets.includes(label)) return column;
  return null;
}
function asDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function detailItems(report, kind) {
  const keys = kind === 'deduction'
    ? ['deductions', 'deductionDetails', 'deduction_details', 'deductionRows', 'deduction_rows']
    : ['defects', 'defectDetails', 'defect_details', 'defectRows', 'defect_rows'];
  for (const k of keys) if (Array.isArray(report?.[k])) return report[k];
  return [];
}
function detailValue(item, kind) {
  return kind === 'deduction'
    ? number(item?.hours ?? item?.deduction_hours ?? item?.duration_hours ?? item?.time_hours ?? item?.value)
    : number(item?.quantity ?? item?.defect_quantity ?? item?.ng_quantity ?? item?.qty ?? item?.count ?? item?.value);
}
function typeLabel(type, kind) {
  return kind === 'deduction'
    ? (type?.deduction_name || type?.name || type?.deduction_code || type?.code || '')
    : (type?.defect_name || type?.name || type?.defect_code || type?.code || '');
}
function typeKeys(type, kind) {
  if (!type) return [];
  const values = kind === 'deduction'
    ? [type.id, type.code, type.deduction_code, type.name, type.deduction_name]
    : [type.id, type.code, type.defect_code, type.name, type.defect_name];
  return values.filter((v) => v !== null && v !== undefined && String(v) !== '').map(normalize);
}
function itemKeys(item, kind) {
  const values = kind === 'deduction'
    ? [item?.deduction_type_id, item?.deduction_type_code, item?.deduction_code, item?.deduction_type_name, item?.deduction_name, item?.type_code, item?.type_name, item?.code, item?.name]
    : [item?.defect_type_id, item?.defect_type_code, item?.defect_code, item?.defect_type_name, item?.defect_name, item?.type_code, item?.type_name, item?.code, item?.name];
  return values.filter((v) => v !== null && v !== undefined && String(v) !== '').map(normalize);
}
function processTypes(processData, kind) {
  const source = kind === 'deduction' ? processData?.deductionTypes : processData?.defectTypes;
  return (Array.isArray(source) ? source : []).slice().sort((a, b) => number(a?.sort_order) - number(b?.sort_order) || number(a?.id) - number(b?.id));
}
function resolveType(item, processData, kind) {
  const types = processTypes(processData, kind);
  const id = kind === 'deduction' ? item?.deduction_type_id : item?.defect_type_id;
  if (id !== null && id !== undefined && String(id) !== '') {
    const byId = types.find((type) => String(type?.id) === String(id));
    if (byId) return byId;
  }
  const keys = itemKeys(item, kind);
  return types.find((type) => typeKeys(type, kind).some((candidate) => keys.includes(candidate))) || null;
}
function typeCandidates(type, kind) {
  const raw = typeKeys(type, kind).concat(typeLabel(type, kind));
  return [...new Set(raw.flatMap(detailVariants).map(canonicalDetailKey).filter(Boolean))];
}
function detailColumn(map, type, kind) {
  const candidates = typeCandidates(type, kind);
  if (!candidates.length) return null;
  let best = null;
  for (const [column, header] of map.entries()) {
    const headerCandidates = detailVariants(header).map(canonicalDetailKey);
    for (const headerKey of headerCandidates) {
      for (const candidate of candidates) {
        let score = 0;
        if (headerKey === candidate) score = 1000;
        else if (headerKey.includes(candidate) || candidate.includes(headerKey)) score = 700 - Math.abs(headerKey.length - candidate.length);
        if (score > (best?.score ?? -1)) best = { column, score };
      }
    }
  }
  return best?.column || null;
}

function buildColumnContract(map, processData) {
  const cols = {
    stt: pickExact(map, 'stt') || pick(map, 'stt'),
    entryDate: pickExact(map, 'thời gian nhập', 'thoi gian nhap') || pick(map, 'thoi gian nhap'),
    date: pickExact(map, 'ngày sản xuất', 'ngay san xuat', 'ngày làm việc', 'ngay lam viec') || pick(map, 'ngay'),
    workerCode: pickExact(map, 'mã nv', 'ma nv', 'mã nhân viên', 'ma nhan vien') || pick(map, 'ma nv') || pick(map, 'ma nhan vien') || pick(map, 'ma so'),
    workerName: pickExact(map, 'họ tên', 'ho ten', 'tên nv', 'ten nv') || pick(map, 'ho ten') || pick(map, 'ten nv') || pick(map, 'ten'),
    shift: findColumn(map, [(label) => label === 'ca' || label.startsWith('ca ')]),
    operationType: pick(map, 'loai thao tac'),
    operationMode: pick(map, 'che do'),
    machine: pickExact(map, 'số máy', 'so may') || pick(map, 'so may') || pick(map, 'may'),
    product: pickExact(map, 'mã sp', 'ma sp', 'mã sản phẩm', 'ma san pham') || pick(map, 'ma sp') || pick(map, 'ma san pham') || pick(map, 'san pham'),
    training: pick(map, 'hoc viec'),
    standard: pick(map, 'dinh muc'),
    time: pickExact(map, 'tổng thời gian', 'tong thoi gian') || pick(map, 'tong thoi gian') || pick(map, 'thoi gian'),
    actualTime: pickExact(map, 'thời gian thực tế', 'thoi gian thuc te') || pick(map, 'thoi gian thuc te'),
    deductionTotal: pick(map, 'tong thoi gian tru') || pick(map, 'tong tru') || pick(map, 'tru h'),
    ok: pick(map, 'sl ok') || pick(map, 'san pham ok') || pickExact(map, 'ok'),
    ng: pick(map, 'tong ng') || pick(map, 'tong loi') || pickExact(map, 'ng'),
    output: pick(map, 'ket qua san xuat') || pick(map, 'thuc tich') || pick(map, 'san luong') || pickExact(map, 'tt'),
    achievement: pick(map, 'ty le dat') || pick(map, 'ty le thuc tich') || pick(map, 'nang suat') || pick(map, 'achievement'),
    outputPerHour: pick(map, 'sp gio') || pick(map, 'san pham gio'),
    ngRate: pick(map, 'ty le ng'),
    status: pick(map, 'trang thai'),
    note: pick(map, 'ghi chu'),
    id: pickExact(map, 'id')
  };
  const deductions = processTypes(processData, 'deduction').map((type) => ({ type, column: detailColumn(map, type, 'deduction') })).filter((x) => x.column);
  const defects = processTypes(processData, 'defect').map((type) => ({ type, column: detailColumn(map, type, 'defect') })).filter((x) => x.column);
  return { cols, deductions, defects };
}

function buildDetailValueMap(report, processData, kind) {
  const values = new Map();
  for (const item of detailItems(report, kind)) {
    const value = detailValue(item, kind);
    if (!value) continue;
    const type = resolveType(item, processData, kind);
    const rawKeys = type ? typeKeys(type, kind) : itemKeys(item, kind);
    const candidates = new Set(rawKeys.flatMap(detailVariants).map(canonicalDetailKey).filter(Boolean));
    if (type) for (const candidate of typeCandidates(type, kind)) candidates.add(candidate);
    for (const candidate of candidates) values.set(candidate, (values.get(candidate) || 0) + value);
  }
  return values;
}
function valueForType(values, type, kind) {
  for (const candidate of typeCandidates(type, kind)) if (values.has(candidate)) return values.get(candidate);
  return 0;
}
function writeValue(row, column, value) { if (column) row.getCell(column).value = value == null ? null : value; }
function clearDataRows(sheet, startRow, count, columnCount) {
  for (let r = startRow; r < startRow + count; r += 1) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= columnCount; c += 1) {
      const cell = row.getCell(c);
      if (!(typeof cell.value === 'string' && cell.value.startsWith('='))) cell.value = null;
    }
  }
}

function applyReportRow(row, report, contract, processData, index) {
  const set = (column, value) => writeValue(row, column, value);
  set(contract.cols.stt, index + 1);
  set(contract.cols.entryDate, asDate(report.entry_date || report.created_at));
  set(contract.cols.date, asDate(report.work_date || report.entry_date));
  set(contract.cols.workerCode, report.worker_code);
  set(contract.cols.workerName, report.full_name || report.worker_name || report.name);
  set(contract.cols.shift, report.shift);
  set(contract.cols.operationType, report.operation_type);
  set(contract.cols.operationMode, report.operation_mode);
  set(contract.cols.machine, report.machine_no ?? report.machine_code ?? report.machine);
  set(contract.cols.product, report.product_name || report.product_code);
  set(contract.cols.training, number(report.training_percent));
  set(contract.cols.standard, number(report.standard_output));
  set(contract.cols.time, number(report.total_time ?? report.actual_time));
  if (contract.cols.actualTime && contract.cols.actualTime !== contract.cols.time) set(contract.cols.actualTime, number(report.actual_time ?? report.total_time));
  set(contract.cols.deductionTotal, number(report.deduction_time));
  set(contract.cols.ok, number(report.tt_ok ?? report.actual_output));
  set(contract.cols.ng, number(report.tt_ng));
  set(contract.cols.output, number(report.actual_output ?? report.tt_ok));
  set(contract.cols.achievement, number(report.calculationSnapshot?.achievement_rate ?? report.achievement_rate));
  set(contract.cols.outputPerHour, number(report.calculationSnapshot?.actual_per_hour ?? report.actual_output_per_hour));
  set(contract.cols.ngRate, number(report.calculationSnapshot?.ng_rate ?? report.ng_rate));
  set(contract.cols.status, report.status);
  set(contract.cols.note, report.note || report.review_note);
  set(contract.cols.id, Number(report.id) || null);

  const deductionValues = buildDetailValueMap(report, processData, 'deduction');
  for (const item of contract.deductions) set(item.column, valueForType(deductionValues, item.type, 'deduction'));
  const defectValues = buildDetailValueMap(report, processData, 'defect');
  for (const item of contract.defects) set(item.column, valueForType(defectValues, item.type, 'defect'));
}

async function buildWorkerProcessWorkbook({ appPath, processCode, processName, date, processData = {} }) {
  const { templatePath, buffer: templateBuffer } = await getTemplateBuffer(appPath);
  const reports = Array.isArray(processData?.reports) ? [...processData.reports] : [];
  const [year, month] = String(date).slice(0, 7).split('-');
  const code = String(processCode || '').toUpperCase();
  const prefix = PROCESS_FILE_PREFIXES[code] || code || 'PROCESS';
  const fileName = `${prefix}_${month}-${year}.xlsx`;
  if (reports.length === 0) return { buffer: templateBuffer, fileName, processCode: code, processName: processName || processCode, reportCount: 0, templateFile: TEMPLATE_NAME, templatePath, templateSheet: null, headerRow: null, dataStartRow: null };

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);
  const sheet = workbook.worksheets.find((item) => item.state !== 'hidden') || workbook.worksheets[0];
  if (!sheet) throw new Error('Template công nhân không có worksheet.');
  const headerRow = findHeader(sheet);
  const columnMap = findColumnMap(sheet, headerRow);
  const contract = buildColumnContract(columnMap, processData);
  reports.sort((a, b) => String(a?.work_date || '').localeCompare(String(b?.work_date || '')) || number(a?.id) - number(b?.id));

  const dataStartRow = findDataStartRow(sheet, headerRow);
  const sourceRow = sheet.getRow(dataStartRow);
  const requiredEndRow = dataStartRow + reports.length - 1;
  for (let r = dataStartRow; r <= requiredEndRow; r += 1) {
    const row = sheet.getRow(r);
    if (r !== dataStartRow) cloneRowStyle(sheet, sourceRow, row);
    applyReportRow(row, reports[r - dataStartRow], contract, processData, r - dataStartRow);
  }
  const clearCount = Math.max(0, sheet.rowCount - (dataStartRow + reports.length) + 1);
  clearDataRows(sheet, dataStartRow + reports.length, clearCount, sheet.columnCount);
  workbook.calculation = { fullCalcOnLoad: true, forceFullCalc: true, calcMode: 'auto' };
  const outputBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer: outputBuffer, fileName, processCode: code, processName: processName || processCode, reportCount: reports.length, templateFile: TEMPLATE_NAME, templatePath, templateSheet: sheet.name, headerRow, dataStartRow };
}

module.exports = { TEMPLATE_NAME, PROCESS_FILE_PREFIXES, buildWorkerProcessWorkbook };
