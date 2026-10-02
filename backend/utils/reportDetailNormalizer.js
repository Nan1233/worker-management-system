'use strict';

const CANONICAL_GC_DEFECTS = new Map([
  ['CAT01', 'Cao su không đứt'], ['CAT02', 'Cắt lẹm'], ['CAT03', 'Cắt phạm'],
  ['CAT04', 'Cao su ngắn'], ['CAT05', 'Cao su dài'], ['CAT06', 'Bavia cao su'],
  ['CAT07', 'Phế phẩm chỉnh máy'], ['CAT08', 'Lỗi cao su ( NCC )'], ['CAT09', 'Lẫn cao su'],
  ['CAT10', 'Khác'], ['LONG01', 'Không qua dưỡng'], ['LONG02', 'Cao su vỡ'],
  ['LONG03', 'Trục xước'], ['LONG04', 'Trục gãy, cong'], ['LONG05', 'Thiếu cao su'],
  ['LONG06', 'Lẫn trục'], ['LONG07', 'Lẫn cao su'], ['LONG08', 'Khác'], ['XOAY', 'Cao su xoay']
]);

// Legacy codes are already the FE canonical identity. Keep CAT/LONG spelling
// exactly as used by the FE and the existing canonical-defect contract tests.
const LEGACY_CODE_TO_GC = new Map([
  ['CAT01','CAT01'], ['CAT02','CAT02'], ['CAT03','CAT03'], ['CAT04','CAT04'], ['CAT05','CAT05'],
  ['CAT06','CAT06'], ['CAT07','CAT07'], ['CAT08','CAT08'], ['CAT09','CAT09'], ['CAT10','CAT10'],
  ['LONG01','LONG01'], ['LONG02','LONG02'], ['LONG03','LONG03'], ['LONG04','LONG04'],
  ['LONG05','LONG05'], ['LONG06','LONG06'], ['LONG07','LONG07'], ['LONG08','LONG08']
]);

// Legacy/FE wording -> one canonical FE/DB defect identity.
// Unmatched values intentionally fall back to CAT10 (Khác).
const DEFECT_ALIASES = new Map([
  ['KQD','CAT01'], ['KQD_DAP_LAI','CAT01'], ['KQD_TUOT','CAT01'], ['KQD_DL','CAT01'],
  ['CAT_KHONG_DUT','CAT01'], ['KHONG_DUT','CAT01'], ['KHONG_DUT_CAO_SU','CAT01'],
  ['CAO_SU_KHONG_DUT','CAT01'], ['CAT_KHONG_DU','CAT01'], ['CAT_KO_DUT','CAT01'],
  ['CAT_LEM','CAT02'], ['CAT_LEM_CAO_SU','CAT02'], ['CAT_LEM_CAT_LEM','CAT02'],
  ['CAT_PHAM','CAT03'], ['CAT_PHAM_CAO_SU','CAT03'],
  ['CAO_SU_NGAN','CAT04'], ['CHAN_NGAN','CAT04'],
  ['CAO_SU_DAI','CAT05'], ['CHAN_DAI','CAT05'],
  ['BAVIA','CAT06'], ['BAVIA_HUT','CAT06'], ['SOT_VIA','CAT06'],
  ['PPCM','CAT07'], ['PHAN_PHOI_CHINH_MAY','CAT07'], ['PHE_PHAM_CHINH_MAY','CAT07'],
  ['LCS','CAT08'], ['CSH','CAT08'], ['CAO_SU','CAT08'], ['LOI_CAO_SU','CAT08'],
  ['LOI_CAO_SU_NCC','CAT08'], ['CAO_SU_NCC','CAT08'],
  ['LAN_CAO_SU','CAT09'],
  ['KT_LON','CAT10'], ['KT_LON_HON','CAT10'], ['KT_NHO','CAT10'],
  ['NG_KICH_THUOC','CAT10'], ['KICH_THUOC','CAT10'],
  ['KHAC','CAT10'], ['OTHER','CAT10'], ['UNKNOWN','CAT10'],
  ['KHONG_QUA_DUONG','LONG01'], ['KHONG_QUA_DUONG_LON','LONG01'],
  ['VO_CAO_SU','LONG02'], ['VO_DO_LONG','LONG02'], ['VO_LONG','LONG02'],
  ['XUOC_DO_LONG','LONG03'], ['XUOC_LONG','LONG03'], ['K_XUOC','LONG03'], ['TRUC_XUOC','LONG03'],
  ['CONG_GAY','LONG04'], ['K_XUOC_CONG_GAY','LONG04'], ['TRUC_GAY','LONG04'], ['TRUC_CONG','LONG04'],
  ['THIEU_CAO_SU','LONG05'], ['THIEU_CS','LONG05'],
  ['LAN_TRUC','LONG06'],
  ['LAN_CAO_SU_TRUC','LONG07'],
  ['CAO_SU_XOAY','XOAY'], ['XOAY','XOAY'],
  ['CAT01','CAT01'], ['CAT02','CAT02'], ['CAT03','CAT03'], ['CAT04','CAT04'], ['CAT05','CAT05'],
  ['CAT06','CAT06'], ['CAT07','CAT07'], ['CAT08','CAT08'], ['CAT09','CAT09'], ['CAT10','CAT10'],
  ['LONG01','LONG01'], ['LONG02','LONG02'], ['LONG03','LONG03'], ['LONG04','LONG04'],
  ['LONG05','LONG05'], ['LONG06','LONG06'], ['LONG07','LONG07'], ['LONG08','LONG08']
]);

const LEGACY_DEFECT_FIELDS = [
  ['kqd_dap_lai', 'CAT01', 'Cao su không đứt'], ['kqd_tuot', 'CAT01', 'Cao su không đứt'],
  ['vo_do_long', 'LONG02', 'Cao su vỡ'], ['xuoc_do_long', 'LONG03', 'Trục xước'],
  ['cong_gay', 'LONG04', 'Trục gãy, cong'], ['xoay', 'XOAY', 'Cao su xoay'],
  ['khong_dut', 'CAT01', 'Cao su không đứt'], ['bavia_hut', 'CAT06', 'Bavia cao su'],
  ['ppcm', 'CAT07', 'Phế phẩm chỉnh máy'], ['loi_cao_su', 'CAT08', 'Lỗi cao su ( NCC )'],
  ['ng_kich_thuoc', 'CAT10', 'Khác'], ['cat_lem', 'CAT02', 'Cắt lẹm']
];

const normalizeKey = (value) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();

function resolveCanonicalCode(item = {}) {
  const rawCode = normalizeKey(item.defect_code || item.defect_type_code || item.code);
  const rawName = normalizeKey(item.defect_name || item.name || item.label);
  const candidates = [rawCode, rawName].filter(Boolean);
  for (const value of candidates) {
    if (DEFECT_ALIASES.has(value)) return DEFECT_ALIASES.get(value);
    if (LEGACY_CODE_TO_GC.has(value)) return LEGACY_CODE_TO_GC.get(value);
    if (CANONICAL_GC_DEFECTS.has(value)) return value;
  }
  return null;
}

function canonicalDefect(item = {}) {
  const defectTypeId = Number(item.defect_type_id ?? item.id) || undefined;
  const code = resolveCanonicalCode(item);
  const rawName = String(item.defect_name || item.name || item.label || '').trim();
  const rawCode = String(item.defect_code || item.defect_type_code || item.code || '').trim();
  const canonicalCode = code || 'CAT10';

  return {
    ...item,
    id: defectTypeId,
    defect_type_id: defectTypeId,
    defect_code: canonicalCode,
    defect_name: CANONICAL_GC_DEFECTS.get(canonicalCode) || 'Khác',
    source_defect_code: rawCode || undefined,
    source_defect_name: rawName || undefined
  };
}

function parseMachineDefects(machineLines = []) {
  const result = [];
  for (const line of Array.isArray(machineLines) ? machineLines : []) {
    let parsed = line?.defects;
    if (!Array.isArray(parsed)) {
      parsed = line?.defects_json;
      if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { parsed = null; } }
      if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.defects)) parsed = parsed.defects;
    }
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const quantity = Math.trunc(Number(item.quantity ?? item.qty ?? item.ng_quantity ?? 0) || 0);
        if (quantity <= 0) continue;
        result.push(canonicalDefect({
          id: Number(item.id) || undefined,
          defect_type_id: Number(item.defect_type_id ?? item.type_id) || undefined,
          defect_code: item.defect_code || item.defect_type_code || item.code,
          defect_name: item.defect_name || item.defect_type_name || item.name || item.label,
          quantity
        }));
      }
    } else if (parsed && typeof parsed === 'object') {
      for (const [key, value] of Object.entries(parsed)) {
        if (['selectedDefects','selectedNg','total','ngQuantity'].includes(key)) continue;
        const raw = value && typeof value === 'object' ? value : {};
        const quantity = Math.trunc(Number(raw.quantity ?? raw.qty ?? raw.ng_quantity ?? value) || 0);
        if (quantity <= 0) continue;
        result.push(canonicalDefect({
          id: Number(raw.id) || undefined,
          defect_type_id: Number(raw.defect_type_id ?? raw.type_id) || undefined,
          defect_code: raw.defect_code || raw.defect_type_code || raw.code || key,
          defect_name: raw.defect_name || raw.defect_type_name || raw.name || raw.label || key,
          quantity
        }));
      }
    }
  }
  return result;
}

function parseExtraDataDefects(report) {
  let extra = report?.extra_data;
  if (typeof extra === 'string') { try { extra = JSON.parse(extra); } catch { extra = null; } }
  if (!extra || typeof extra !== 'object') return [];

  const columns = extra.columns && typeof extra.columns === 'object' ? extra.columns : extra;
  const result = [];
  for (const [key, value] of Object.entries(columns)) {
    if (['selectedDefects','selectedNg','total','ngQuantity','OK'].includes(key)) continue;
    const raw = value && typeof value === 'object' ? value : {};
    const quantity = Math.trunc(Number(raw.quantity ?? raw.qty ?? raw.ng_quantity ?? value) || 0);
    if (quantity <= 0) continue;
    result.push(canonicalDefect({
      defect_code: raw.defect_code || raw.defect_type_code || raw.code || key,
      defect_name: raw.defect_name || raw.defect_type_name || raw.name || raw.label || key,
      quantity
    }));
  }
  return result;
}

function mergeDefects(report, rows = [], machineLines = []) {
  const merged = new Map();
  const add = (item) => {
    if (!item) return;
    const canonical = canonicalDefect(item);
    const quantity = Math.trunc(Number(canonical.quantity ?? 0) || 0);
    if (quantity <= 0) return;
    const typeId = Number(canonical.defect_type_id ?? canonical.id) || null;
    const code = canonical.defect_code;
    const key = typeId ? `ID:${typeId}` : `CODE:${code}`;
    const existing = merged.get(key);
    if (existing) existing.quantity += quantity;
    else merged.set(key, { ...canonical, id: typeId || undefined, defect_type_id: typeId || undefined, quantity });
  };

  (Array.isArray(rows) ? rows : []).forEach(add);
  if (merged.size > 0) return [...merged.values()].sort((a, b) => String(a.defect_code).localeCompare(String(b.defect_code)));

  const machineParsed = parseMachineDefects(machineLines);
  machineParsed.forEach(add);
  if (merged.size > 0) return [...merged.values()].sort((a, b) => String(a.defect_code).localeCompare(String(b.defect_code)));

  const extraParsed = parseExtraDataDefects(report);
  extraParsed.forEach(add);
  if (merged.size > 0) return [...merged.values()].sort((a, b) => String(a.defect_code).localeCompare(String(b.defect_code)));

  LEGACY_DEFECT_FIELDS.forEach(([field, code, name]) => {
    const quantity = Math.trunc(Number(report?.[field] ?? 0) || 0);
    if (quantity > 0) add({ defect_code: code, defect_name: name, quantity });
  });
  return [...merged.values()].sort((a, b) => String(a.defect_code).localeCompare(String(b.defect_code)));
}

function normalizeDeductions(rows = [], report = null) {
  const merged = new Map();
  (Array.isArray(rows) ? rows : []).forEach((item) => {
    const hours = Number(item?.hours ?? item?.deduction_hours ?? 0) || 0;
    if (hours <= 0) return;
    const typeId = Number(item?.deduction_type_id) || null;
    const key = typeId ? `ID:${typeId}` : `CODE:${normalizeKey(item?.deduction_code || item?.deduction_name || '')}`;
    if (merged.has(key)) merged.get(key).hours += hours;
    else merged.set(key, { ...item, hours });
  });
  if (merged.size === 0) {
    const parentHours = Math.max(0, Number(report?.deduction_time || 0) || 0);
    if (parentHours > 0) merged.set('UNCLASSIFIED', { deduction_type_id: undefined, deduction_code: 'TRU_GIO_UNCLASSIFIED', deduction_name: 'Trừ giờ chưa phân loại', hours: parentHours });
  }
  return [...merged.values()];
}

module.exports = { mergeDefects, normalizeDeductions, LEGACY_DEFECT_FIELDS, CANONICAL_GC_DEFECTS, parseMachineDefects, parseExtraDataDefects, canonicalDefect, normalizeKey };