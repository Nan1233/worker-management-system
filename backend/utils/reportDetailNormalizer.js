const CANONICAL_GC_DEFECTS = new Map([
  ["KQD", "KQD"], ["VO_CAO_SU", "Vỡ cao su"], ["K_XUOC_CONG_GAY", "K xước cong gãy"],
  ["CAO_SU_XOAY", "Cao su xoay"], ["CAT_KHONG_DUT", "Cắt không đứt"], ["BAVIA", "Bavia"],
  ["CSH", "CSH"], ["PPCM", "PPCM"], ["KT_LON", "KT lớn"], ["KT_NHO", "KT nhỏ"], ["LCS", "LCS"],
  ["CAT_LEM", "Cắt lẹm"], ["RACH_NVL", "Rách NVL"], ["CHAN_NGAN_DAI", "Chân ngắn dài"],
  ["SOT_VIA", "Sót via"], ["FURE_TRUC", "Fure trục"], ["LAN_CS", "Lẫn CS"],
  ["BAVIA_CAT_HUT", "Bavia cắt hụt"], ["THIEU_CAO_SU", "Thiếu cao su"]
]);

const LEGACY_DEFECT_FIELDS = [
  ["kqd_dap_lai", "KQD", "KQD"], ["kqd_tuot", "KQD", "KQD"],
  ["vo_do_long", "VO_CAO_SU", "Vỡ cao su"], ["xuoc_do_long", "K_XUOC_CONG_GAY", "K xước cong gãy"],
  ["cong_gay", "K_XUOC_CONG_GAY", "K xước cong gãy"], ["xoay", "CAO_SU_XOAY", "Cao su xoay"],
  ["khong_dut", "CAT_KHONG_DUT", "Cắt không đứt"], ["bavia_hut", "BAVIA", "Bavia"],
  ["ppcm", "PPCM", "PPCM"], ["loi_cao_su", "LCS", "Lỗi cao su"],
  ["ng_kich_thuoc", "KT_LON", "KT kích thước"], ["cat_lem", "CAT_LEM", "Cắt lẹm"],
  ["rach_nvl", "RACH_NVL", "Rách NVL"], ["chan_ngan_dai", "CHAN_NGAN_DAI", "Chân ngắn dài"],
  ["sot_via", "SOT_VIA", "Sót via"], ["fure_truc", "FURE_TRUC", "Fure trục"],
  ["lan_cs", "LAN_CS", "Lẫn CS"], ["bavia_cat_hut", "BAVIA_CAT_HUT", "Bavia cắt hụt"],
  ["thieu_cao_su", "THIEU_CAO_SU", "Thiếu cao su"]
];

const LEGACY_DEDUCTION_FIELDS = [
  ["Thiếu sản lượng", "THIEU_SAN_LUONG"], ["Bật máy, xét máy", "BAT_MAY"],
  ["Bật máy, xét máy, đầu giờ", "BAT_MAY"], ["Chuyển mã", "CHUYEN_MA"],
  ["Chỉnh máy", "CHINH_MAY"], ["Chờ chỉnh máy", "CHO_CHINH_MAY"],
  ["Mất điện", "MAT_DIEN"], ["Mất khí", "MAT_KHI"], ["Chờ hàng", "CHO_HANG"],
  ["Bảo dưỡng máy", "BAO_DUONG_MAY"], ["bảo dưỡng máy", "BAO_DUONG_MAY"],
  ["Nghỉ giải lao", "NGHI_GIAI_LAO"], ["Giao ca", "GIAO_CA"],
  ["Dừng máy đi hỗ trợ", "DUNG_MAY_HO_TRO"],
  ["Giặt cs/cân cs, tuốt-tái pp, GL", "GIAT_CS_CAN_CS_TUOT_TAI_PP_GL"],
  ["Giặt CS/Cân CS, Tuốt-Tái PP, GL", "GIAT_CS_CAN_CS_TUOT_TAI_PP_GL"],
  ["5s", "5S"], ["5S", "5S"], ["Học việc, đào tạo", "HOC_VIEC_DAO_TAO"],
  ["Học việc", "HOC_VIEC_DAO_TAO"], ["Đi muộn về sớm", "DI_MUON_VE_SOM"],
  ["Đi muộn/về sớm", "DI_MUON_VE_SOM"]
];

const LEGACY_MACHINE_KEYS = new Map([
  ["KQD_DAP_LAI", "KQD"], ["KQD_TUOT", "KQD"], ["KQD_DL", "KQD"],
  ["VO_DO_LONG", "VO_CAO_SU"], ["VO_LONG", "VO_CAO_SU"],
  ["XUOC_DO_LONG", "K_XUOC_CONG_GAY"], ["XUOC_LONG", "K_XUOC_CONG_GAY"],
  ["CONG_GAY", "K_XUOC_CONG_GAY"], ["XOAY", "CAO_SU_XOAY"],
  ["KHONG_DUT", "CAT_KHONG_DUT"], ["BAVIA", "BAVIA"], ["BAVIA_HUT", "BAVIA"],
  ["PPCM", "PPCM"], ["CAO_SU", "LCS"], ["LOI_CAO_SU", "LCS"], ["CAT_LEM", "CAT_LEM"],
  ["RACH_NVL", "RACH_NVL"], ["CHAN_NGAN_DAI", "CHAN_NGAN_DAI"], ["SOT_VIA", "SOT_VIA"],
  ["FURE_TRUC", "FURE_TRUC"], ["LAN_CS", "LAN_CS"], ["BAVIA_CAT_HUT", "BAVIA_CAT_HUT"],
  ["THIEU_CAO_SU", "THIEU_CAO_SU"]
]);

const LEGACY_GC_DEDUCTION_COLUMN_LABELS = new Map([
  [11, "Thiếu sản lượng"], [12, "Bật máy, xét máy"], [13, "Chuyển mã"], [14, "Chỉnh máy"],
  [15, "Chờ chỉnh máy"], [16, "Mất điện"], [17, "Mất khí"], [18, "Chờ hàng"],
  [19, "Bảo dưỡng máy"], [20, "Nghỉ giải lao"], [21, "Giao ca"], [22, "Dừng máy đi hỗ trợ"],
  [23, "Giặt cs/cân cs, tuốt-tái pp, GL"], [24, "5s"], [25, "Học việc, đào tạo"], [26, "Đi muộn về sớm"]
]);

const normalizeKey = (value) => String(value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/đ/g, "d").replace(/Đ/g, "D")
  .replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();

const parseJson = (value) => {
  if (value == null || value === "") return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try { return JSON.parse(value); } catch (_) { return null; }
};

const positiveNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const deductionAliasCode = (value) => {
  const key = normalizeKey(value);
  const found = LEGACY_DEDUCTION_FIELDS.find(([label, code]) => normalizeKey(label) === key);
  return found?.[1] || key;
};

function canonicalDefect(item = {}) {
  const rawCode = normalizeKey(item.defect_code || item.defect_type_code || item.code);
  const aliasCode = LEGACY_MACHINE_KEYS.get(rawCode) || rawCode;
  const nameKey = normalizeKey(item.defect_name || item.name || item.label);
  const canonicalCode = CANONICAL_GC_DEFECTS.has(aliasCode)
    ? aliasCode
    : [...CANONICAL_GC_DEFECTS.entries()].find(([, name]) => normalizeKey(name) === nameKey)?.[0] || null;
  if (!canonicalCode) {
    const defectTypeId = Number(item.defect_type_id ?? item.id) || undefined;
    const defectCode = String(item.defect_code || item.defect_type_code || item.code || "").trim();
    const defectName = String(item.defect_name || item.name || item.label || "").trim();
    if (!defectTypeId && !defectCode && !defectName) return null;
    return { ...item, id: defectTypeId, defect_type_id: defectTypeId, defect_code: defectCode || undefined, defect_name: defectName || defectCode || `Lỗi NG #${defectTypeId || "?"}` };
  }
  return { ...item, defect_code: canonicalCode, defect_name: CANONICAL_GC_DEFECTS.get(canonicalCode) };
}

function parseMachineDefects(machineLines = []) {
  const result = [];
  for (const line of Array.isArray(machineLines) ? machineLines : []) {
    let parsed = line?.defects;
    if (!Array.isArray(parsed)) parsed = parseJson(line?.defects_json);
    if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.defects)) parsed = parsed.defects;
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const quantity = Math.trunc(positiveNumber(item?.quantity ?? item?.qty ?? item?.ng_quantity));
        if (!quantity) continue;
        const normalized = canonicalDefect({
          id: Number(item?.id) || undefined,
          defect_type_id: Number(item?.defect_type_id ?? item?.type_id) || undefined,
          defect_code: item?.defect_code || item?.defect_type_code || item?.code,
          defect_name: item?.defect_name || item?.defect_type_name || item?.name || item?.label,
          quantity
        });
        if (normalized) result.push(normalized);
      }
    } else if (parsed && typeof parsed === "object") {
      for (const [key, value] of Object.entries(parsed)) {
        if (["selectedDefects", "selectedNg", "total", "ngQuantity"].includes(key)) continue;
        const raw = value && typeof value === "object" ? value : {};
        const quantity = Math.trunc(positiveNumber(raw.quantity ?? raw.qty ?? raw.ng_quantity ?? value));
        if (!quantity) continue;
        const item = canonicalDefect({
          id: Number(raw.id) || undefined,
          defect_type_id: Number(raw.defect_type_id ?? raw.type_id) || undefined,
          defect_code: raw.defect_code || raw.defect_type_code || raw.code || key,
          defect_name: raw.defect_name || raw.defect_type_name || raw.name || raw.label,
          quantity
        });
        if (item) result.push(item);
      }
    }
  }
  return result;
}

function sortDefects(values) {
  return [...values].sort((a, b) => String(a.defect_name || a.defect_code).localeCompare(String(b.defect_name || b.defect_code), "vi"));
}
function defectTotal(values) {
  return (Array.isArray(values) ? values : []).reduce((sum, item) => sum + positiveNumber(item?.quantity), 0);
}
function legacyDefectValues(report) {
  const values = [];
  for (const [field, code, name] of LEGACY_DEFECT_FIELDS) {
    const quantity = Math.trunc(positiveNumber(report?.[field]));
    if (quantity) values.push({ defect_code: code, defect_name: name, quantity });
  }
  return values;
}

function extractLegacyDefects(extra) {
  const result = [];
  const seen = new Map();
  const visit = (node, depth = 0) => {
    if (node == null || depth > 7) return;
    if (Array.isArray(node)) { node.forEach((item) => visit(item, depth + 1)); return; }
    if (typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      const alias = LEGACY_MACHINE_KEYS.get(normalizeKey(key)) || normalizeKey(key);
      const known = CANONICAL_GC_DEFECTS.has(alias) || LEGACY_DEFECT_FIELDS.some(([, code]) => code === alias);
      if (known) {
        const raw = value && typeof value === "object"
          ? (value.quantity ?? value.qty ?? value.ng_quantity ?? value.value ?? value.count)
          : value;
        const quantity = Math.trunc(positiveNumber(raw));
        if (quantity) {
          const existing = seen.get(alias);
          if (existing) existing.quantity += quantity;
          else seen.set(alias, { defect_code: alias, quantity });
        }
      }
      visit(value, depth + 1);
    }
  };
  visit(extra);
  for (const item of seen.values()) {
    const name = CANONICAL_GC_DEFECTS.get(item.defect_code) || item.defect_code;
    result.push(canonicalDefect({ ...item, defect_name: name }));
  }
  return result.filter(Boolean);
}

function mergeByKey(values, kind) {
  const map = new Map();
  for (const item of Array.isArray(values) ? values : []) {
    const value = kind === "defect" ? Math.trunc(positiveNumber(item?.quantity)) : positiveNumber(item?.hours);
    if (!value) continue;
    const id = kind === "defect" ? Number(item?.defect_type_id ?? item?.id) || 0 : Number(item?.deduction_type_id ?? item?.id) || 0;
    const code = normalizeKey(kind === "defect" ? (item?.defect_code || item?.code) : (item?.deduction_code || item?.code));
    const name = normalizeKey(kind === "defect" ? (item?.defect_name || item?.name || item?.label) : (item?.deduction_name || item?.name || item?.label));
    const key = id ? `ID:${id}` : code ? `CODE:${code}` : `NAME:${name}`;
    const existing = map.get(key);
    if (existing) {
      if (kind === "defect") existing.quantity += value; else existing.hours += value;
    } else {
      map.set(key, { ...item, ...(kind === "defect" ? { quantity: value } : { hours: value }) });
    }
  }
  return [...map.values()];
}

function reconcileSources(sources, expected, kind) {
  const cleanExpected = positiveNumber(expected);
  const target = kind === "defect" ? Math.trunc(cleanExpected) : cleanExpected;
  const result = new Map();
  const add = (item) => {
    const value = kind === "defect" ? Math.trunc(positiveNumber(item?.quantity)) : positiveNumber(item?.hours);
    if (!value) return false;
    const id = kind === "defect" ? Number(item?.defect_type_id ?? item?.id) || 0 : Number(item?.deduction_type_id ?? item?.id) || 0;
    const code = normalizeKey(kind === "defect" ? (item?.defect_code || item?.code) : (item?.deduction_code || item?.code));
    const name = normalizeKey(kind === "defect" ? (item?.defect_name || item?.name || item?.label) : (item?.deduction_name || item?.name || item?.label));
    const key = id ? `ID:${id}` : code ? `CODE:${code}` : `NAME:${name}`;
    const existing = result.get(key);
    const currentTotal = [...result.values()].reduce((sum, x) => sum + (kind === "defect" ? x.quantity : x.hours), 0);
    const remaining = Math.max(0, target - currentTotal);
    if (remaining <= 0) return false;
    const amount = Math.min(value, remaining);
    if (existing) {
      if (kind === "defect") existing.quantity += amount; else existing.hours += amount;
    } else {
      result.set(key, { ...item, ...(kind === "defect" ? { quantity: amount } : { hours: amount }) });
    }
    return true;
  };
  for (const source of sources) for (const item of mergeByKey(source, kind)) add(item);
  return [...result.values()];
}

function mergeDefects(report, rows = [], machineLines = []) {
  const child = mergeByKey(rows, "defect");
  const machine = mergeByKey(parseMachineDefects(machineLines), "defect");
  const legacy = mergeByKey(legacyDefectValues(report), "defect");
  const extra = mergeByKey(extractLegacyDefects(parseJson(report?.extra_data)), "defect");
  const expected = Math.trunc(positiveNumber(report?.tt_ng));
  if (!expected) return sortDefects(child.length ? child : (legacy.length ? legacy : (extra.length ? extra : machine)));
  if (defectTotal(child) === expected) return sortDefects(child);
  if (defectTotal(legacy) === expected) return sortDefects(legacy);
  if (defectTotal(extra) === expected) return sortDefects(extra);
  if (defectTotal(machine) === expected) return sortDefects(machine);
  const reconciled = reconcileSources([child, legacy, extra, machine], expected, "defect");
  return sortDefects(reconciled);
}

function deductionTypeMatches(type, value) {
  const needle = normalizeKey(value);
  if (!needle) return false;
  const candidates = [type?.deduction_code, type?.code, type?.deduction_name, type?.name].map(normalizeKey).filter(Boolean);
  const needleAlias = deductionAliasCode(value);
  return candidates.some((candidate) => {
    const candidateAlias = deductionAliasCode(candidate);
    return candidate === needle || candidate.includes(needle) || needle.includes(candidate) || candidateAlias === needleAlias;
  });
}
function findDeductionType(types, value) {
  return (Array.isArray(types) ? types : []).find((type) => deductionTypeMatches(type, value)) || null;
}
function addDeduction(merged, item, deductionTypes = [], hoursOverride = null) {
  const rawHours = hoursOverride == null
    ? positiveNumber(item?.hours ?? item?.deduction_hours ?? item?.duration_hours ?? item?.time_hours ?? item?.value ?? item?.time)
    : positiveNumber(hoursOverride);
  if (!rawHours) return;
  const type = item?.deduction_type_id
    ? (Array.isArray(deductionTypes) ? deductionTypes.find((candidate) => Number(candidate.id) === Number(item.deduction_type_id)) : null)
    : findDeductionType(deductionTypes, item?.deduction_code || item?.deduction_name || item?.name || item?.label || item?.code);
  const typeId = Number(item?.deduction_type_id || type?.id) || null;
  const code = String(item?.deduction_code || item?.code || type?.deduction_code || type?.code || '').trim();
  const name = String(item?.deduction_name || item?.name || item?.label || type?.deduction_name || type?.name || '').trim();
  const key = typeId ? `ID:${typeId}` : code ? `CODE:${normalizeKey(code)}` : `NAME:${normalizeKey(name)}`;
  const existing = merged.get(key);
  if (existing) existing.hours += rawHours;
  else merged.set(key, { ...item, deduction_type_id: typeId || undefined, deduction_code: code || undefined, deduction_name: name || code || 'Trừ giờ', hours: rawHours });
}

function addDeductionsJson(merged, value, deductionTypes = [], hoursScale = 1) {
  const parsed = parseJson(value);
  if (!parsed) return;
  if (Array.isArray(parsed)) {
    for (const item of parsed) addDeduction(merged, item, deductionTypes, positiveNumber(item?.hours ?? item?.deduction_hours ?? item?.duration_hours ?? item?.time_hours ?? item?.value ?? item?.time) * hoursScale);
    return;
  }
  const nested = parsed.deductions || parsed.deductionDetails || parsed.deduction_details || parsed.items || parsed.columns;
  if (Array.isArray(nested)) {
    nested.forEach((item) => addDeduction(merged, item, deductionTypes, positiveNumber(item?.hours ?? item?.deduction_hours ?? item?.duration_hours ?? item?.time_hours ?? item?.value ?? item?.time) * hoursScale));
  } else if (nested && typeof nested === 'object') {
    for (const [name, value] of Object.entries(nested)) addDeduction(merged, { deduction_name: name, hours: positiveNumber(value) * hoursScale }, deductionTypes);
  } else {
    for (const [name, value] of Object.entries(parsed)) {
      if (["total", "totalHours", "total_hours", "selectedDeductions", "selected_deductions", "deductions", "deductionDetails", "deduction_details", "columns"].includes(name)) continue;
      const raw = value && typeof value === 'object' ? value : { hours: value };
      addDeduction(merged, { ...raw, deduction_name: raw.deduction_name || raw.name || raw.label || name }, deductionTypes, positiveNumber(raw.hours ?? raw.deduction_hours ?? raw.duration_hours ?? raw.time_hours ?? raw.value ?? raw.time ?? value) * hoursScale);
    }
  }
}

function extractLegacyGcColumnDeductionCandidates(report) {
  const processCode = normalizeKey(report?.process_code || report?.processCode || report?.process || "");
  if (processCode !== "GC") return [];
  const extra = parseJson(report?.extra_data);
  if (!extra || Array.isArray(extra) || typeof extra !== "object") return [];
  const result = [];
  for (const [key, value] of Object.entries(extra)) {
    if (!/^\\d+$/.test(key)) continue;
    const columnIndex = Number(key);
    const label = LEGACY_GC_DEDUCTION_COLUMN_LABELS.get(columnIndex);
    if (!label) continue;
    const n = positiveNumber(value && typeof value === "object"
      ? (value.hours ?? value.deduction_hours ?? value.duration_hours ?? value.minutes ?? value.value ?? value.time)
      : value);
    if (n) result.push({ label, code: deductionAliasCode(label), rawValue: n });
  }
  return result;
}

function extractLegacyDeductionCandidates(extra) {
  const result = [];
  const seen = new Set();
  const visit = (node, depth = 0) => {
    if (node == null || depth > 7) return;
    if (Array.isArray(node)) { node.forEach((item) => visit(item, depth + 1)); return; }
    if (typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      const alias = deductionAliasCode(key);
      const known = LEGACY_DEDUCTION_FIELDS.some(([, code]) => code === alias);
      if (known) {
        const raw = value && typeof value === 'object'
          ? (value.hours ?? value.deduction_hours ?? value.duration_hours ?? value.minutes ?? value.value ?? value.time)
          : value;
        const n = positiveNumber(raw);
        if (n) {
          const marker = `${alias}:${n}`;
          if (!seen.has(marker)) { seen.add(marker); result.push({ label: key, code: alias, rawValue: n }); }
        }
      }
      visit(value, depth + 1);
    }
  };
  visit(extra);
  return result;
}

function normalizeLegacyDeductionHours(candidates, report) {
  const expectedHours = positiveNumber(report?.deduction_time);
  if (!candidates.length) return [];
  const totalRaw = candidates.reduce((sum, item) => sum + item.rawValue, 0);
  const totalAsMinutes = totalRaw / 60;
  const scale = expectedHours > 0 && Math.abs(totalRaw - expectedHours) <= 0.01
    ? 1
    : expectedHours > 0 && Math.abs(totalAsMinutes - expectedHours) <= 0.01
      ? (1 / 60)
      : 1;
  return candidates.map((item) => ({ ...item, hours: item.rawValue * scale }));
}

function normalizeDeductions(rows = [], report = null, machineLines = [], deductionTypes = []) {
  const persisted = new Map();
  (Array.isArray(rows) ? rows : []).forEach((item) => addDeduction(persisted, item, deductionTypes));
  const machine = new Map();
  for (const line of Array.isArray(machineLines) ? machineLines : []) addDeductionsJson(machine, line?.deductions_json, deductionTypes);
  const extra = new Map();
  const gcLegacyCandidates = extractLegacyGcColumnDeductionCandidates(report);
  // Legacy GC imports store deduction columns under numeric Excel keys (13, 14, 17, ...)
  // and also store the parent total under another numeric key (for example 9). Do not let
  // the generic JSON parser treat those numeric keys as deduction names such as "9".
  if (!gcLegacyCandidates.length) addDeductionsJson(extra, report?.extra_data, deductionTypes);
  const legacy = new Map();
  const legacyCandidates = [
    ...extractLegacyDeductionCandidates(parseJson(report?.extra_data)),
    ...gcLegacyCandidates
  ];
  for (const item of normalizeLegacyDeductionHours(legacyCandidates, report)) {
    const type = findDeductionType(deductionTypes, item.code) || findDeductionType(deductionTypes, item.label);
    addDeduction(legacy, {
      deduction_type_id: type?.id,
      deduction_code: type?.deduction_code || type?.code || item.code,
      deduction_name: type?.deduction_name || type?.name || item.label,
      hours: item.hours
    }, deductionTypes);
  }
  const expected = positiveNumber(report?.deduction_time);
  const toArray = (map) => [...map.values()];
  if (!expected) return toArray(persisted).length ? toArray(persisted) : (toArray(legacy).length ? toArray(legacy) : (toArray(extra).length ? toArray(extra) : toArray(machine)));
  const persistedValues = toArray(persisted);
  if (persistedValues.length) return persistedValues;
  const legacyValues = toArray(legacy);
  if (Math.abs(legacyValues.reduce((s, x) => s + positiveNumber(x.hours), 0) - expected) <= 0.01) return legacyValues;
  const extraValues = toArray(extra);
  if (Math.abs(extraValues.reduce((s, x) => s + positiveNumber(x.hours), 0) - expected) <= 0.01) return extraValues;
  const machineValues = toArray(machine);
  if (Math.abs(machineValues.reduce((s, x) => s + positiveNumber(x.hours), 0) - expected) <= 0.01) return machineValues;
  return reconcileSources([persistedValues, legacyValues, extraValues, machineValues], expected, "deduction");
}

module.exports = {
  mergeDefects,
  normalizeDeductions,
  LEGACY_DEFECT_FIELDS,
  CANONICAL_GC_DEFECTS,
  parseMachineDefects,
  LEGACY_GC_DEDUCTION_COLUMN_LABELS,
};
