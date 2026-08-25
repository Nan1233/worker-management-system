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
 * Chỉ các trường THỰC SỰ là thông tin riêng của công đoạn được hiển thị ở
 * "Thông tin riêng công đoạn".
 *
 * Không đưa vào đây:
 * - OK/NG và chi tiết NG -> Báo cáo chất lượng
 * - Thời gian làm việc -> Hiệu suất & Thời gian
 * - Tất cả thời gian/loại trừ -> Chi tiết trừ giờ
 * - Thực tích / % năng suất -> do Quản lý/Tổ trưởng kiểm soát
 */
const PROCESS_SPECIFIC_FIELDS: Record<string, ExtraFieldDefinition[]> = {
    "cat-long": [],

    mai: [],

    do: [],

    "kiem-1": [
        { key: "training_percent", label: "% học việc", type: "number", unit: "%" },
        { key: "press_date", label: "Ngày tháng Ép", type: "date" },
        { key: "press_box_shift", label: "Ca / thùng Ép", type: "text" },
    ],

    "kiem-2": [
        { key: "training_percent", label: "% học việc", type: "number", unit: "%" },
    ],

    can: [
        { key: "material_code", label: "Mã nguyên liệu", type: "text", required: true },
    ],

    ep: [
        { key: "press_box_shift", label: "Ca / thùng Ép", type: "text" },
        { key: "handler", label: "Người xử lý ép/bavia", type: "text" },
    ],

    bavia: [],

    sx3: [
        { key: "stop_reason", label: "Lý do dừng máy", type: "text" },
    ],
};

/**
 * Các field tuyệt đối không được render trong "Thông tin riêng".
 * Danh sách này giúp tránh việc schema form mở rộng về sau rồi vô tình
 * đưa thời gian, NG hoặc chỉ tiêu quản lý trở lại khu vực này.
 */
const NON_EXTRA_FIELD_KEYS = new Set([
    // Quality / NG
    "tt_ok",
    "tt_ng",
    "defects",
    "selectedDefects",

    // Worker performance values controlled by Lead/Manager
    "actual_output",
    "productivity_percent",

    // Time / deduction values
    "total_time",
    "actual_time",
    "rolling_hours",
    "work_minutes",
    "assembly_minutes",
    "vsk_hours",
    "five_s_overtime_hours",
    "mold_warmup_hours",
    "mold_repair_hours",
    "machine_repair_hours",
    "machine_stop_hours",
    "late_early_hours",
    "stop_operation_hours",
    "stop_operation_minutes",
    "shortage_hours",
    "deduction_work",
    "deductions",
]);

export const processExtraFields: Record<string, ExtraFieldDefinition[]> = Object.fromEntries(
    slugs.map((slug) => {
        const fields = (PROCESS_SPECIFIC_FIELDS[slug] || []).filter(
            (field) => !NON_EXTRA_FIELD_KEYS.has(field.key)
        );
        return [slug, fields];
    })
);

export const getProcessExtraFields = (slug: string): ExtraFieldDefinition[] =>
    processExtraFields[slug] || [];
