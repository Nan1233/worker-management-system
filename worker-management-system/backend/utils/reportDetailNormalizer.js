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

function mergeDefects(report, rows = []) {
    const merged = new Map();
    const add = (item, fallbackIndex = 0) => {
        const quantity = Number(item?.quantity ?? 0) || 0;
        if (quantity <= 0) return;
        const code = String(item?.defect_code || "").trim();
        const name = String(item?.defect_name || "").trim();
        const typeId = Number(item?.defect_type_id) || null;
        const key = typeId ? `ID:${typeId}` : `CODE:${normalizeKey(code || name || `LOI_${fallbackIndex}`)}`;
        const existing = merged.get(key);
        if (existing) {
            existing.quantity += quantity;
            if (!existing.defect_name && name) existing.defect_name = name;
            if (!existing.defect_code && code) existing.defect_code = code;
            return;
        }
        merged.set(key, {
            id: Number(item?.id) || undefined,
            defect_type_id: typeId || undefined,
            defect_code: code || undefined,
            defect_name: name || code || `Lỗi NG ${fallbackIndex + 1}`,
            quantity
        });
    };

    rows.forEach(add);
    LEGACY_DEFECT_FIELDS.forEach(([field, code, name], index) => {
        const quantity = Number(report?.[field] ?? 0) || 0;
        if (quantity <= 0) return;
        const key = `CODE:${normalizeKey(code)}`;
        const alreadyIncluded = [...merged.values()].some((item) => {
            const itemKey = normalizeKey(item.defect_code || item.defect_name);
            return itemKey === normalizeKey(code) || itemKey === normalizeKey(name);
        });
        if (!alreadyIncluded) add({ defect_code: code, defect_name: name, quantity }, rows.length + index);
    });

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

module.exports = { mergeDefects, normalizeDeductions, LEGACY_DEFECT_FIELDS };
