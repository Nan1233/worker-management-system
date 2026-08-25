export type ExtraFieldDefinition = {
  key: string;
  label: string;
  type: "text" | "number" | "date";
  required?: boolean;
  placeholder?: string;
  unit?: string;
};

const slugs = ["cat-long", "mai", "do", "kiem-1", "kiem-2", "can", "ep", "bavia", "sx3"] as const;

/**
 * NGUYÊN TẮC:
 * Đây là nguồn cấu hình duy nhất cho "Thông tin riêng công đoạn".
 * % học việc đã nằm ở phần thông tin công nhân nên KHÔNG hiển thị lại ở đây.
 */
export const PROCESS_SPECIFIC_FIELDS: Record<string, ExtraFieldDefinition[]> = {
  "cat-long": [],
  mai: [],
  do: [],

  "kiem-1": [
    { key: "press_date", label: "Ngày tháng Ép", type: "date" },
    { key: "press_box_shift", label: "Ca / thùng Ép", type: "text" },
  ],

  "kiem-2": [],

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

export const getProcessExtraFields = (slug: string): ExtraFieldDefinition[] =>
  PROCESS_SPECIFIC_FIELDS[slug] || [];

export const processExtraFields: Record<string, ExtraFieldDefinition[]> = PROCESS_SPECIFIC_FIELDS;
