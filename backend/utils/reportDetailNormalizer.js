const CANONICAL_GC_DEFECTS = new Map([
    ["KQD", "KQD"],
    ["VO_CAO_SU", "Vỡ cao su"],
    ["K_XUOC_CONG_GAY", "K xước cong gãy"],
    ["CAO_SU_XOAY", "Cao su xoay"],
    ["CAT_KHONG_DUT", "Cắt không đứt"],
    ["BAVIA", "Bavia"],
    ["CSH", "CSH"],
    ["PPCM", "PPCM"],
    ["KT_LON", "KT lớn"],
    ["KT_NHO", "KT nhỏ"],
    ["LCS", "LCS"],
    ["CAT_LEM", "Cắt lẹm"],
    ["RACH_NVL", "Rách NVL"],
    ["CHAN_NGAN_DAI", "Chân ngắn dài"],
    ["SOT_VIA", "Sót via"],
    ["FURE_TRUC", "Fure trục"],
    ["LAN_CS", "Lẫn CS"],
    ["BAVIA_CAT_HUT", "Bavia cắt hụt"],
    ["THIEU_CAO_SU", "Thiếu cao su"]
]);

const LEGACY_DEFECT_FIELDS = [
    ["kqd_dap_lai", "KQD_DAP_LAI", "KQD dập lại"],
    ["kqd_tuot", "KQD_TUOT", "KQD tuốt"],
    ["vo_do_long", "VO_DO_LONG", "Vỡ/đổ lồng"],
    ["xuoc_do_long", "XUOC_DO_LONG", "Xước/đổ lồng"],
    ["cong_gay", "CONG_GAY", "Cong gãy"],
    ["xoay", "XOAY", "Cao su xoay"],
    ["khong_dut", "KHONG_DUT", "Cắt không đứt"],
    ["bavia_hut", "BAVIA_HUT", "Bavia/hụt"],
    ["ppcm", "PPCM", "PPCM"],
    ["loi_cao_su", "LOI_CAO_SU", "Lỗi cao su"],
    ["ng_kich_thuoc", "NG_KICH_THUOC", "NG kích thước"],
    ["cat_lem", "CAT_LEM", "Cắt lẹm"]
];

const normalizeKey = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();

function canonicalDefect(item = {}) {
    const code = normalizeKey(item.defect_code || item.defect_type_code || item.code);
    const nameKey = normalizeKey(item.defect_name || item.name || item.label);
    const canonicalName = CANONICAL_GC_DEFECTS.get(code) || CANONICAL_GC_DEFECTS.get(nameKey);
    if (!canonicalName) return item;
    const canonicalCode = [...CANONICAL_GC_DEFECTS.entries()].find(([, name]) => name === canonicalName)?.[0] || code;
    return { ...item, defect_code: canonicalCode, defect_name: canonicalName };
}

function parseMachineDefects(machineLines = []) {
    const result = [];
    for (const line of Array.isArray(machineLines) ? machineLines : []) {
        const raw = line?.defects_json;
        if (!raw) continue;
        let parsed = raw;
        if (typeof raw === "string") {
            try { parsed = JSON.parse(raw); } catch { parsed = null; }
        }
        if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.defects)) parsed = parsed.defects;
        if (!Array.isArray(parsed)) continue;
        for (const item of parsed) {
            if (!item || typeof item !== "object") continue;
            const quantity = Number(item.quantity ?? item.qty ?? item.ng_quantity ?? 0) || 0;
            if (quantity <= 0) continue;
            result.push(canonicalDefect({
                id: Number(item.id) || undefined,
                defect_type_id: Number(item.defect_type_id ?? item.type_id) || undefined,
                defect_code: item.defect_code || item.defect_type_code || item.code,
                defect_name: item.defect_name || item.defect_type_name || item.name || item.label,
                quantity
            }));
        }
    }
    return result;
}

function mergeDefects(report, rows = [], machineLines = []) {
    const machineDefects = parseMachineDefects(machineLines);
    const sourceRows = machineDefects.length ? machineDefects : rows;
    const merged = new Map();
    const add = (item, fallbackIndex = 0) => {
        const canonical = canonicalDefect(item);
        const quantity = Number(canonical?.quantity ?? 0) || 0;
        if (quantity <= 0) return;
        const code = String(canonical?.defect_code || "").trim();
        const name = String(canonical?.defect_name || "").trim();
        const typeId = Number(canonical?.defect_type_id) || null;
        const canonicalKey = CANONICAL_GC_DEFECTS.has(normalizeKey(code))
            ? `CODE:${normalizeKey(code)}`
            : typeId ? `ID:${typeId}` : `CODE:${normalizeKey(code || name || `LOI_${fallbackIndex}`)}`;
        const existing = merged.get(canonicalKey);
        if (existing) {
            existing.quantity += quantity;
            return;
        }
        merged.set(canonicalKey, {
            id: Number(canonical?.id) || undefined,
            defect_type_id: typeId || undefined,
            defect_code: code || undefined,
            defect_name: name || code || `Lỗi NG ${fallbackIndex + 1}`,
            quantity
        });
    };

    sourceRows.forEach(add);
    if (!machineDefects.length) {
        LEGACY_DEFECT_FIELDS.forEach(([field, code, name], index) => {
            const quantity = Number(report?.[field] ?? 0) || 0;
            if (quantity <= 0) return;
            const alreadyIncluded = [...merged.values()].some((item) => {
                const itemKey = normalizeKey(item.defect_code || item.defect_name);
                return itemKey === normalizeKey(code) || itemKey === normalizeKey(name);
            });
            if (!alreadyIncluded) add({ defect_code: code, defect_name: name, quantity }, sourceRows.length + index);
        });
    }

    return [...merged.values()].sort((a, b) => String(a.defect_name).localeCompare(String(b.defect_name), "vi"));
}

function normalizeDeductions(rows = []) {
    const merged = new Map();
    rows.forEach((item, index) => {
        const hours = Number(item?.hours ?? 0) || 0;
        if (hours <= 0) return;
        const typeId = Number(item?.deduction_type_id) || null;
        const key = typeId ? `ID:${typeId}` : `CODE:${normalizeKey(item?.deduction_code || item?.deduction_name || `MUC_${index}`)}`;
        if (merged.has(key)) merged.get(key).hours += hours;
        else merged.set(key, { ...item, hours });
    });
    return [...merged.values()];
}

module.exports = { mergeDefects, normalizeDeductions, LEGACY_DEFECT_FIELDS, CANONICAL_GC_DEFECTS, parseMachineDefects };
