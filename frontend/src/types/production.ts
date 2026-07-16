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
//
// Frontend gửi defect_name.
// Backend tìm defect_type_id trong defect_types.
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
//
// Frontend gửi deduction_name.
// Backend tìm deduction_type_id trong deduction_types.
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


    // ==========================
    // THÔNG TIN CHUNG
    // ==========================

    work_date: string;

    shift: string;

    machine_no: string;

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
    // DUYỆT
    // ==========================

    status?: ProductionReportStatus;

    review_note?: string | null;

    reviewed_by?: number | null;

    approved_at?: string | null;


    // ==========================
    // DỮ LIỆU JOIN TỪ BACKEND
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
    // PHÂN BIỆT BẢNG TEMP / MAIN
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