import { getExtraFields } from "./processFormSchemas";

export type ExtraFieldDefinition = {
    key: string;
    label: string;
    type: "text" | "number" | "date";
    required?: boolean;
    placeholder?: string;
    unit?: string;
};

const slugs = ["cat-long", "mai", "do", "kiem-1", "kiem-2", "can", "ep", "bavia", "sx3"];

/**
 * Các trường đặc thù lấy từ schema hiện tại và các hạng mục bắt buộc trong
 * workbook mẫu `Form nhập`. Workbook không được đọc trực tiếp khi runtime.
 */
const SAMPLE_FORM_FIELDS: Record<string, ExtraFieldDefinition[]> = {
    "cat-long": [
        { key: "kqd_dap_lai", label: "KQD dập lại", type: "number" },
        { key: "kqd_tuot", label: "KQD tuốt", type: "number" },
    ],
    mai: [
        { key: "productivity_percent", label: "% Năng suất", type: "number", unit: "%" },
        { key: "slok", label: "SLOK", type: "number" },
        { key: "slng", label: "SLNG", type: "number" },
        { key: "kqd", label: "KQD", type: "number" },
        { key: "xo_cs", label: "Xô cs", type: "number" },
        { key: "ppcm_power_loss", label: "PPCM mất điện", type: "number" },
        { key: "fallen_goods", label: "Hàng rơi", type: "number" },
        { key: "k_coleet", label: "K- coleet", type: "number" },
        { key: "thieu_lan_csh", label: "Thiếu - lẫn csCSH", type: "number" },
        { key: "loi_cao_su_mai", label: "Lỗi cao su", type: "number" },
    ],
    "kiem-1": [
        { key: "actual_output", label: "Thực tích", type: "number" },
    ],
    "kiem-2": [
        { key: "actual_output", label: "Thực tích", type: "number" },
    ],
    sx3: [
        { key: "stop_reason", label: "Lý do dừng máy", type: "text" },
        { key: "stop_operation_minutes", label: "Thời gian dừng máy", type: "number", unit: "phút" },
    ],
};

const toDefinition = (field: ReturnType<typeof getExtraFields>[number]): ExtraFieldDefinition => ({
    key: field.key,
    label: field.label,
    type: field.kind === "text" ? "text" : field.kind === "date" ? "date" : "number",
    required: field.required,
    placeholder: field.placeholder,
    unit: field.unit,
});

/**
 * Tương thích với ProcessPage hiện tại. Nguồn tiêu đề là schema + các
 * trường đặc thù được đối chiếu từ workbook mẫu.
 */
export const processExtraFields: Record<string, ExtraFieldDefinition[]> = Object.fromEntries(
    slugs.map((slug) => {
        const schemaFields = getExtraFields(slug).map(toDefinition);
        const sampleFields = SAMPLE_FORM_FIELDS[slug] || [];
        const merged = [...schemaFields];
        sampleFields.forEach((field) => {
            if (!merged.some((item) => item.key === field.key)) merged.push(field);
        });
        return [slug, merged];
    })
);
