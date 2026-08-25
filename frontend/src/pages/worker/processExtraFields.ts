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
    ],
};

/** Các trường do Quản lý/Tổ trưởng kiểm soát, Worker không được nhập. */
const MANAGER_CONTROLLED_WORKER_HIDDEN_KEYS = new Set([
    "actual_output",
    "productivity_percent",
]);

/**
 * Các trường là THỜI LƯỢNG TRỪ theo từng công đoạn.
 * Chúng không được render ở "Thông tin riêng công đoạn" mà được bổ sung
 * vào danh sách của ProcessTimeDeductionSection.
 */
const PROCESS_DEDUCTION_FIELD_KEYS = new Set([
    "vsk_hours",
    "five_s_overtime_hours",
    "mold_warmup_hours",
    "mold_repair_hours",
    "machine_repair_hours",
    "machine_stop_hours",
    "late_early_hours",
    "stop_operation_hours",
    "shortage_hours",
    "stop_operation_minutes",
]);

const toDefinition = (field: ReturnType<typeof getExtraFields>[number]): ExtraFieldDefinition => ({
    key: field.key,
    label: field.label,
    type: field.kind === "text" ? "text" : field.kind === "date" ? "date" : "number",
    required: field.required,
    placeholder: field.placeholder,
    unit: field.unit,
});

export const processExtraFields: Record<string, ExtraFieldDefinition[]> = Object.fromEntries(
    slugs.map((slug) => {
        const schemaFields = getExtraFields(slug)
            .map(toDefinition)
            .filter((field) =>
                !MANAGER_CONTROLLED_WORKER_HIDDEN_KEYS.has(field.key)
                && !PROCESS_DEDUCTION_FIELD_KEYS.has(field.key)
            );
        const sampleFields = (SAMPLE_FORM_FIELDS[slug] || [])
            .filter((field) =>
                !MANAGER_CONTROLLED_WORKER_HIDDEN_KEYS.has(field.key)
                && !PROCESS_DEDUCTION_FIELD_KEYS.has(field.key)
            );
        const merged = [...schemaFields];
        sampleFields.forEach((field) => {
            if (!merged.some((item) => item.key === field.key)) merged.push(field);
        });
        return [slug, merged];
    })
);
