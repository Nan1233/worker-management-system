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
 *
 * Đây là nguồn cấu hình DUY NHẤT cho section "Thông tin riêng công đoạn".
 *
 * Không đưa vào đây:
 * - Máy / sản phẩm / ngày / ca / mã công nhân -> section thông tin chung
 * - Thời gian làm việc / thực tích / % năng suất -> section hiệu suất
 * - OK / NG / chi tiết lỗi -> section báo cáo chất lượng
 * - Trừ giờ -> section chi tiết trừ giờ
 *
 * Những field bên dưới đã được đối chiếu và phân loại theo file mẫu KTC.
 */
export const PROCESS_SPECIFIC_FIELDS: Record<string, ExtraFieldDefinition[]> = {
  // File mẫu không có trường "thông tin riêng" độc lập cho Cắt/Lồng.
  "cat-long": [],

  // SLOK, SLNG và KQD/Xô cs/... là báo cáo chất lượng, không phải extra field.
  mai: [],

  // Các chỉ tiêu Đo nằm ở phần thời gian/chất lượng.
  do: [],

  // Kiểm 1 có một số thông tin nghiệp vụ riêng cần giữ.
  "kiem-1": [
    { key: "training_percent", label: "% học việc", type: "number", unit: "%" },
    { key: "press_date", label: "Ngày tháng Ép", type: "date" },
    { key: "press_box_shift", label: "Ca / thùng Ép", type: "text" },
  ],

  // Kiểm 2 chỉ có % học việc là thông tin riêng Worker nhập.
  "kiem-2": [
    { key: "training_percent", label: "% học việc", type: "number", unit: "%" },
  ],

  // Cán: Mã nguyên liệu là thông tin riêng; thời gian/trừ giờ/NG tách riêng.
  can: [
    { key: "material_code", label: "Mã nguyên liệu", type: "text", required: true },
  ],

  // Ép: ca/thùng và người xử lý là thông tin nghiệp vụ riêng.
  ep: [
    { key: "press_box_shift", label: "Ca / thùng Ép", type: "text" },
    { key: "handler", label: "Người xử lý ép/bavia", type: "text" },
  ],

  // XLBV: các trường cũ "thực tích/thời gian/công việc/thiếu SL" đã được tách.
  bavia: [],

  // SX3: lý do dừng là thông tin giải thích, không phải bản thân thời gian trừ.
  sx3: [
    { key: "stop_reason", label: "Lý do dừng máy", type: "text" },
  ],
};

/** Trả về đúng cấu hình extra field của công đoạn, không có fallback thứ hai. */
export const getProcessExtraFields = (slug: string): ExtraFieldDefinition[] =>
  PROCESS_SPECIFIC_FIELDS[slug] || [];

/**
 * Giữ API cũ cho các component đang đọc trực tiếp processExtraFields.
 * Cả hai đều trỏ tới cùng một nguồn cấu hình, không có bản sao dữ liệu.
 */
export const processExtraFields: Record<string, ExtraFieldDefinition[]> = PROCESS_SPECIFIC_FIELDS;
