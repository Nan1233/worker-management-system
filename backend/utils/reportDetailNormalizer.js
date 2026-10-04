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
  ["Thiếu sản lượng", "THIEU_SAN_LUONG"],
  ["Bật máy, xét máy", "BAT_MAY"],
  ["Bật máy, xét máy, đầu giờ", "BAT_MAY"],
  ["Chuyển mã", "CHUYEN_MA"],
  ["Chỉnh máy", "CHINH_MAY"],
  ["Chờ chỉnh máy", "CHO_CHINH_MAY"],
  ["Mất điện", "MAT_DIEN"],
  ["Mất khí", "MAT_KHI"],
  ["Chờ hàng", "CHO_HANG"],
  ["Bảo dưỡng máy", "BAO_DUONG_MAY"],
  ["bảo dưỡng máy", "BAO_DUONG_MAY"],
  ["Nghỉ giải lao", "NGHI_GIAI_LAO"],
  ["Giao ca", "GIAO_CA"],
  ["Dừng máy đi hỗ trợ", "DUNG_MAY_HO_TRO"],
  ["Giặt cs/cân cs, tuốt-tái pp, GL", "GIAT_CS_CAN_CS_TUOT_TAI_PP_GL"],
  ["Giặt CS/Cân CS, Tuốt-Tái PP, GL", "GIAT_CS_CAN_CS_TUOT_TAI_PP_GL"],
  ["5s", "5S"], ["5S", "5S"],
  ["Học việc, đào tạo", "HOC_VIEC_DAO_TAO"],
  ["Học việc", "HOC_VIEC_DAO_TAO"],
  ["Đi muộn về sớm", "DI_MUON_VE_SOM"],
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

const normalizeKey = (value) => String(value || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
  .replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();

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
    if (!Array.isArray(parsed)) {
      parsed = line?.defects_json;
      if (typeof parsed === "string") { try { parsed = JSON.parse(parsed); } catch { parsed = null; } }
      if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.defects)) parsed = parsed.defects;
    }
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (!item || typeof item !== "object") continue;
        const quantity = Number(item.quantity ?? item.qty ?? item.ng_quantity ?? 0) || 0;
        if (quantity <= 0) continue;
        const normalized = canonicalDefect({
          id: Number(item.id) || undefined,
          defect_type_id: Number(item.defect_type_id ?? item.type_id) || undefined,
          defect_code: item.defect_code || item.defect_type_code || item.code,
          defect_name: item.defect_name || item.defect_type_name || item.name || item.label,
          quantity: Math.trunc(quantity)
        });
        if (normalized) result.push(normalized);
      }
    } else if (parsed && typeof parsed === "object") {
      for (const [key, value] of Object.entries(parsed)) {
        if (["selectedDefects", "selectedNg", "total", "ngQuantity"].includes(key)) continue;
        const raw = value && typeof value === "object" ? value : {};
        const quantity = Number(raw.quantity ?? raw.qty ?? raw.ng_quantity ?? value) || 0;
        if (quantity <= 0) continue;
        const item = canonicalDefect({ id: Number(raw.id) || undefined, defect_type_id: Number(raw.defect_type_id ?? raw.type_id) || undefined, defect_code: raw.defect_code || raw.defect_type_code || raw.code || key, defect_name: raw.defect_name || raw.defect_type_name || raw.name || raw.label, quantity: Math.trunc(quantity) });
        if (item) result.push(item);
      }
    }
  }
  return result;
}

function sortDefects(values) {
  return [...values].sort((a, b) => String(a.defect_name).localeCompare(String(b.defect_name), "vi"));
}

function defectTotal(values) {
  return (Array.isArray(values) ? values : []).reduce((sum, item) => sum + Math.max(0, Math.trunc(Number(item?.quantity) || 0)), 0);
}

function legacyDefectValues(report) {
  const values = [];
  for (const [field, code, name] of LEGACY_DEFECT_FIELDS) {
    const quantity = Math.trunc(Number(report?.[field] ?? 0) || 0);
    if (quantity > 0) values.push({ defect_code: code, defect_name: name, quantity });
  }
  return values;
}

function mergeDefects(report, rows = [], machineLines = []) {
  const child = [];
  const addChild = (item) => {
    const canonical = canonicalDefect(item);
    if (!canonical) return;
    const quantity = Math.trunc(Number(canonical.quantity ?? 0) || 0);
    if (quantity <= 0) return;
    const typeId = Number(canonical.defect_type_id ?? canonical.id) || null;
    const code = String(canonical.defect_code || "").trim();
    const name = String(canonical.defect_name || "").trim();
    const key = typeId ? `ID:${typeId}` : code ? `CODE:${code}` : `NAME:${name}`;
    const existing = child.find((x) => x.key === key);
    if (existing) existing.value.quantity += quantity;
    else child.push({ key, value: { id: typeId || undefined, defect_type_id: typeId || undefined, defect_code: code || undefined, defect_name: name || code || `Lỗi NG #${typeId || "?"}`, quantity } });
  };
  (Array.isArray(rows) ? rows : []).forEach(addChild);
  const childValues = child.map((x) => x.value);

  const legacyValues = legacyDefectValues(report);
  const machineValues = parseMachineDefects(machineLines);
  const parentNg = Math.max(0, Math.trunc(Number(report?.tt_ng) || 0));

  // Prefer the persisted child table when its total agrees with the parent.
  // For legacy imports the aggregate columns are the authoritative detail
  // source when the child table is empty or incomplete.
  if (childValues.length && (!parentNg || defectTotal(childValues) === parentNg)) return sortDefects(childValues);
  if (legacyValues.length && (!parentNg || defectTotal(legacyValues) === parentNg)) return sortDefects(legacyValues.map(canonicalDefect));
  if (machineValues.length && (!parentNg || defectTotal(machineValues) === parentNg)) return sortDefects(machineValues);
  if (childValues.length) return sortDefects(childValues);
  if (legacyValues.length) return sortDefects(legacyValues.map(canonicalDefect));
  if (machineValues.length) return sortDefects(machineValues);
  return [];
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try { return JSON.parse(value); } catch { return null; }
}

function deductionTypeMatches(type, value) {
  const needle = normalizeKey(value);
  if (!needle) return false;
  const candidates = [type?.deduction_code, type?.code, type?.deduction_name, type?.name]
    .map(normalizeKey).filter(Boolean);
  const needleAlias = deductionAliasCode(value);
  return candidates.some((candidate) => {
    const candidateAlias = deductionAliasCode(candidate);
    return candidate === needle || candidate.includes(needle) || needle.includes(candidate)
      || candidateAlias === needleAlias;
  });
}

function findDeductionType(types, value) {
  return (Array.isArray(types) ? types : []).find((type) => deductionTypeMatches(type, value)) || null;
}

function addDeduction(merged, item, deductionTypes = [], hoursOverride = null) {
  const rawHours = hoursOverride == null
    ? Number(item?.hours ?? item?.deduction_hours ?? item?.value ?? item?.time ?? 0) || 0
    : Number(hoursOverride) || 0;
  if (rawHours <= 0) return;
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
    parsed.forEach((item) => addDeduction(merged, item, deductionTypes, Number(item?.hours ?? item?.deduction_hours ?? item?.value ?? item?.time ?? 0) * hoursScale));
    return;
  }
  const nested = parsed.deductions || parsed.deductionDetails || parsed.deduction_details || parsed.items || parsed.columns;
  if (Array.isArray(nested)) nested.forEach((item) => addDeduction(merged, item, deductionTypes, Number(item?.hours ?? item?.deduction_hours ?? item?.value ?? item?.time ?? 0) * hoursScale));
  else if (nested && typeof nested === 'object') {
    for (const [name, value] of Object.entries(nested)) addDeduction(merged, { deduction_name: name, hours: Number(value) * hoursScale }, deductionTypes);
  } else {
    for (const [name, value] of Object.entries(parsed)) {
      if (["total", "totalHours", "selectedDeductions", "deductions", "deductionDetails", "deduction_details", "columns"].includes(name)) continue;
      const raw = value && typeof value === 'object' ? value : { hours: value };
      addDeduction(merged, { ...raw, deduction_name: raw.deduction_name || raw.name || name }, deductionTypes, Number(raw.hours ?? raw.deduction_hours ?? raw.value ?? raw.time ?? value) * hoursScale);
    }
  }
}

function extractLegacyDeductionCandidates(extra) {
  const result = [];
  const seen = new Set();
  const visit = (node, depth = 0) => {
    if (node == null || depth > 5) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      const alias = deductionAliasCode(key);
      const known = LEGACY_DEDUCTION_FIELDS.some(([label, code]) => code === alias);
      if (known) {
        const raw = value && typeof value === 'object'
          ? (value.hours ?? value.deduction_hours ?? value.minutes ?? value.value ?? value.time)
          : value;
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) {
          const marker = `${alias}:${n}`;
          if (!seen.has(marker)) {
            seen.add(marker);
            result.push({ label: key, code: alias, rawValue: n });
          }
        }
      }
      visit(value, depth + 1);
    }
  };
  visit(extra);
  return result;
}

function normalizeLegacyDeductionHours(candidates, report) {
  const expectedHours = Math.max(0, Number(report?.deduction_time) || 0);
  if (!candidates.length) return [];
  const totalRaw = candidates.reduce((sum, item) => sum + item.rawValue, 0);
  const totalAsHours = totalRaw;
  const totalAsMinutes = totalRaw / 60;
  const scale = expectedHours > 0 && Math.abs(totalAsHours - expectedHours) <= 0.01
    ? 1
    : expectedHours > 0 && Math.abs(totalAsMinutes - expectedHours) <= 0.01
      ? (1 / 60)
      : 1;
  return candidates.map((item) => ({ ...item, hours: item.rawValue * scale }));
}

function normalizeDeductions(rows = [], report = null, machineLines = [], deductionTypes = []) {
  const merged = new Map();
  (Array.isArray(rows) ? rows : []).forEach((item) => addDeduction(merged, item, deductionTypes));

  if (merged.size === 0) {
    for (const line of Array.isArray(machineLines) ? machineLines : []) addDeductionsJson(merged, line?.deductions_json, deductionTypes);
  }

  if (merged.size === 0) {
    const extra = parseJson(report?.extra_data);
    const candidates = normalizeLegacyDeductionHours(extractLegacyDeductionCandidates(extra), report);
    for (const item of candidates) {
      const type = findDeductionType(deductionTypes, item.code) || findDeductionType(deductionTypes, item.label);
      addDeduction(merged, {
        deduction_type_id: type?.id,
        deduction_code: type?.deduction_code || type?.code || item.code,
        deduction_name: type?.deduction_name || type?.name || item.label,
        hours: item.hours
      }, deductionTypes);
    }
  }

  if (merged.size === 0) {
    const parentHours = Math.max(0, Number(report?.deduction_time || 0) || 0);
    if (parentHours > 0) merged.set("UNCLASSIFIED", { deduction_type_id: undefined, deduction_code: "TRU_GIO_UNCLASSIFIED", deduction_name: "Trừ giờ chưa phân loại", hours: parentHours });
  }
  return [...merged.values()];
}

module.exports = { mergeDefects, normalizeDeductions, LEGACY_DEFECT_FIELDS, CANONICAL_GC_DEFECTS, parseMachineDefects };