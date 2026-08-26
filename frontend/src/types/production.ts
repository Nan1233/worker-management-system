// =====================================================
// TRẠNG THÁI BÁO CÁO
// =====================================================

export type ProductionReportStatus =
    | "pending"
    | "need_fix"
    | "approved"
    | "rejected";

export type ProductionReportSource =
    | "pending"
    | "approved";

export interface ProductionDefect {
    id?: number;
    defect_type_id?: number;
    defect_code?: string;
    defect_name: string;
    quantity: number;
}

export interface ProductionDeduction {
    id?: number;
    deduction_type_id?: number;
    deduction_code?: string;
    deduction_name: string;
    hours: number;
}

export interface ProductionReport {
    id?: number;
    worker_id?: number;
    process_id: number;
    source_temp_id?: number | null;
    client_request_id?: string;
    force_create?: boolean;
    duplicate_confirmation_token?: string;
    reason?: string;

    work_date: string;
    entry_date?: string;
    extra_data?: Record<string, string | number | boolean | null>;
    shift: string;
    machine_no: string;

    operation_type?: "CUT" | "LONG";
    operation_mode?: "MANUAL" | "MACHINE";
    machine_lines?: Array<{
        id?: number;
        machine_event_id?: number | null;
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
    training_percent?: number;

    product_name: string;

    total_time: number;
    actual_time: number;
    deduction_time: number;
    stop_reason?: string | null;

    standard_output: number;
    actual_output: number;
    target_output?: number;

    tt_ok: number;
    tt_ng: number;

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

    defects?: ProductionDefect[];
    deductions?: ProductionDeduction[];

    note: string;

    status?: ProductionReportStatus;
    review_note?: string | null;
    reviewed_by?: number | null;
    approved_at?: string | null;

    worker_code?: string;
    full_name?: string;
    process_code?: string;
    process_name?: string;

    // Compatibility fields returned/used by the manager Excel-style grid.
    // Backend canonical fields remain full_name, note and performance data.
    worker_name?: string;
    hv_percent?: number;
    notes?: string;

    created_at?: string;
    updated_at?: string;
    source?: ProductionReportSource;
}

export interface ProductionReportResponse {
    success: boolean;
    message?: string;
    data: ProductionReport;
}

export interface ProductionReportListResponse {
    success: boolean;
    message?: string;
    data: ProductionReport[];
}

export interface CreateProductionReportResponse {
    success: boolean;
    message: string;
    id: number;
}
