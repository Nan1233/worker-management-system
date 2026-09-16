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
  ["ppcm", "PPCM", "PPCM"], ["loi_cao_su", "LCS", "LCS"], ["cat_lem", "CAT_LEM", "Cắt lẹm"]
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
    return {
      ...item,
      id: defectTypeId,
      defect_type_id: defectTypeId,
      defect_code: defectCode || undefined,
      defect_name: defectName || defectCode || `Lỗi NG #${defectTypeId || "?"}`
    };
  }

  return { ...item, defect_code: canonicalCode, defect_name: CANONICAL_GC_DEFECTS.get(canonicalCode) };
}

function parseMachineDefectEntry(key, value) {
  const raw = value && typeof value === "object" ? value : {};
  const quantity = Number(raw.quantity ?? raw.qty ?? raw.ng_quantity ?? value);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const code = raw.defect_code || raw.defect_type_code || raw.code || key;
  return canonicalDefect({
    id: Number(raw.id) || undefined,
    defect_type_id: Number(raw.defect_type_id ?? raw.type_id) || undefined,
    defect_code: code,
    defect_name: raw.defect_name || raw.defect_type_name || raw.name || raw.label,
    quantity: Math.trunc(quantity)
  });
}

function parseMachineDefects(machineLines = []) {
  const result = [];
  for (const line of Array.isArray(machineLines) ? machineLines : []) {
    let parsed = line?.defects;
    if (!Array.isArray(parsed)) {
      const raw = line?.defects_json;
      if (!raw) continue;
      parsed = raw;
      if (typeof raw === "string") {
        try { parsed = JSON.parse(raw); } catch { parsed = null; }
      }
      if (!parsed) continue;
      if (!Array.isArray(parsed) && Array.isArray(parsed.defects)) parsed = parsed.defects;
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
      continue;
    }

    if (typeof parsed === "object") {
      for (const [key, value] of Object.entries(parsed)) {
        if (["selectedDefects", "selectedNg", "total", "ngQuantity"].includes(key)) continue;
        const item = parseMachineDefectEntry(key, value);
        if (item) result.push(item);
      }
    }
  }
  return result;
}

function mergeDefects(report, rows = [], machineLines = []) {
  const machineDefects = parseMachineDefects(machineLines);
  const sourceRows = machineDefects.length ? machineDefects : rows;
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
    else merged.set(key, {
      id: typeId || undefined,
      defect_type_id: typeId || undefined,
      defect_code: code || undefined,
      defect_name: name || code || `Lỗi NG #${typeId || "?"}`,
      quantity
    });
  };

  sourceRows.forEach(add);
  if (!machineDefects.length) {
    LEGACY_DEFECT_FIELDS.forEach(([field, code, name]) => {
      const quantity = Math.trunc(Number(report?.[field] ?? 0) || 0);
      if (quantity > 0) add({ defect_code: code, defect_name: name, quantity });
    });
  }
  return [...merged.values()].sort((a, b) => String(a.defect_name).localeCompare(String(b.defect_name), "vi"));
}

function normalizeDeductions(rows = []) {
  const merged = new Map();
  rows.forEach((item) => {
    const hours = Number(item?.hours ?? 0) || 0;
    if (hours <= 0) return;
    const typeId = Number(item?.deduction_type_id) || null;
    const key = typeId ? `ID:${typeId}` : `CODE:${normalizeKey(item?.deduction_code || item?.deduction_name || '')}`;
    if (merged.has(key)) merged.get(key).hours += hours;
    else merged.set(key, { ...item, hours });
  });
  return [...merged.values()];
}

module.exports = { mergeDefects, normalizeDeductions, LEGACY_DEFECT_FIELDS, CANONICAL_GC_DEFECTS, parseMachineDefects };
