// =====================================================
// TRẠNG THÁI BÁO CÁO
// =====================================================

export type ProductionReportStatus =
    | "pending"
    | "need_fix"
    | "approved"
    | "rejected";


// =====================================================
// NGUỒN BÁO CÁO
// =====================================================

export type ProductionReportSource =
    | "pending"
    | "approved";


// =====================================================
// CHI TIẾT LỖI NG
// =====================================================

export interface ProductionDefect {

    id?: number;

    defect_type_id?: number;

    defect_code?: string;

    defect_name: string;

    quantity: number;

}


// =====================================================
// CHI TIẾT TRỪ GIỜ
// =====================================================

export interface ProductionDeduction {

    id?: number;

    deduction_type_id?: number;

    deduction_code?: string;

    deduction_name: string;

    hours: number;

}


// =====================================================
// BÁO CÁO SẢN XUẤT
// =====================================================

export interface ProductionReport {

    // ==========================
    // ID
    // ==========================

    id?: number;

    worker_id?: number;

    process_id: number;

    source_temp_id?: number | null;

    client_request_id?: string;

    force_create?: boolean;


    // ==========================
    // THÔNG TIN CHUNG
    // ==========================

    work_date: string;

    entry_date?: string;

    extra_data?: Record<string, string | number | boolean | null>;

    shift: string;

    machine_no: string;

    operation_type?: "CUT" | "LONG";
    operation_mode?: "MANUAL" | "MACHINE";
    machine_lines?: Array<{
        id?: number;
        machine_id?: number;
        machine_code: string;
        product_code: string;
        machine_time_hours: number;
        ok_quantity: number;
        ng_quantity: number;
        standard_time_seconds?: number | null;
        standard_output?: number;
        standard_source?: "MACHINE" | "DEFAULT";
        exclude_kqd_from_tt?: number;
        maximum_output?: number;
        counted_output?: number;
        earned_standard_hours?: number;
        machine_efficiency_percent?: number;
        physical_output?: number;
        defects?: ProductionDefect[];
    }>;
    machinePerformance?: {
        machine_count: number;
        total_machine_hours: number;
        total_ok: number;
        total_ng: number;
        physical_output: number;
        counted_output: number;
        maximum_output: number;
        efficiency_percent: number;
        ok_rate_percent: number;
        ng_rate_percent: number;
    };
    workerPerformance?: {
        actual_worker_hours: number;
        earned_standard_hours: number;
        efficiency_percent: number;
    };

    exclude_kqd_from_tt?: number;


    /*
        % học việc tại thời điểm
        công nhân tạo báo cáo.

        Frontend worker không gửi trường này.
        Backend tự lấy từ bảng workers.
    */

    training_percent?: number;

    product_name: string;


    // ==========================
    // THỜI GIAN
    // ==========================

    total_time: number;

    actual_time: number;

    deduction_time: number;

    stop_reason?: string | null;


    // ==========================
    // SẢN LƯỢNG
    // ==========================

    standard_output: number;

    actual_output: number;


    /*
        Định mức áp dụng sau khi nhân
        với % học việc.

        Có thể backend trả về hoặc
        frontend tự tính khi hiển thị.
    */

    target_output?: number;


    // ==========================
    // CHẤT LƯỢNG
    // ==========================

    tt_ok: number;

    tt_ng: number;


    // ==========================
    // CÁC LỖI CẮT / LỒNG
    // ==========================

    kqd_dap_lai: number;

    kqd_tuot: number;

    vo_do_long: number;

    xuoc_do_long: number;

    cong_gay: number;

    xoay: number;

    khong_dut: number;

    bavia_hut: number;

    ppcm: number;

    loi_cao_su: number;

    ng_kich_thuoc: number;

    cat_lem: number;


    // ==========================
    // DANH SÁCH CHI TIẾT
    // ==========================

    defects?: ProductionDefect[];

    deductions?: ProductionDeduction[];


    // ==========================
    // GHI CHÚ
    // ==========================

    note: string;


    // ==========================
    // DUYỆT BÁO CÁO
    //
    // status ở đây là trạng thái
    // báo cáo, không phải trạng thái
    // nhân viên.
    // ==========================

    status?: ProductionReportStatus;

    review_note?: string | null;

    reviewed_by?: number | null;

    approved_at?: string | null;


    // ==========================
    // DỮ LIỆU JOIN
    // ==========================

    worker_code?: string;

    full_name?: string;

    process_code?: string;

    process_name?: string;


    // ==========================
    // THỜI GIAN HỆ THỐNG
    // ==========================

    created_at?: string;

    updated_at?: string;


    // ==========================
    // PHÂN BIỆT TEMP / MAIN
    // ==========================

    source?: ProductionReportSource;

}


// =====================================================
// RESPONSE API MỘT BÁO CÁO
// =====================================================

export interface ProductionReportResponse {

    success: boolean;

    message?: string;

    data: ProductionReport;

}


// =====================================================
// RESPONSE API DANH SÁCH BÁO CÁO
// =====================================================

export interface ProductionReportListResponse {

    success: boolean;

    message?: string;

    data: ProductionReport[];

}


// =====================================================
// RESPONSE API TẠO BÁO CÁO
// =====================================================

export interface CreateProductionReportResponse {

    success: boolean;

    message: string;

    id: number;

}