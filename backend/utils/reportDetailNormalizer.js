const CANONICAL_GC_DEFECTS = new Map([
  ['CAT01', 'Cao su không đứt'], ['CAT02', 'Cắt lẹm'], ['CAT03', 'Cắt phạm'],
  ['CAT04', 'Cao su ngắn'], ['CAT05', 'Cao su dài'], ['CAT06', 'Bavia cao su'],
  ['CAT07', 'Phế phẩm chỉnh máy'], ['CAT08', 'Lỗi cao su ( NCC )'], ['CAT09', 'Lẫn cao su'],
  ['CAT10', 'Khác'], ['LONG01', 'Không qua dưỡng'], ['LONG02', 'Cao su vỡ'],
  ['LONG03', 'Trục xước'], ['LONG04', 'Trục gãy, cong'], ['LONG05', 'Thiếu cao su'],
  ['LONG06', 'Lẫn trục'], ['LONG07', 'Lẫn cao su'], ['LONG08', 'Khác'], ['XOAY', 'Cao su xoay']
]);

const LEGACY_DEFECT_FIELDS = [
  ['kqd_dap_lai', 'CAT01', 'Cao su không đứt'], ['kqd_tuot', 'CAT01', 'Cao su không đứt'],
  ['vo_do_long', 'LONG02', 'Cao su vỡ'], ['xuoc_do_long', 'LONG03', 'Trục xước'],
  ['cong_gay', 'LONG04', 'Trục gãy, cong'], ['xoay', 'XOAY', 'Cao su xoay'],
  ['khong_dut', 'CAT01', 'Cao su không đứt'], ['bavia_hut', 'CAT06', 'Bavia cao su'],
  ['ppcm', 'CAT07', 'Phế phẩm chỉnh máy'], ['loi_cao_su', 'CAT08', 'Lỗi cao su ( NCC )'],
  ['ng_kich_thuoc', 'CAT10', 'Khác'], ['cat_lem', 'CAT02', 'Cắt lẹm']
];

const LEGACY_MACHINE_KEYS = new Map([
  ['CAT01','CAT01'],['CAT02','CAT02'],['CAT03','CAT03'],['CAT04','CAT04'],['CAT05','CAT05'],
  ['CAT06','CAT06'],['CAT07','CAT07'],['CAT08','CAT08'],['CAT09','CAT09'],['CAT10','CAT10'],
  ['LONG01','LONG01'],['LONG02','LONG02'],['LONG03','LONG03'],['LONG04','LONG04'],
  ['LONG05','LONG05'],['LONG06','LONG06'],['LONG07','LONG07'],['LONG08','LONG08'],['XOAY','XOAY'],
  ['KQD','CAT01'],['KQD_DAP_LAI','CAT01'],['KQD_TUOT','CAT01'],['KQD_DL','CAT01'],
  ['VO_CAO_SU','LONG02'],['VO_DO_LONG','LONG02'],['VO_LONG','LONG02'],
  ['K_XUOC_CONG_GAY','LONG03'],['XUOC_DO_LONG','LONG03'],['XUOC_LONG','LONG03'],
  ['CONG_GAY','LONG04'],['CAO_SU_XOAY','XOAY'],['KHONG_DUT','CAT01'],['CAT_KHONG_DUT','CAT01'],
  ['BAVIA','CAT06'],['BAVIA_HUT','CAT06'],['PPCM','CAT07'],['LCS','CAT08'],
  ['CAO_SU','CAT08'],['LOI_CAO_SU','CAT08'],['CAT_LEM','CAT02']
]);

const normalizeKey = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();

function canonicalDefect(item = {}) {
  const rawCode = normalizeKey(item.defect_code || item.defect_type_code || item.code);
  const aliasCode = LEGACY_MACHINE_KEYS.get(rawCode) || rawCode;
  const nameKey = normalizeKey(item.defect_name || item.name || item.label);
  const canonicalCode = CANONICAL_GC_DEFECTS.has(aliasCode)
    ? aliasCode
    : [...CANONICAL_GC_DEFECTS.entries()].find(([, name]) => normalizeKey(name) === nameKey)?.[0] || null;
  if (!canonicalCode) {
    const defectTypeId = Number(item.defect_type_id ?? item.id) || undefined;
    const defectCode = String(item.defect_code || item.defect_type_code || item.code || '').trim();
    const defectName = String(item.defect_name || item.name || item.label || '').trim();
    if (!defectTypeId && !defectCode && !defectName) return null;
    return { ...item, id: defectTypeId, defect_type_id: defectTypeId, defect_code: defectCode || undefined, defect_name: defectName || defectCode || `Lỗi NG #${defectTypeId || '?'}` };
  }
  return { ...item, defect_code: canonicalCode, defect_name: CANONICAL_GC_DEFECTS.get(canonicalCode) };
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

module.exports = { mergeDefects, normalizeDeductions, LEGACY_DEFECT_FIELDS, CANONICAL_GC_DEFECTS, parseMachineDefects };