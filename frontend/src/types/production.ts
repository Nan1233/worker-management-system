export interface ProductionReport {
    id?: number;

    worker_id: number;

    process_type: string;

    work_date: string;
    shift: string;

    machine_no: string;

    total_time: number;
    actual_time: number;
    deduction_time: number;

    product_name: string;

    standard_output: number;
    actual_output: number;

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

    note: string;


    // dữ liệu backend trả thêm
    worker_code?: string;

    full_name?: string;

    created_at?: string;

    updated_at?: string;
}