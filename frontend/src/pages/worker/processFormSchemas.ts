export type FormFieldKind =
  | "date"
  | "shift"
  | "worker"
  | "machine"
  | "machine-list"
  | "product"
  | "text"
  | "number"
  | "integer"
  | "defect-list"
  | "deduction-list"
  | "machine-error-list";


export type ProcessSelection = {
  slug: string;
  processId: number;
  processCode: string;
  name: string;
  icon: string;
  description: string;
};

/** Danh sách công đoạn hiển thị cố định cho mọi công nhân. */
export const PROCESS_SELECTIONS: ProcessSelection[] = [
  { slug: "cat-long", processId: 1, processCode: "GC", name: "Gia công (Cắt / Lồng)", icon: "GC", description: "Dành cho quy trình cắt và lồng" },
  { slug: "mai", processId: 2, processCode: "MAI", name: "Mài", icon: "MAI", description: "Quy trình mài bóng và hoàn thiện bề mặt" },
  { slug: "do", processId: 60001, processCode: "DO", name: "Đo", icon: "DO", description: "Đo kiểm kích thước và ghi nhận kết quả" },
  { slug: "kiem-1", processId: 3, processCode: "K1", name: "Kiểm 1", icon: "K1", description: "Kiểm tra chất lượng công đoạn đầu" },
  { slug: "kiem-2", processId: 4, processCode: "K2", name: "Kiểm 2", icon: "K2", description: "Kiểm tra chất lượng công đoạn cuối" },
  { slug: "can", processId: 60002, processCode: "CAN", name: "Cán", icon: "CAN", description: "Quy trình cán vật liệu" },
  { slug: "ep", processId: 60003, processCode: "EP", name: "Ép", icon: "EP", description: "Quy trình ép khuôn và tạo hình" },
  { slug: "bavia", processId: 60004, processCode: "XLBV", name: "Xử lý bavia", icon: "XLBV", description: "Xử lý bavia và làm sạch sản phẩm" },
  { slug: "sx3", processId: 60005, processCode: "SX3", name: "Sản xuất 3 - Lắp ráp", icon: "SX3", description: "Lắp ráp và theo dõi lỗi máy / NG part" },
];

export type ProcessFormField = {
  key: string;
  label: string;
  kind: FormFieldKind;
  required?: boolean;
  unit?: string;
  placeholder?: string;
};

export type ProcessFormSchema = {
  processId: number;
  processCode: string;
  title: string;
  machineLabel: string;
  fields: ProcessFormField[];
};

const COMMON_FIELDS: ProcessFormField[] = [
  { key: "work_date", label: "Ngày báo cáo", kind: "date", required: true },
  { key: "shift", label: "Ca", kind: "shift", required: true },
  { key: "worker_code", label: "Mã số công nhân", kind: "worker", required: true },
];

/**
 * Cấu hình form được khai báo cứng trong source.
 * Không đọc tiêu đề hoặc tọa độ từ bất kỳ workbook nào khi ứng dụng chạy.
 * Workbook trong backend/templates chỉ phục vụ xuất báo cáo.
 */
export const PROCESS_FORM_SCHEMAS: Record<string, ProcessFormSchema> = {
  "cat-long": {
    processId: 1,
    processCode: "GC",
    title: "Gia công - Cắt/Lồng",
    machineLabel: "Số máy cắt/lồng",
    fields: [
      ...COMMON_FIELDS,
      { key: "machine_lines", label: "Máy gia công", kind: "machine-list", required: true },
      { key: "product_code", label: "Mã sản phẩm", kind: "product", required: true },
      { key: "total_time", label: "Thời gian làm việc", kind: "number", required: true, unit: "giờ" },
      { key: "actual_time", label: "Thời gian làm thực tế", kind: "number", required: true, unit: "giờ" },
      { key: "tt_ok", label: "Số lượng OK", kind: "integer", required: true },
      { key: "defects", label: "Chi tiết NG", kind: "defect-list" },
      { key: "deductions", label: "Chi tiết trừ giờ", kind: "deduction-list" },
    ],
  },
  mai: {
    processId: 2,
    processCode: "MAI",
    title: "Báo cáo Mài",
    machineLabel: "Số máy mài",
    fields: [
      ...COMMON_FIELDS,
      { key: "machine_lines", label: "Danh sách máy mài", kind: "machine-list", required: true },
      { key: "product_code", label: "Mã sản phẩm", kind: "product", required: true },
      { key: "total_time", label: "Thời gian làm việc", kind: "number", required: true, unit: "giờ" },
      { key: "actual_time", label: "Thời gian làm thực tế", kind: "number", required: true, unit: "giờ" },
      { key: "tt_ok", label: "Số lượng OK", kind: "integer", required: true },
      { key: "defects", label: "Chi tiết NG Mài", kind: "defect-list" },
    ],
  },
};