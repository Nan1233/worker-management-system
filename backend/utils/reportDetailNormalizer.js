'use strict';

// GC defect identities used by the FE master data / defect_types table.
// Keep these codes intact all the way to Excel.  The old CAT01/LONG01
// canonicalization was lossy: it could turn two distinct DB defects that
// share the same name (for example "Khác" and "Lẫn cao su") into the first
// matching legacy code.
const CANONICAL_GC_DEFECTS = new Map([
  ['CUT_1', 'Cao su không đứt'], ['CUT_2', 'Cắt lẹm'], ['CUT_3', 'Cắt phạm'],
  ['CUT_4', 'Cao su ngắn'], ['CUT_5', 'Cao su dài'], ['CUT_6', 'Bavia cao su'],
  ['CUT_7', 'Phế phẩm chỉnh máy'], ['CUT_8', 'Lỗi cao su ( NCC )'], ['CUT_9', 'Lẫn cao su'],
  ['CUT_10', 'Khác'], ['LONG_1', 'Không qua dưỡng'], ['LONG_2', 'Cao su vỡ'],
  ['LONG_3', 'Trục xước'], ['LONG_4', 'Trục gãy, cong'], ['LONG_5', 'Thiếu cao su'],
  ['LONG_6', 'Lẫn trục'], ['LONG_7', 'Lẫn cao su'], ['LONG_8', 'Khác'], ['XOAY', 'Cao su xoay']
]);

const LEGACY_CODE_TO_GC = new Map([
  ['CAT01','CUT_1'], ['CAT02','CUT_2'], ['CAT03','CUT_3'], ['CAT04','CUT_4'], ['CAT05','CUT_5'],
  ['CAT06','CUT_6'], ['CAT07','CUT_7'], ['CAT08','CUT_8'], ['CAT09','CUT_9'], ['CAT10','CUT_10'],
  ['LONG01','LONG_1'], ['LONG02','LONG_2'], ['LONG03','LONG_3'], ['LONG04','LONG_4'],
  ['LONG05','LONG_5'], ['LONG06','LONG_6'], ['LONG07','LONG_7'], ['LONG08','LONG_8']
]);

const LEGACY_DEFECT_FIELDS = [
  ['kqd_dap_lai', 'CUT_1', 'Cao su không đứt'], ['kqd_tuot', 'CUT_1', 'Cao su không đứt'],
  ['vo_do_long', 'LONG_2', 'Cao su vỡ'], ['xuoc_do_long', 'LONG_3', 'Trục xước'],
  ['cong_gay', 'LONG_4', 'Trục gãy, cong'], ['xoay', 'XOAY', 'Cao su xoay'],
  ['khong_dut', 'CUT_1', 'Cao su không đứt'], ['bavia_hut', 'CUT_6', 'Bavia cao su'],
  ['ppcm', 'CUT_7', 'Phế phẩm chỉnh máy'], ['loi_cao_su', 'CUT_8', 'Lỗi cao su ( NCC )'],
  ['ng_kich_thuoc', 'CUT_10', 'Khác'], ['cat_lem', 'CUT_2', 'Cắt lẹm']
];

const LEGACY_MACHINE_KEYS = new Map([
  ['CUT_1','CUT_1'],['CUT_2','CUT_2'],['CUT_3','CUT_3'],['CUT_4','CUT_4'],['CUT_5','CUT_5'],
  ['CUT_6','CUT_6'],['CUT_7','CUT_7'],['CUT_8','CUT_8'],['CUT_9','CUT_9'],['CUT_10','CUT_10'],
  ['LONG_1','LONG_1'],['LONG_2','LONG_2'],['LONG_3','LONG_3'],['LONG_4','LONG_4'],
  ['LONG_5','LONG_5'],['LONG_6','LONG_6'],['LONG_7','LONG_7'],['LONG_8','LONG_8'],['XOAY','XOAY'],
  ['CAT01','CUT_1'],['CAT02','CUT_2'],['CAT03','CUT_3'],['CAT04','CUT_4'],['CAT05','CUT_5'],
  ['CAT06','CUT_6'],['CAT07','CUT_7'],['CAT08','CUT_8'],['CAT09','CUT_9'],['CAT10','CUT_10'],
  ['LONG01','LONG_1'],['LONG02','LONG_2'],['LONG03','LONG_3'],['LONG04','LONG_4'],
  ['LONG05','LONG_5'],['LONG06','LONG_6'],['LONG07','LONG_7'],['LONG08','LONG_8'],
  ['KQD','CUT_1'],['KQD_DAP_LAI','CUT_1'],['KQD_TUOT','CUT_1'],['KQD_DL','CUT_1'],
  ['VO_CAO_SU','LONG_2'],['VO_DO_LONG','LONG_2'],['VO_LONG','LONG_2'],
  ['K_XUOC_CONG_GAY','LONG_3'],['XUOC_DO_LONG','LONG_3'],['XUOC_LONG','LONG_3'],
  ['CONG_GAY','LONG_4'],['CAO_SU_XOAY','XOAY'],['KHONG_DUT','CUT_1'],['CAT_KHONG_DUT','CUT_1'],
  ['BAVIA','CUT_6'],['BAVIA_HUT','CUT_6'],['PPCM','CUT_7'],['LCS','CUT_8'],
  ['CAO_SU','CUT_8'],['LOI_CAO_SU','CUT_8'],['CAT_LEM','CUT_2']
]);

const normalizeKey = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();

function canonicalDefect(item = {}) {
  const rawCode = normalizeKey(item.defect_code || item.defect_type_code || item.code);
  const aliasCode = LEGACY_MACHINE_KEYS.get(rawCode) || rawCode;
  const defectTypeId = Number(item.defect_type_id ?? item.id) || undefined;
  const rawName = String(item.defect_name || item.name || item.label || '').trim();

  // Identity is code/id first. Do not resolve "Khác" / "Lẫn cao su" by name
  // when two different FE/DB defect types can have the same display name.
  if (CANONICAL_GC_DEFECTS.has(aliasCode)) {
    return {
      ...item,
      id: defectTypeId,
      defect_type_id: defectTypeId,
      defect_code: aliasCode,
      defect_name: CANONICAL_GC_DEFECTS.get(aliasCode)
    };
  }

  // Legacy CATxx/LONGxx values are translated to the actual FE/DB codes.
  if (LEGACY_CODE_TO_GC.has(aliasCode)) {
    const code = LEGACY_CODE_TO_GC.get(aliasCode);
    return { ...item, id: defectTypeId, defect_type_id: defectTypeId, defect_code: code, defect_name: CANONICAL_GC_DEFECTS.get(code) };
  }

  // Never invent a canonical code from a display name. Keep the original
  // identity so a valid FE/DB defect can still be matched by type id/code.
  if (!defectTypeId && !rawCode && !rawName) return null;
  return {
    ...item,
    id: defectTypeId,
    defect_type_id: defectTypeId,
    defect_code: String(item.defect_code || item.defect_type_code || item.code || '').trim() || undefined,
    defect_name: rawName || String(item.defect_code || item.defect_type_code || item.code || '').trim() || `Lỗi NG #${defectTypeId || '?'}`
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
        const quantity = Number(item.quantity ?? item.qty ?? item.ng_quantity ?? 0) || 0;
        if (quantity <= 0) continue;
        const normalized = canonicalDefect({ id: Number(item.id) || undefined, defect_type_id: Number(item.defect_type_id ?? item.type_id) || undefined, defect_code: item.defect_code || item.defect_type_code || item.code, defect_name: item.defect_name || item.defect_type_name || item.name || item.label, quantity: Math.trunc(quantity) });
        if (normalized) result.push(normalized);
      }
    } else if (parsed && typeof parsed === 'object') {
      for (const [key, value] of Object.entries(parsed)) {
        if (['selectedDefects','selectedNg','total','ngQuantity'].includes(key)) continue;
        const raw = value && typeof value === 'object' ? value : {};
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
    const code = String(canonical.defect_code || '').trim();
    const name = String(canonical.defect_name || '').trim();
    const key = typeId ? `ID:${typeId}` : code ? `CODE:${code}` : `NAME:${name}`;
    const existing = merged.get(key);
    if (existing) existing.quantity += quantity;
    else merged.set(key, { id: typeId || undefined, defect_type_id: typeId || undefined, defect_code: code || undefined, defect_name: name || code || `Lỗi NG #${typeId || '?'}`, quantity });
  };

  (Array.isArray(rows) ? rows : []).forEach(add);
  if (merged.size > 0) return [...merged.values()].sort((a, b) => String(a.defect_code).localeCompare(String(b.defect_code)));

  const machineParsed = parseMachineDefects(machineLines);
  if (machineParsed.length > 0) {
    machineParsed.forEach(add);
    return [...merged.values()].sort((a, b) => String(a.defect_code).localeCompare(String(b.defect_code)));
  }

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

module.exports = { mergeDefects, normalizeDeductions, LEGACY_DEFECT_FIELDS, CANONICAL_GC_DEFECTS, parseMachineDefects, canonicalDefect, normalizeKey };