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

// DB detail name (as entered on the worker form) -> template column header.
// Several DB types may share one template column; their values are summed.
// Encoded GC form catalogue: CAT01-CAT10 (Cắt) and LONG01-LONG08 (Lồng).
// The GC export uses the same complete 18-column CAT/LONG catalogue as the
// data-entry form. normalizeGcDefectHeaders replaces the old 19-column block
// before mapping values, so encoded categories do not create duplicate NG columns.
const GC_FORM_DEFECT_COLUMN_BY_CODE = Object.freeze({
  CAT01: 'CAT01 - Cao su không đứt',
  CAT02: 'CAT02 - Cắt lẹm',
  CAT03: 'CAT03 - Cắt phạm',
  CAT04: 'CAT04 - Cao su ngắn',
  CAT05: 'CAT05 - Cao su dài',
  CAT06: 'CAT06 - Bavia cao su',
  CAT07: 'CAT07 - Phế phẩm chỉnh máy',
  CAT08: 'CAT08 - Lỗi cao su (NCC)',
  CAT09: 'CAT09 - Lẫn cao su',
  CAT10: 'CAT10 - Khác',
  LONG01: 'LONG01 - Không qua dưỡng',
  LONG02: 'LONG02 - Cao su vỡ',
  LONG03: 'LONG03 - Trục xước',
  LONG04: 'LONG04 - Trục gãy, cong',
  LONG05: 'LONG05 - Thiếu cao su',
  LONG06: 'LONG06 - Lẫn trục',
  LONG07: 'LONG07 - Lẫn cao su',
  LONG08: 'LONG08 - Khác'
});

const TEMPLATE_COLUMN_ALIASES = Object.freeze({
  // Trừ H (CAN/EP/XLBV/MAI/DO/K1/K2/SX3 catalogue -> worker template)
  'bat may, xet may, dau gio': 'bat may, xet may',
  'cho hang, het hang': 'cho hang',
  'bao duong': 'bao duong may',
  'ho tro': 'dung may di ho tro',
  '5s, do bui, xi bui, lay bui': '5s',
  'hoc viec': 'hoc viec, dao tao',
  // NG Gia công (LONG/CAT catalogue -> worker template)
  'khong qua duong': 'kqd',
  'cao su vo': 'vo cao su',
  'truc xuoc': 'k xuoc cong gay',
  'truc gay, cong': 'k xuoc cong gay',
  'thieu cao su': 'thieu cao su',
  'lan cao su': 'lan cs',
  'cao su khong dut': 'cat khong dut',
  'cao su ngan': 'chan ngan dai',
  'cao su dai': 'chan ngan dai',
  'bavia cao su': 'bavia',
  'phe pham chinh may': 'ppcm',
  'loi cao su ( ncc )': 'lcs',
  'loi cao su (ncc)': 'lcs',
  // NG other processes
  'rach nguyen vat lieu': 'rach nvl',
  'kich thuoc lon': 'kt lon',
  'kich thuoc nho': 'kt nho'
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
// Excel stores dates without a timezone. Always emit the calendar day as UTC
// midnight so Windows (UTC+7) never shifts 05/09 to 04/09. A timestamp coming
// from the API is read as a Vietnam (UTC+7) calendar day.
function asDate(value) {
  if (!value) return null;
  const text = typeof value === 'string' ? value.trim() : '';
  const plain = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (plain) return new Date(Date.UTC(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3])));
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const vn = new Date(date.getTime() + 7 * 3600 * 1000);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()));
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
function detailScore(header, candidates) {
  let best = 0;
  for (const headerKey of detailVariants(header).map(canonicalDetailKey)) {
    for (const candidate of candidates) {
      let score = 0;
      if (headerKey === candidate) score = 1000;
      else if (candidate.length >= 2 && headerKey.length >= 2
        && (headerKey.includes(candidate) || candidate.includes(headerKey))) {
        score = 700 - Math.abs(headerKey.length - candidate.length);
      }
      if (score > best) best = score;
    }
  }
  return best;
}
function detailColumn(map, type, kind) {
  const candidates = typeCandidates(type, kind);
  if (!candidates.length) return null;
  let best = null;
  for (const [column, header] of map.entries()) {
    const score = detailScore(header, candidates);
    if (score > (best?.score ?? 0)) best = { column, score };
  }
  return best?.column || null;
}

// Assign each DB detail type to at most one template column inside its own
// detail block, and each template column to at most one DB type. Exact header
// matches win before partial matches, so "Chỉnh máy" can never steal
// "Chờ chỉnh máy" and an unmatched type is never written into STT/Máy/Ca.
function encodedGcDefectCode(type) {
  const code = String(type?.defect_code || type?.defect_type_code || type?.code || '').trim().toUpperCase();
  return /^(?:CAT(?:0[1-9]|10)|LONG(?:0[1-8]))$/.test(code) ? code : '';
}

function legacyGcDefectTarget(type, rangeMap, kind) {
  if (kind !== 'defect') return '';
  const hasCanonicalGcHeaders = Object.values(GC_FORM_DEFECT_COLUMN_BY_CODE)
    .every((label) => [...rangeMap.values()].some((header) => normalize(header) === normalize(label)));
  if (!hasCanonicalGcHeaders) return '';
  const name = normalize(typeLabel(type, kind));
  const code = String(type?.defect_code || type?.defect_type_code || type?.code || '').trim().toUpperCase();
  const legacyCodeTargets = {
    DEF_KQD_DB: 'LONG01', KQD: 'LONG01', DEF_VCS_DB: 'LONG02', VCS: 'LONG02'
  };
  if (legacyCodeTargets[code]) return GC_FORM_DEFECT_COLUMN_BY_CODE[legacyCodeTargets[code]];
  const legacyNameTargets = {
    'kqd': 'LONG01', 'kqd database name': 'LONG01',
    'khong qua duong': 'LONG01', 'khong qua duong database name': 'LONG01',
    'vo cao su': 'LONG02', 'vo cao su database name': 'LONG02', 'cao su vo': 'LONG02',
    'cat khong dut': 'CAT01', 'cat khong dut database name': 'CAT01',
    'cat lem': 'CAT02', 'cat pham': 'CAT03',
    'cao su ngan': 'CAT04', 'cao su dai': 'CAT05',
    'bavia': 'CAT06', 'bavia cao su': 'CAT06', 'sot via': 'CAT06',
    'ppcm': 'CAT07', 'phe pham chinh may': 'CAT07',
    'lcs': 'CAT08', 'loi cao su ncc': 'CAT08', 'loi cao su (ncc)': 'CAT08',
    'lan cs': 'CAT09',
    'truc xuoc': 'LONG03', 'truc gay cong': 'LONG04',
    'thieu cao su': 'LONG05', 'lan truc': 'LONG06', 'fure truc': 'LONG06',
    'lan cao su': 'LONG07',
    // Old combined labels cannot be split reliably between the new subcategories;
    // preserve their quantity in the appropriate "Khác" bucket rather than
    // falsely assigning it to one of two distinct encoded defect types.
    'k xuoc cong gay': 'LONG08', 'chan ngan dai': 'CAT10',
    'cao su xoay': 'LONG08', 'bavia cat hut': 'CAT10', 'csh': 'CAT10'
  };
  const targetCode = legacyNameTargets[name];
  return targetCode ? GC_FORM_DEFECT_COLUMN_BY_CODE[targetCode] : '';
}

function assignDetailColumns(rangeMap, types, kind) {
  const usedTypes = new Set();
  const aliasColumns = new Set();
  const assigned = [];
  const headerToColumn = new Map([...rangeMap.entries()].map(([column, header]) => [normalize(header), column]));
  for (const type of types) {
    const encodedCode = kind === 'defect' ? encodedGcDefectCode(type) : '';
    const legacyGcTarget = legacyGcDefectTarget(type, rangeMap, kind);
    const target = encodedCode
      ? GC_FORM_DEFECT_COLUMN_BY_CODE[encodedCode]
      : (legacyGcTarget || TEMPLATE_COLUMN_ALIASES[normalize(typeLabel(type, kind))]);
    const column = target ? headerToColumn.get(normalize(target)) : null;
    if (!column) continue;
    usedTypes.add(type);
    aliasColumns.add(column);
    assigned.push({ type, column });
  }
  // Exact header matches are safe even for encoded form types.
  for (const type of types) {
    if (usedTypes.has(type)) continue;
    const candidates = typeCandidates(type, kind);
    for (const [column, header] of rangeMap.entries()) {
      if (detailScore(header, candidates) >= 1000) {
        usedTypes.add(type);
        aliasColumns.add(column);
        assigned.push({ type, column });
        break;
      }
    }
  }
  const pairs = [];
  for (const type of types) {
    if (usedTypes.has(type)) continue;
    // Do not fuzzy-match CAT/LONG form codes to combined legacy labels such as
    // "Chân ngắn dài" or "K xước cong gãy": that would merge distinct form errors.
    if (kind === 'defect' && encodedGcDefectCode(type)) continue;
    const candidates = typeCandidates(type, kind);
    for (const [column, header] of rangeMap.entries()) {
      if (aliasColumns.has(column)) continue;
      const score = detailScore(header, candidates);
      if (score > 0) pairs.push({ type, column, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score || a.column - b.column);
  const usedColumns = new Set();
  for (const pair of pairs) {
    if (usedTypes.has(pair.type) || usedColumns.has(pair.column)) continue;
    usedTypes.add(pair.type);
    usedColumns.add(pair.column);
    assigned.push({ type: pair.type, column: pair.column });
  }
  // Several processes share the same catalogue names (e.g. "Nghỉ giải lao" in
  // CAN and GC). A type whose label equals an already-placed type reuses that
  // column instead of getting an extra one.
  const columnByLabel = new Map(assigned.map((item) => [normalize(typeLabel(item.type, kind)), item.column]));
  for (const type of types) {
    if (usedTypes.has(type)) continue;
    // Keep encoded CAT/LONG values distinct even when two codes share the
    // same display label (notably CAT10 and LONG08 are both named "Khác").
    if (kind === 'defect' && encodedGcDefectCode(type)) continue;
    const column = columnByLabel.get(normalize(typeLabel(type, kind)));
    if (!column) continue;
    usedTypes.add(type);
    assigned.push({ type, column });
  }
  const unmatchedTypes = types.filter((type) => !usedTypes.has(type));
  const unmatched = unmatchedTypes.map((type) => typeLabel(type, kind));
  assigned.sort((a, b) => a.column - b.column);
  return { assigned, unmatched, unmatchedTypes };
}

function subMap(map, predicate) {
  return new Map([...map.entries()].filter(([column]) => predicate(column)));
}

function buildColumnContract(map, processData) {
  const columns = [...map.keys()].sort((a, b) => a - b);
  const lastColumn = columns.length ? columns[columns.length - 1] : 0;
  const deductionTotal = pickExact(map, 'tổng thời gian trừ giờ', 'tong thoi gian tru gio', 'tổng thời gian trừ', 'tong thoi gian tru')
    || pick(map, 'tong thoi gian tru') || pick(map, 'tong tru') || pick(map, 'tru h');
  const productAnchor = pickExact(map, 'sp', 'mã sp', 'ma sp', 'mã sản phẩm', 'ma san pham', 'sản phẩm', 'san pham');
  const ngTotal = pickExact(map, 'tổng ng', 'tong ng') || pick(map, 'tong ng') || pick(map, 'tong loi');
  const isNonDetailTail = (label) => /^(ty le|ghi chu|trang thai|id$|sp ?\/ ?gio|san pham ?\/ ?gio|nang suat)/.test(label);

  // Detail blocks of the worker template:
  //   Trừ H: columns strictly between "Tổng thời gian trừ giờ" and "SP".
  //   NG:    columns after "Tổng NG" up to the first non-detail summary column.
  const deductionRange = new Set();
  if (deductionTotal && productAnchor && productAnchor > deductionTotal) {
    for (const column of columns) if (column > deductionTotal && column < productAnchor) deductionRange.add(column);
  }
  const defectRange = new Set();
  if (ngTotal) {
    for (const column of columns) {
      if (column <= ngTotal) continue;
      if (isNonDetailTail(map.get(column))) break;
      defectRange.add(column);
    }
  }
  const detailColumns = new Set([...deductionRange, ...defectRange]);
  const base = subMap(map, (column) => !detailColumns.has(column));
  const timeMap = subMap(base, (column) => column !== deductionTotal);

  const cols = {
    stt: pickExact(base, 'stt') || pick(base, 'stt'),
    entryDate: pickExact(base, 'thời gian nhập', 'thoi gian nhap') || pick(base, 'thoi gian nhap'),
    date: pickExact(base, 'ngày sản xuất', 'ngay san xuat', 'ngày làm việc', 'ngay lam viec', 'ngày', 'ngay') || pick(base, 'ngay'),
    workerCode: pickExact(base, 'mã nv', 'ma nv', 'mã nhân viên', 'ma nhan vien') || pick(base, 'ma nv') || pick(base, 'ma nhan vien') || pick(base, 'ma so'),
    workerName: pickExact(base, 'họ tên', 'ho ten', 'tên nv', 'ten nv', 'tên', 'ten') || pick(base, 'ho ten') || pick(base, 'ten nv'),
    shift: findColumn(base, [(label) => label === 'ca' || label.startsWith('ca ')]),
    operationType: pick(base, 'loai thao tac'),
    operationMode: pick(base, 'che do'),
    machine: pickExact(base, 'số máy', 'so may', 'máy', 'may') || pick(base, 'so may'),
    product: productAnchor || pick(base, 'ma sp') || pick(base, 'ma san pham'),
    training: pickExact(base, 'học việc', 'hoc viec', '% học việc', '% hoc viec') || pick(base, 'hoc viec'),
    standard: pick(base, 'dinh muc'),
    time: pickExact(timeMap, 'thời gian làm việc', 'thoi gian lam viec', 'tổng thời gian', 'tong thoi gian')
      || pick(timeMap, 'thoi gian lam viec') || pick(timeMap, 'tong thoi gian'),
    actualTime: pickExact(timeMap, 'thời gian thực tế', 'thoi gian thuc te') || pick(timeMap, 'thoi gian thuc te'),
    deductionTotal,
    ok: pickExact(base, 'ok', 'sl ok') || pick(base, 'sl ok') || pick(base, 'san pham ok'),
    ng: ngTotal || pickExact(base, 'ng'),
    output: pickExact(base, 'tt', 'thực tích', 'thuc tich') || pick(base, 'ket qua san xuat') || pick(base, 'thuc tich') || pick(base, 'san luong'),
    achievement: pick(base, 'ty le dat') || pick(base, 'ty le thuc tich') || pick(base, 'nang suat') || pick(base, 'achievement'),
    outputPerHour: pick(base, 'sp gio') || pick(base, 'san pham gio'),
    ngRate: pick(base, 'ty le ng'),
    status: pick(base, 'trang thai'),
    note: pick(base, 'ghi chu'),
    id: pickExact(base, 'id')
  };

  const deductionMap = deductionRange.size ? subMap(map, (column) => deductionRange.has(column)) : base;
  const defectMap = defectRange.size ? subMap(map, (column) => defectRange.has(column)) : base;
  const deductionResult = assignDetailColumns(deductionMap, processTypes(processData, 'deduction'), 'deduction');
  const defectResult = assignDetailColumns(defectMap, processTypes(processData, 'defect'), 'defect');
  return {
    cols,
    deductions: deductionResult.assigned,
    defects: defectResult.assigned,
    unmatchedDeductionTypes: deductionResult.unmatched,
    unmatchedDefectTypes: defectResult.unmatched,
    unmatchedDeductionTypeObjects: deductionResult.unmatchedTypes,
    unmatchedDefectTypeObjects: defectResult.unmatchedTypes,
    detailColumns: [...detailColumns].sort((a, b) => a - b),
    lastColumn
  };
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

function writeDetailBlock(row, report, processData, assigned, kind) {
  const columnByType = new Map(assigned.map((item) => [item.type, item.column]));
  const sums = new Map(assigned.map((item) => [item.column, 0]));
  for (const item of detailItems(report, kind)) {
    const value = detailValue(item, kind);
    if (!value) continue;
    let column = null;
    const type = resolveType(item, processData, kind);
    if (type) column = columnByType.get(type) || null;
    if (!column) {
      const keys = new Set(itemKeys(item, kind).flatMap(detailVariants).map(canonicalDetailKey));
      const hit = assigned.find((entry) => typeCandidates(entry.type, kind).some((candidate) => keys.has(candidate)));
      column = hit?.column || null;
    }
    if (column) sums.set(column, (sums.get(column) || 0) + value);
  }
  for (const [column, total] of sums.entries()) {
    row.getCell(column).value = total ? Math.round(total * 10000) / 10000 : null;
  }
}

// Submission timestamp kept at Vietnam wall-clock time.
function asDateTime(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const plain = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (plain) return new Date(Date.UTC(+plain[1], +plain[2] - 1, +plain[3], +plain[4], +plain[5], +(plain[6] || 0)));
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + 7 * 3600 * 1000);
}

// Insert one column after `afterColumn` and shift every column reference the
// contract already holds. Lets the export add audit/derived columns without the
// template having to carry them.
function insertContractColumn(sheet, headerRow, contract, afterColumn, header, options = {}) {
  const anchor = Number(afterColumn || 0);
  if (!anchor) return null;
  const column = anchor + 1;
  sheet.spliceColumns(column, 0, []);
  const cell = sheet.getRow(headerRow).getCell(column);
  cell.style = JSON.parse(JSON.stringify(sheet.getRow(headerRow).getCell(anchor).style || {}));
  cell.value = header;
  sheet.getColumn(column).width = options.width || 14;
  if (options.hidden) sheet.getColumn(column).hidden = true;
  const shift = (value) => (Number(value) >= column ? Number(value) + 1 : value);
  for (const key of Object.keys(contract.cols)) if (contract.cols[key]) contract.cols[key] = shift(contract.cols[key]);
  for (const item of contract.deductions) item.column = shift(item.column);
  for (const item of contract.defects) item.column = shift(item.column);
  if (Array.isArray(contract.detailColumns)) contract.detailColumns = contract.detailColumns.map(shift);
  if (contract.lastColumn) contract.lastColumn = shift(contract.lastColumn);
  const previous = contract.shiftColumn;
  contract.shiftColumn = previous ? ((value) => shift(previous(value))) : shift;
  return column;
}

// Hidden submission timestamp right after STT, and a visible "% học việc"
// column between Tên and Máy. Both are derived from the DB, not the template.
function addDerivedColumns(sheet, headerRow, contract) {
  // The current template already carries both columns; only add what is missing.
  const headerKey = (column) => normalize(sheet.getRow(headerRow).getCell(column).value);
  let existingSubmitted = null;
  for (let column = 1; column <= sheet.columnCount; column += 1) {
    if (headerKey(column).startsWith('thoi gian nop')) { existingSubmitted = column; break; }
  }
  if (existingSubmitted) {
    contract.cols.submittedAt = existingSubmitted;
    sheet.getColumn(existingSubmitted).hidden = true;
  } else {
    const submitted = insertContractColumn(sheet, headerRow, contract, contract.cols.stt,
      'Thời gian nộp báo cáo', { hidden: true, width: 18 });
    if (submitted) contract.cols.submittedAt = submitted;
  }
  if (!contract.cols.training) {
    const training = insertContractColumn(sheet, headerRow, contract, contract.cols.workerName,
      '% học việc', { width: 10 });
    if (training) contract.cols.training = training;
  }
}

// Planned output of the shift = định mức 1h x thời gian thực tế x % học việc.
function plannedOutputFor(report) {
  const has = (value) => value !== null && value !== undefined && String(value).trim() !== '';
  let trainingPercent = 100;
  if (has(report.training_percent_snapshot)) trainingPercent = number(report.training_percent_snapshot);
  else if (has(report.training_percent)) trainingPercent = number(report.training_percent);
  const effectiveTime = has(report.actual_time)
    ? number(report.actual_time)
    : (has(report.total_time) ? number(report.total_time) - number(report.deduction_time) : null);
  const perHour = has(report.standard_output) ? number(report.standard_output) : null;
  const planned = perHour === null || effectiveTime === null
    ? null
    : Math.round(perHour * effectiveTime * (trainingPercent / 100) * 100) / 100;
  return { planned, trainingPercent };
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
  const machineLines = [
    ...(Array.isArray(report.machineLines) ? report.machineLines : []),
    ...(Array.isArray(report.machine_lines) ? report.machine_lines : []),
    ...(Array.isArray(report.machines) ? report.machines : [])
  ];
  const machineValues = [
    report.machine_no, report.machine_code, report.machine,
    ...machineLines.map((line) => line?.machine_code || line?.machine_no || line?.machineCode || line?.code)
  ].map((value) => String(value ?? '').trim()).filter(Boolean);
  set(contract.cols.machine, [...new Set(machineValues)].join(', '));
  const directProduct = String(report.product_name || report.product_code || '').trim();
  const lineProducts = machineLines
    .map((line) => String(line?.product_code || line?.product_name || line?.productCode || '').trim())
    .filter(Boolean);
  set(contract.cols.product, directProduct || [...new Set(lineProducts)].join(', '));
  if (contract.cols.submittedAt) {
    const cell = row.getCell(contract.cols.submittedAt);
    cell.value = asDateTime(report.submitted_at || report.created_at || report.entry_date);
    cell.numFmt = 'dd/mm/yyyy hh:mm';
  }
  const { planned, trainingPercent } = plannedOutputFor(report);
  if (contract.cols.training) {
    const cell = row.getCell(contract.cols.training);
    cell.value = trainingPercent / 100;
    cell.numFmt = '0%';
  }
  set(contract.cols.standard, planned);
  set(contract.cols.time, number(report.actual_time ?? report.total_time));
  if (contract.cols.actualTime && contract.cols.actualTime !== contract.cols.time) set(contract.cols.actualTime, number(report.actual_time ?? report.total_time));
  set(contract.cols.deductionTotal, number(report.deduction_time));
  if (contract.cols.workTime && contract.cols.time && contract.cols.deductionTotal) {
    const tL = columnLetter(contract.cols.time);
    const dL = columnLetter(contract.cols.deductionTotal);
    row.getCell(contract.cols.workTime).value = {
      formula: `${tL}${row.number}+${dL}${row.number}`,
      result: number(report.actual_time ?? report.total_time) + number(report.deduction_time)
    };
  }
  set(contract.cols.ok, number(report.tt_ok ?? report.actual_output));
  set(contract.cols.ng, number(report.tt_ng));
  set(contract.cols.output, number(report.actual_output ?? report.tt_ok));
  set(contract.cols.achievement, number(report.calculationSnapshot?.achievement_rate ?? report.achievement_rate));
  set(contract.cols.outputPerHour, number(report.calculationSnapshot?.actual_per_hour ?? report.actual_output_per_hour));
  set(contract.cols.ngRate, number(report.calculationSnapshot?.ng_rate ?? report.ng_rate));
  set(contract.cols.status, report.status);
  set(contract.cols.note, report.note || report.review_note);
  set(contract.cols.id, Number(report.id) || null);

  writeDetailBlock(row, report, processData, contract.deductions, 'deduction');
  writeDetailBlock(row, report, processData, contract.defects, 'defect');
}

// A DB type that has no column in the template must not silently disappear.
// Append unmatched CAT/LONG form categories even when their monthly total is zero,
// so the exported sheet consistently reflects the 10 Cắt + 8 Lồng form catalogue.
function appendColumnsForUnmatchedTypes(sheet, headerRow, contract, reports, processData, processCode) {
  let next = Number(contract.lastColumn || sheet.columnCount) + 1;
  const headerSource = sheet.getRow(headerRow).getCell(Number(contract.lastColumn || sheet.columnCount));
  const blocks = [
    ['deduction', contract.unmatchedDeductionTypeObjects || [], contract.deductions, 'Trừ H'],
    ['defect', contract.unmatchedDefectTypeObjects || [], contract.defects, 'NG']
  ];
  for (const [kind, types, target, prefix] of blocks) {
    const used = new Set();
    for (const report of reports) {
      for (const item of detailItems(report, kind)) {
        if (!detailValue(item, kind)) continue;
        const type = resolveType(item, processData, kind);
        if (type && types.includes(type)) used.add(type);
      }
    }
    const labels = types.map((type) => typeLabel(type, kind));
    for (const type of types) {
      const encodedGcType = kind === 'defect' && Boolean(encodedGcDefectCode(type));
      const label = typeLabel(type, kind).trim();
      // Numeric placeholder types in the GC deduction catalogue are not
      // meaningful business categories (e.g. "Trừ H: 0", "Trừ H: 1").
      if (String(processCode || '').toUpperCase() === 'GC'
        && kind === 'deduction' && /^\d+(?:[.,]\d+)?$/.test(label)) continue;
      // GC must keep the fixed encoded 18-column defect catalogue. Never append
      // legacy/unmapped NG columns beside CAT01-CAT10 and LONG01-LONG08.
      if (String(processCode || '').toUpperCase() === 'GC' && kind === 'defect' && !encodedGcType) continue;
      if (!used.has(type) && !encodedGcType) continue;
      const duplicate = labels.filter((x) => String(x).trim() === label).length > 1;
      const code = kind === 'deduction'
        ? (type.deduction_code || type.code)
        : (type.defect_code || type.defect_type_code || type.code);
      const preserveEncodedCode = kind === 'defect' && Boolean(encodedGcDefectCode(type));
      const cell = sheet.getRow(headerRow).getCell(next);
      cell.value = `${prefix}: ${label}${(duplicate || preserveEncodedCode) && code ? ` (${code})` : ''}`;
      if (headerSource.style) cell.style = JSON.parse(JSON.stringify(headerSource.style));
      sheet.getColumn(next).width = Math.max(10, Math.min(24, String(cell.value).length + 2));
      target.push({ type, column: next });
      next += 1;
    }
  }
}

// Template row between the header and the first data row whose first cell is a
// date (the pink "Sep-02" row). When present, the export writes one such row
// per work date and restarts STT at 1 under each date.
function findDateSeparatorRow(sheet, headerRow, dataStartRow) {
  for (let r = headerRow + 1; r < dataStartRow; r += 1) {
    const row = sheet.getRow(r);
    const first = row.getCell(1).value;
    const isDate = first instanceof Date || /[dmy]/i.test(String(row.getCell(1).numFmt || ''));
    if (isDate && first != null && first !== '') return r;
  }
  return null;
}

function snapshotRow(sheet, rowNumber, columnCount) {
  const row = sheet.getRow(rowNumber);
  const styles = [];
  for (let c = 1; c <= columnCount; c += 1) styles[c] = JSON.parse(JSON.stringify(row.getCell(c).style || {}));
  return { height: row.height, styles };
}

function applySnapshot(row, snapshot, columnCount) {
  if (snapshot.height) row.height = snapshot.height;
  for (let c = 1; c <= columnCount; c += 1) {
    const cell = row.getCell(c);
    cell.value = null;
    cell.style = JSON.parse(JSON.stringify(snapshot.styles[c] || {}));
  }
}

function columnLetter(column) {
  let value = Number(column);
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function writeGroupedByDate(sheet, reports, contract, processData, dateRowNumber, dataStartRow, columnMap, headerRow) {
  const columnCount = Math.max(sheet.columnCount, Number(contract.lastColumn || 0));
  const dateSnapshot = snapshotRow(sheet, dateRowNumber, columnCount);
  const dataSnapshot = snapshotRow(sheet, dataStartRow, columnCount);
  // Read the header row as it stands now: addDerivedColumns may have inserted
  // columns after columnMap was built, so cached indexes would be stale.
  const liveMap = findColumnMap(sheet, headerRow);
  const percentColumn = pickExact(liveMap, '%tt', '% tt');
  const outputLetter = contract.cols.output ? columnLetter(contract.cols.output) : null;
  const standardLetter = contract.cols.standard ? columnLetter(contract.cols.standard) : null;
  const percentFormat = sheet.getRow(dataStartRow + 1).getCell(percentColumn || 1).numFmt || '0%';
  const conditional = (sheet.conditionalFormattings || [])
    .find((item) => percentColumn && String(item.ref || '').startsWith(columnLetter(percentColumn)));

  // Remove every template sample row; rows are rebuilt from the DB below.
  // ExcelJS spliceRows does not reliably drop thousands of rows, so truncate
  // the internal row list directly (rows are 1-based; keep 1..dateRowNumber-1).
  if (Array.isArray(sheet._rows)) sheet._rows.length = dateRowNumber - 1;
  else sheet.spliceRows(dateRowNumber, sheet.rowCount - dateRowNumber + 1);

  const dayKey = (report) => {
    const day = asDate(report.work_date || report.entry_date);
    return day ? day.toISOString().slice(0, 10) : '';
  };
  const ordered = [...reports].sort((a, b) => dayKey(a).localeCompare(dayKey(b)) || number(a?.id) - number(b?.id));
  const groups = new Map();
  for (const report of ordered) {
    const day = asDate(report.work_date || report.entry_date);
    const key = day ? day.toISOString().slice(0, 10) : '';
    if (!groups.has(key)) groups.set(key, { day, reports: [] });
    groups.get(key).reports.push(report);
  }

  let rowNumber = dateRowNumber;
  const percentRanges = [];
  for (const group of groups.values()) {
    const dateRow = sheet.getRow(rowNumber);
    applySnapshot(dateRow, dateSnapshot, columnCount);
    dateRow.getCell(1).value = group.day;
    dateRow.getCell(1).numFmt = 'mmm-dd';
    rowNumber += 1;
    const firstDataRow = rowNumber;
    group.reports.forEach((report, index) => {
      const row = sheet.getRow(rowNumber);
      applySnapshot(row, dataSnapshot, columnCount);
      applyReportRow(row, report, contract, processData, index);
            const totalMinutes = report.total_minutes !== null
        && report.total_minutes !== undefined
        && report.total_minutes !== ''
        ? number(report.total_minutes)
        : (
          report.work_minutes !== null
            && report.work_minutes !== undefined
            && report.work_minutes !== ''
            ? number(report.work_minutes) + number(report.deduction_time) * 60
            : number(report.total_time ?? report.actual_time) * 60
        );
      writeValue(row, contract.cols.workTime, totalMinutes / 60);
      if (percentColumn && outputLetter && standardLetter) {
        const cell = row.getCell(percentColumn);
        const { planned } = plannedOutputFor(report);
        const output = number(report.actual_output ?? report.tt_ok);
        cell.value = {
          formula: `IFERROR(${outputLetter}${rowNumber}/${standardLetter}${rowNumber},0)`,
          result: planned ? output / planned : 0
        };
        cell.numFmt = percentFormat;
      }
      rowNumber += 1;
    });
    if (percentColumn) percentRanges.push(`${columnLetter(percentColumn)}${firstDataRow}:${columnLetter(percentColumn)}${rowNumber - 1}`);
  }

  // %TT colour bands (the template file no longer carries them):
  //   < 80%          red
  //   80% - < 90%    yellow
  //   90% - 100%     green
  //   > 100%         pink
  sheet.conditionalFormattings = [];
  if (percentColumn && percentRanges.length) {
    const col = columnLetter(percentColumn);
    const firstRow = Number(percentRanges[0].match(/\d+/)[0]);
    const cell = `${col}${firstRow}`;
    const fill = (argb) => ({ fill: { type: 'pattern', pattern: 'solid', bgColor: { argb } } });
    sheet.addConditionalFormatting({
      ref: percentRanges.join(' '),
      rules: [
        { type: 'expression', priority: 1, formulae: [`AND(ISNUMBER(${cell}),${cell}<0.8)`], style: fill('FFFF0000') },
        { type: 'expression', priority: 2, formulae: [`AND(ISNUMBER(${cell}),${cell}>=0.8,${cell}<0.9)`], style: fill('FFFFFF00') },
        { type: 'expression', priority: 3, formulae: [`AND(ISNUMBER(${cell}),${cell}>=0.9,${cell}<=1)`], style: fill('FF92D050') },
        { type: 'expression', priority: 4, formulae: [`AND(ISNUMBER(${cell}),${cell}>1)`], style: fill('FFFF99CC') }
      ]
    });
  }

  // The template carries an oversized legacy filter/print range (e.g. AV2366).
  // Rebuild both from the actual output, including appended CAT/LONG defect columns.
  const lastRow = Math.max(headerRow, rowNumber - 1);
  const detailColumns = [
    ...contract.deductions.map((item) => Number(item.column) || 0),
    ...contract.defects.map((item) => Number(item.column) || 0)
  ];
  const fixedColumns = Object.values(contract.cols).map(Number).filter(Number.isFinite);
  const lastColumn = Math.max(Number(contract.lastColumn) || 1, ...fixedColumns, ...detailColumns, 1);
  sheet.autoFilter = `A${headerRow}:${columnLetter(lastColumn)}${lastRow}`;
  sheet.pageSetup.printArea = `A1:${columnLetter(lastColumn)}${lastRow}`;
}


function normalizeGcDefectHeaders(sheet, headerRow) {
  const row = sheet.getRow(headerRow);
  const headerText = (column) => normalize(cellText(row.getCell(column)));
  let ngColumn = null;
  for (let column = 1; column <= sheet.columnCount; column += 1) {
    if (headerText(column) === 'tong ng') { ngColumn = column; break; }
  }
  if (!ngColumn) throw new Error('GC template không tìm thấy cột Tổng NG.');
  const isNonDetailTail = (label) => /^(ty le|ghi chu|trang thai|id$|sp ?\/ ?gio|san pham ?\/ ?gio|nang suat)/.test(label);
  const defectColumns = [];
  for (let column = ngColumn + 1; column <= sheet.columnCount; column += 1) {
    if (isNonDetailTail(headerText(column))) break;
    defectColumns.push(column);
  }
  const expected = Object.values(GC_FORM_DEFECT_COLUMN_BY_CODE);
  const existing = new Set(defectColumns.map((column) => headerText(column)));
  if (expected.every((label) => existing.has(normalize(label)))) return false;
  if (defectColumns.length < 18) {
    throw new Error(`GC template cần tối thiểu 18 cột NG để thay thế, nhưng tìm thấy ${defectColumns.length}. Dừng để tránh sửa nhầm template.`);
  }
  // The current company template may contain more than 18 legacy NG columns.
  // Reuse the first 18 columns in place, then remove surplus columns from the
  // end of the NG block so no old defect columns remain beside the new catalogue.
  for (let index = 0; index < expected.length; index += 1) {
    row.getCell(defectColumns[index]).value = expected[index];
  }
  for (let index = defectColumns.length - 1; index >= expected.length; index -= 1) {
    sheet.spliceColumns(defectColumns[index], 1);
  }
  return true;
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
  if (code === 'GC') normalizeGcDefectHeaders(sheet, headerRow);
  const columnMap = findColumnMap(sheet, headerRow);
  const contract = buildColumnContract(columnMap, processData);
  reports.sort((a, b) => String(a?.work_date || '').localeCompare(String(b?.work_date || '')) || number(a?.id) - number(b?.id));
  appendColumnsForUnmatchedTypes(sheet, headerRow, contract, reports, processData, code);

  addDerivedColumns(sheet, headerRow, contract);
  const workTimeColumn = insertContractColumn(sheet, headerRow, contract, contract.cols.shift, 'Thời gian làm việc', { width: 14, hidden: true });
contract.cols.workTime = workTimeColumn;
  const dataStartRow = findDataStartRow(sheet, headerRow);
  const dateRowNumber = findDateSeparatorRow(sheet, headerRow, dataStartRow);
  let layout = 'flat';
  if (dateRowNumber) {
    layout = 'grouped-by-date';
    writeGroupedByDate(sheet, reports, contract, processData, dateRowNumber, dataStartRow, columnMap, headerRow);
  } else {
    const sourceRow = sheet.getRow(dataStartRow);
    const requiredEndRow = dataStartRow + reports.length - 1;
    // The template ships with sample rows. Clear them before writing so a column
    // the contract does not map can never keep a sample value from the template.
    clearDataRows(sheet, dataStartRow, reports.length, sheet.columnCount);
    for (let r = dataStartRow; r <= requiredEndRow; r += 1) {
      const row = sheet.getRow(r);
      if (r !== dataStartRow) cloneRowStyle(sheet, sourceRow, row);
      applyReportRow(row, reports[r - dataStartRow], contract, processData, r - dataStartRow);
    }
    const clearCount = Math.max(0, sheet.rowCount - (dataStartRow + reports.length) + 1);
    clearDataRows(sheet, dataStartRow + reports.length, clearCount, sheet.columnCount);
  }
  workbook.calculation = { fullCalcOnLoad: true, forceFullCalc: true, calcMode: 'auto' };
  const outputBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer: outputBuffer, fileName, processCode: code, processName: processName || processCode, reportCount: reports.length, templateFile: TEMPLATE_NAME, templatePath, templateSheet: sheet.name, headerRow, dataStartRow, layout,
    columnContract: {
      cols: contract.cols,
      detailColumns: contract.detailColumns,
      deductionColumns: contract.deductions.map((item) => ({ column: item.column, type: typeLabel(item.type, 'deduction') })),
      defectColumns: contract.defects.map((item) => ({ column: item.column, type: typeLabel(item.type, 'defect') })),
      unmatchedDeductionTypes: contract.unmatchedDeductionTypes,
      unmatchedDefectTypes: contract.unmatchedDefectTypes
    } };
}

module.exports = { TEMPLATE_NAME, PROCESS_FILE_PREFIXES, buildWorkerProcessWorkbook };
