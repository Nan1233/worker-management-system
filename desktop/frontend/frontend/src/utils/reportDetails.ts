import type { ProductionDefect, ProductionReport } from "../types/production";

const legacyFields: Array<[keyof ProductionReport, string, string]> = [
    ["kqd_dap_lai", "KQD_DAP_LAI", "KQD dập lại"], ["kqd_tuot", "KQD_TUOT", "KQD tuốt"],
    ["vo_do_long", "VO_DO_LONG", "Vỡ/đổ lồng"], ["xuoc_do_long", "XUOC_DO_LONG", "Xước/đổ lồng"],
    ["cong_gay", "CONG_GAY", "Cong gãy"], ["xoay", "XOAY", "Cao su xoay"],
    ["khong_dut", "KHONG_DUT", "Cắt không đứt"], ["bavia_hut", "BAVIA_HUT", "Bavia/hụt"],
    ["ppcm", "PPCM", "PPCM"], ["loi_cao_su", "LOI_CAO_SU", "Lỗi cao su"],
    ["ng_kich_thuoc", "NG_KICH_THUOC", "NG kích thước"], ["cat_lem", "CAT_LEM", "Cắt lẹm"]
];

const normalize = (value: unknown) => String(value || "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();

export const getAllReportDefects = (report: ProductionReport): ProductionDefect[] => {
    const map = new Map<string, ProductionDefect>();
    const add = (item: ProductionDefect, index: number) => {
        const quantity = Number(item.quantity || 0);
        if (quantity <= 0) return;
        const key = item.defect_type_id ? `ID:${item.defect_type_id}` : `CODE:${normalize(item.defect_code || item.defect_name || index)}`;
        const old = map.get(key);
        if (old) old.quantity = Number(old.quantity || 0) + quantity;
        else map.set(key, { ...item, quantity, defect_name: item.defect_name || item.defect_code || `Lỗi NG ${index + 1}` });
    };
    (Array.isArray(report.defects) ? report.defects : []).forEach(add);
    legacyFields.forEach(([field, code, name], index) => {
        const quantity = Number(report[field] || 0);
        if (quantity <= 0) return;
        const exists = [...map.values()].some(item => [code, name].map(normalize).includes(normalize(item.defect_code || item.defect_name)));
        if (!exists) add({ defect_code: code, defect_name: name, quantity }, map.size + index);
    });
    return [...map.values()];
};
