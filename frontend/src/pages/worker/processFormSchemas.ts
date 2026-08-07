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
  { slug: "cat-long", processId: 1, processCode: "GC", name: "Gia công (Cắt / Lồng)", icon: "🛠", description: "Dành cho quy trình cắt và lồng" },
  { slug: "mai", processId: 2, processCode: "MAI", name: "Mài", icon: "◉", description: "Quy trình mài bóng và hoàn thiện bề mặt" },
  { slug: "do", processId: 60001, processCode: "DO", name: "Đo", icon: "⌖", description: "Đo kiểm kích thước và ghi nhận kết quả" },
  { slug: "kiem-1", processId: 3, processCode: "K1", name: "Kiểm 1", icon: "☑", description: "Kiểm tra chất lượng công đoạn đầu" },
  { slug: "kiem-2", processId: 4, processCode: "K2", name: "Kiểm 2", icon: "☷", description: "Kiểm tra chất lượng công đoạn cuối" },
  { slug: "can", processId: 60002, processCode: "CAN", name: "Cán", icon: "▤", description: "Quy trình cán vật liệu" },
  { slug: "ep", processId: 60003, processCode: "EP", name: "Ép", icon: "▱", description: "Quy trình ép khuôn và tạo hình" },
  { slug: "bavia", processId: 60004, processCode: "XLBV", name: "Xử lý bavia", icon: "✎", description: "Xử lý bavia và làm sạch sản phẩm" },
  { slug: "sx3", processId: 60005, processCode: "SX3", name: "Sản xuất 3 - Lắp ráp", icon: "⚙", description: "Lắp ráp và theo dõi lỗi máy / NG part" },
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
    title: "Báo cáo Gia công - Cắt/Lồng",
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
      { key: "deductions", label: "Chi tiết trừ giờ", kind: "deduction-list" },
    ],
  },
  do: {
    processId: 60001,
    processCode: "DO",
    title: "Báo cáo Đo",
    machineLabel: "Số máy đo",
    fields: [
      ...COMMON_FIELDS,
      { key: "machine_lines", label: "Danh sách máy đo", kind: "machine-list", required: true },
      { key: "product_code", label: "Mã sản phẩm", kind: "product", required: true },
      { key: "total_time", label: "Thời gian đo", kind: "number", required: true, unit: "giờ" },
      { key: "actual_time", label: "Thời gian đo thực tế", kind: "number", required: true, unit: "giờ" },
      { key: "tt_ok", label: "Số lượng OK", kind: "integer", required: true },
      { key: "defects", label: "Chi tiết lỗi Đo", kind: "defect-list" },
      { key: "deductions", label: "Chi tiết trừ giờ", kind: "deduction-list" },
    ],
  },
  "kiem-1": {
    processId: 3,
    processCode: "K1",
    title: "Báo cáo Kiểm 1",
    machineLabel: "Số máy/vị trí kiểm",
    fields: [
      ...COMMON_FIELDS,
      { key: "training_percent", label: "% học việc", kind: "number", unit: "%" },
      { key: "machine_no", label: "Máy kiểm (nếu làm bằng máy)", kind: "machine" },
      { key: "press_date", label: "Ngày tháng Ép", kind: "date" },
      { key: "press_box_shift", label: "Ca / thùng Ép", kind: "text" },
      { key: "deduction_work", label: "Công việc trừ giờ", kind: "text" },
      { key: "late_early_hours", label: "Đi muộn, về sớm", kind: "number", unit: "giờ" },
      { key: "xlbv_deduction_worker", label: "Trừ giờ XLBV (người làm)", kind: "text" },
      { key: "product_code", label: "Mã sản phẩm", kind: "product", required: true },
      { key: "actual_time", label: "Thời gian làm thực tế", kind: "number", required: true, unit: "giờ" },
      { key: "tt_ok", label: "Số lượng OK", kind: "integer", required: true },
      { key: "defects", label: "Chi tiết lỗi Kiểm 1", kind: "defect-list" },
      { key: "deductions", label: "Chi tiết trừ giờ", kind: "deduction-list" },
    ],
  },
  "kiem-2": {
    processId: 4,
    processCode: "K2",
    title: "Báo cáo Kiểm 2",
    machineLabel: "Số máy/vị trí kiểm",
    fields: [
      ...COMMON_FIELDS,
      { key: "training_percent", label: "% học việc", kind: "number", unit: "%" },
      { key: "machine_no", label: "Máy kiểm (nếu làm bằng máy)", kind: "machine" },
      { key: "product_code", label: "Mã sản phẩm", kind: "product", required: true },
      { key: "actual_time", label: "Thời gian làm thực tế", kind: "number", required: true, unit: "giờ" },
      { key: "tt_ok", label: "Số lượng OK", kind: "integer", required: true },
      { key: "defects", label: "Chi tiết lỗi Kiểm 2", kind: "defect-list" },
      { key: "deductions", label: "Chi tiết trừ giờ", kind: "deduction-list" },
    ],
  },
  can: {
    processId: 60002,
    processCode: "CAN",
    title: "Báo cáo Cán",
    machineLabel: "Số máy cán",
    fields: [
      ...COMMON_FIELDS,
      { key: "machine_no", label: "Số máy cán", kind: "machine", required: true },
      { key: "material_code", label: "Mã nguyên liệu", kind: "text", required: true },
      { key: "product_code", label: "Mã sản phẩm", kind: "product", required: true },
      { key: "rolling_hours", label: "Thời gian cán", kind: "number", required: true, unit: "giờ" },
      { key: "actual_output", label: "Kết quả cán", kind: "number", required: true },
      { key: "vsk_hours", label: "Số giờ VSK", kind: "number", unit: "giờ" },
      { key: "five_s_overtime_hours", label: "Số giờ 5S + gia ca", kind: "number", unit: "giờ" },
      { key: "mold_warmup_hours", label: "Số giờ hâm khuôn", kind: "number", unit: "giờ" },
      { key: "mold_repair_hours", label: "Số giờ sửa khuôn", kind: "number", unit: "giờ" },
      { key: "machine_repair_hours", label: "Số giờ sửa máy", kind: "number", unit: "giờ" },
      { key: "machine_stop_hours", label: "Số giờ dừng máy", kind: "number", unit: "giờ" },
      { key: "stop_reason", label: "Lý do dừng máy", kind: "text" },
      { key: "deductions", label: "Chi tiết trừ giờ Cán", kind: "deduction-list" },
      { key: "defects", label: "Chi tiết NG Cán", kind: "defect-list" },
    ],
  },
  ep: {
    processId: 60003,
    processCode: "EP",
    title: "Báo cáo Ép",
    machineLabel: "Số máy ép",
    fields: [
      ...COMMON_FIELDS,
      { key: "machine_lines", label: "Danh sách máy ép", kind: "machine-list", required: true },
      { key: "product_code", label: "Mã sản phẩm", kind: "product", required: true },
      { key: "press_box_shift", label: "Ca/thùng ép", kind: "text" },
      { key: "actual_time", label: "Thời gian ép thực tế", kind: "number", required: true, unit: "giờ" },
      { key: "actual_output", label: "Kết quả sản xuất", kind: "integer", required: true },
      { key: "handler", label: "Người xử lý ép/bavia", kind: "text" },
      { key: "defects", label: "Chi tiết lỗi Ép", kind: "defect-list" },
      { key: "deductions", label: "Chi tiết trừ giờ", kind: "deduction-list" },
    ],
  },
  bavia: {
    processId: 60004,
    processCode: "XLBV",
    title: "Báo cáo Xử lý bavia",
    machineLabel: "Máy/vị trí xử lý bavia",
    fields: [
      ...COMMON_FIELDS,
      { key: "product_code", label: "Mã sản phẩm", kind: "product", required: true },
      { key: "total_time", label: "Thời gian làm việc", kind: "number", required: true, unit: "giờ" },
      { key: "actual_output", label: "Thực tích", kind: "integer", required: true },
      { key: "stop_operation_hours", label: "Thời gian dừng thao tác", kind: "number", unit: "giờ" },
      { key: "deduction_work", label: "Công việc", kind: "text" },
      { key: "shortage_hours", label: "Thiếu SL", kind: "number", unit: "giờ" },
      { key: "deductions", label: "Chi tiết trừ giờ", kind: "deduction-list" },
      { key: "defects", label: "Chi tiết lỗi xử lý bavia", kind: "defect-list" },
    ],
  },
  sx3: {
    processId: 60005,
    processCode: "SX3",
    title: "Báo cáo Sản xuất 3 - Lắp ráp",
    machineLabel: "Dây chuyền/vị trí",
    fields: [
      ...COMMON_FIELDS,
      { key: "product_code", label: "Mã số sản phẩm", kind: "product", required: true },
      { key: "work_minutes", label: "Thời gian làm việc", kind: "number", required: true, unit: "phút" },
      { key: "assembly_minutes", label: "Thời gian lắp ráp thực tế", kind: "number", required: true, unit: "phút" },
      { key: "tray_minutes", label: "Số thau/thời gian liên quan", kind: "number", unit: "phút" },
      { key: "plan_quantity", label: "Kế hoạch", kind: "integer", required: true },
      { key: "actual_output", label: "Thực tích", kind: "integer", required: true },
      { key: "tt_ok", label: "Sản phẩm OK", kind: "integer", required: true },
      { key: "machine_errors", label: "Lỗi máy", kind: "machine-error-list" },
      { key: "defects", label: "NG Part", kind: "defect-list" },
    ],
  },
};

export const getProcessFormSchema = (slug: string): ProcessFormSchema =>
  PROCESS_FORM_SCHEMAS[slug] || PROCESS_FORM_SCHEMAS["cat-long"];

export const getExtraFields = (slug: string): ProcessFormField[] =>
  getProcessFormSchema(slug).fields.filter((field) => [
    "material_code",
    "rolling_hours",
    "vsk_hours",
    "five_s_overtime_hours",
    "mold_warmup_hours",
    "mold_repair_hours",
    "machine_repair_hours",
    "machine_stop_hours",
    "stop_reason",
    "press_date",
    "deduction_work",
    "late_early_hours",
    "xlbv_deduction_worker",
    "shortage_hours",
    "press_box_shift",
    "handler",
    "stop_operation_hours",
    "work_minutes",
    "assembly_minutes",
    "tray_minutes",
    "plan_quantity",
  ].includes(field.key));
