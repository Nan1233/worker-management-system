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
  ["ng_kich_thuoc", "KT_LON", "KT kích thước"], ["cat_lem", "CAT_LEM", "Cắt lẹm"]
];

const LEGACY_MACHINE_KEYS = new Map([
  ["KQD_DAP_LAI", "KQD"], ["KQD_TUOT", "KQD"], ["KQD_DL", "KQD"],
  ["VO_DO_LONG", "VO_CAO_SU"], ["VO_LONG", "VO_CAO_SU"],
  ["XUOC_DO_LONG", "K_XUOC_CONG_GAY"], ["XUOC_LONG", "K_XUOC_CONG_GAY"],
  ["CONG_GAY", "K_XUOC_CONG_GAY"], ["XOAY", "CAO_SU_XOAY"],
  ["KHONG_DUT", "CAT_KHONG_DUT"], ["BAVIA", "BAVIA"], ["BAVIA_HUT", "BAVIA"],
  ["PPCM", "PPCM"], ["CAO_SU", "LCS"], ["LOI_CAO_SU", "LCS"], ["CAT_LEM", "CAT_LEM"]
]);

const normalizeKey = (value) => String(value || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
  .replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();

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

function mergeDefects(report, rows = [], machineLines = []) {
  const merged = new Map();
  const add = (item) => {
    const canonical = canonicalDefect(item);
    if (!canonical) return;
    const quantity = Math.trunc(Number(canonical.quantity ?? 0) || 0);
    if (quantity <= 0) return;
    const typeId = Number(canonical.defect_type_id ?? canonical.id) || null;
    const code = String(canonical.defect_code || "").trim();
    const name = String(canonical.defect_name || "").trim();
    const key = typeId ? `ID:${typeId}` : code ? `CODE:${code}` : `NAME:${name}`;
    const existing = merged.get(key);
    if (existing) existing.quantity += quantity;
    else merged.set(key, { id: typeId || undefined, defect_type_id: typeId || undefined, defect_code: code || undefined, defect_name: name || code || `Lỗi NG #${typeId || "?"}`, quantity });
  };

  (Array.isArray(rows) ? rows : []).forEach(add);
  if (merged.size > 0) return [...merged.values()].sort((a, b) => String(a.defect_name).localeCompare(String(b.defect_name), "vi"));

  // Legacy approved imports kept NG in production_reports columns while the
  // child table production_report_defects was empty. The Excel exporter must
  // read those persisted columns too; this is the same source used by the
  // one-off repair SQL in backend/sql/repair_legacy_approved_report_details_20260930.sql.
  LEGACY_DEFECT_FIELDS.forEach(([field, code, name]) => {
    const quantity = Math.trunc(Number(report?.[field] ?? 0) || 0);
    if (quantity > 0) add({ defect_code: code, defect_name: name, quantity });
  });
  if (merged.size > 0) return [...merged.values()].sort((a, b) => String(a.defect_name).localeCompare(String(b.defect_name), "vi"));

  const mode = String(report?.operation_mode || "").trim().toUpperCase();
  if (mode === "MACHINE" || (Array.isArray(machineLines) && machineLines.length > 0)) return [];
  return [...merged.values()].sort((a, b) => String(a.defect_name).localeCompare(String(b.defect_name), "vi"));
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
  return candidates.some((candidate) => candidate === needle || candidate.includes(needle) || needle.includes(candidate));
}

function findDeductionType(types, value) {
  return (Array.isArray(types) ? types : []).find((type) => deductionTypeMatches(type, value)) || null;
}

function addDeduction(merged, item, deductionTypes = []) {
  const hours = Number(item?.hours ?? item?.deduction_hours ?? item?.value ?? item?.time ?? 0) || 0;
  if (hours <= 0) return;
  const type = item?.deduction_type_id
    ? (Array.isArray(deductionTypes) ? deductionTypes.find((candidate) => Number(candidate.id) === Number(item.deduction_type_id)) : null)
    : findDeductionType(deductionTypes, item?.deduction_code || item?.deduction_name || item?.name || item?.label || item?.code);
  const typeId = Number(item?.deduction_type_id || type?.id) || null;
  const code = String(item?.deduction_code || item?.code || type?.deduction_code || type?.code || '').trim();
  const name = String(item?.deduction_name || item?.name || item?.label || type?.deduction_name || type?.name || '').trim();
  const key = typeId ? `ID:${typeId}` : code ? `CODE:${normalizeKey(code)}` : `NAME:${normalizeKey(name)}`;
  const existing = merged.get(key);
  if (existing) existing.hours += hours;
  else merged.set(key, { ...item, deduction_type_id: typeId || undefined, deduction_code: code || undefined, deduction_name: name || code || 'Trừ giờ', hours });
}

function addDeductionsJson(merged, value, deductionTypes = []) {
  const parsed = parseJson(value);
  if (!parsed) return;
  if (Array.isArray(parsed)) {
    parsed.forEach((item) => addDeduction(merged, item, deductionTypes));
    return;
  }
  const nested = parsed.deductions || parsed.items || parsed.columns;
  if (Array.isArray(nested)) nested.forEach((item) => addDeduction(merged, item, deductionTypes));
  else if (nested && typeof nested === 'object') {
    for (const [name, value] of Object.entries(nested)) addDeduction(merged, { deduction_name: name, hours: value }, deductionTypes);
  } else {
    for (const [name, value] of Object.entries(parsed)) {
      if (["total", "totalHours", "selectedDeductions"].includes(name)) continue;
      const raw = value && typeof value === 'object' ? value : { hours: value };
      addDeduction(merged, { ...raw, deduction_name: raw.deduction_name || raw.name || name }, deductionTypes);
    }
  }
}

function normalizeDeductions(rows = [], report = null, machineLines = [], deductionTypes = []) {
  const merged = new Map();
  (Array.isArray(rows) ? rows : []).forEach((item) => addDeduction(merged, item, deductionTypes));

  if (merged.size === 0) {
    for (const line of Array.isArray(machineLines) ? machineLines : []) addDeductionsJson(merged, line?.deductions_json, deductionTypes);
  }

  // Legacy SQL imports stored the original form's detail columns in
  // production_reports.extra_data.columns. Use only keys that resolve to a
  // real deduction type for this process, so product/output fields are never
  // accidentally exported as deduction hours.
  if (merged.size === 0) {
    const extra = parseJson(report?.extra_data);
    const columns = extra?.columns;
    if (columns && typeof columns === 'object') {
      for (const [name, value] of Object.entries(columns)) {
        const type = findDeductionType(deductionTypes, name);
        if (type) addDeduction(merged, { deduction_type_id: type.id, deduction_code: type.deduction_code || type.code, deduction_name: type.deduction_name || type.name, hours: value }, deductionTypes);
      }
    }
  }

  if (merged.size === 0) {
    const parentHours = Math.max(0, Number(report?.deduction_time || 0) || 0);
    if (parentHours > 0) merged.set("UNCLASSIFIED", { deduction_type_id: undefined, deduction_code: "TRU_GIO_UNCLASSIFIED", deduction_name: "Trừ giờ chưa phân loại", hours: parentHours });
  }
  return [...merged.values()];
}

module.exports = { mergeDefects, normalizeDeductions, LEGACY_DEFECT_FIELDS, CANONICAL_GC_DEFECTS, parseMachineDefects };