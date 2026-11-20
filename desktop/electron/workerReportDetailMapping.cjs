'use strict';

// Match DB defect/deduction catalogues to immutable worker Excel detail columns.
function createWorkerReportDetailMapping({
  number, normalize, detailVariants, canonicalDetailKey,
  pick, pickExact, findColumn, GC_FORM_DEFECT_COLUMN_BY_CODE, TEMPLATE_COLUMN_ALIASES,
}) {
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
  const timeLabel = cols.time ? normalize(map.get(cols.time)) : '';
  const timeKind = timeLabel.includes('tong thoi gian') ? 'TOTAL' : 'ACTUAL';
  return {
    cols,
    timeKind,
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

  return {
    detailItems, detailValue, typeLabel, typeKeys, itemKeys, processTypes,
    resolveType, typeCandidates, detailScore, detailColumn,
    encodedGcDefectCode, legacyGcDefectTarget, assignDetailColumns,
    subMap, buildColumnContract, buildDetailValueMap, valueForType,
  };
}
module.exports = { createWorkerReportDetailMapping };
