import { getAccessToken } from "../utils/authStorage";
import api from "./api";
import { getSessionCached, clearSessionCache } from "./sessionCache";




import type {
    ProductionDeduction,
    ProductionDefect,
    ProductionReport
} from "../types/production";
const invalidateManagerReportCaches = () => {
    clearSessionCache("manager-pending");
    clearSessionCache("manager-approved");
};

export interface CompanyNetworkAccess {
    allowed: boolean;
    restricted: boolean;
    enforced: boolean;
    configured: boolean;
    client_ip: string;
    message: string;
}

export const getCompanyNetworkAccess = async (
    forceRefresh = false
): Promise<CompanyNetworkAccess> => {
    const loader = async () => {
        const res = await api.get("/network/access");
        return res.data?.data || res.data;
    };

    if (forceRefresh) return loader();

    return getSessionCached(
        "network-access",
        5 * 60 * 1000,
        loader
    );
};

// =====================================================
// WORKER TẠO BÁO CÁO TEMP
// =====================================================

export const createTempReport = async(

    data:ProductionReport

)=>{


    const res = await api.post(

        "/production-temp",

        data

    );


    return res.data;


};

export interface SimilarReportCheckResponse {
    success: boolean;
    duplicate: boolean;
    data: {
        id: number;
        status: string;
        work_date: string;
        shift: string;
        machine_no: string;
        product_name: string;
    } | null;
    message: string;
}

export const checkSimilarTempReport = async (
    data: Pick<ProductionReport, "process_id" | "work_date" | "shift" | "machine_no" | "product_name">
): Promise<SimilarReportCheckResponse> => {
    const res = await api.post("/production-temp/check-similar", data);
    return res.data;
};







// =====================================================
// MANAGER LẤY NGÀY CÓ BÁO CÁO CHỜ DUYỆT
// =====================================================

export const getTempDates = async()=>{


    const res = await api.get(

        "/production-temp/dates"

    );


    return res.data.data || res.data || [];


};







// =====================================================
// MANAGER XEM TEMP THEO NGÀY
// =====================================================

export const getTempReportsByDate = async(

    date:string

):Promise<ProductionReport[]>=>{


    const res = await api.get(

        `/production-temp/by-date?date=${date}`

    );


    return res.data.data || res.data || [];


};







export const getTempReportById = async (
    id: number
): Promise<ProductionReport> => {

    const res = await api.get(
        `/production-temp/${id}`,
        {
            params: {
                _t: Date.now()
            }
        }
    );

    return res.data.data || res.data;

};



// =====================================================
// WORKER XEM LỊCH SỬ TEMP
// =====================================================

export const getMyTempReports = async()=>{


    const res = await api.get(

        "/production-temp/my"

    );


    return res.data.data || res.data || [];


};







// =====================================================
// MANAGER XEM CHỜ DUYỆT
// =====================================================

export interface ManagerReportPagination {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
}

export interface ManagerReportPage {
    items: ProductionReport[];
    pagination: ManagerReportPagination;
    processes: string[];
    previousCount?: number;
}

export interface PendingReportFilters {
    dateFrom?: string;
    dateTo?: string;
    shift?: string;
    processId?: number | string;
    processName?: string;
    search?: string;
    page?: number;
    pageSize?: number;
}

const normalizeManagerReportPage = (payload: any, fallbackPage = 1, fallbackPageSize = 20): ManagerReportPage => {
    const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
    const rawPagination = payload?.pagination || {};
    const total = Number(rawPagination.total ?? items.length);
    const pageSize = Number(rawPagination.page_size ?? fallbackPageSize) || fallbackPageSize;
    const page = Number(rawPagination.page ?? fallbackPage) || fallbackPage;
    return {
        items,
        pagination: {
            page,
            page_size: pageSize,
            total: Number.isFinite(total) && total >= 0 ? total : items.length,
            total_pages: Math.max(1, Number(rawPagination.total_pages) || Math.ceil(Math.max(0, total) / pageSize) || 1)
        },
        processes: Array.isArray(payload?.processes)
            ? payload.processes.map((item: any) => String(item?.process_name || item || '').trim()).filter(Boolean)
            : [],
        previousCount: Number(payload?.previous_count || 0)
    };
};

export const getPendingReports = async (
    filters: PendingReportFilters = {}
): Promise<ManagerReportPage> => {
    const key = [
        "manager-pending", filters.dateFrom || "", filters.dateTo || "",
        filters.shift || "", filters.processId || "", filters.processName || "",
        filters.search?.trim() || "", filters.page || 1, filters.pageSize || 20
    ].join(":");

    return getSessionCached(key, 15_000, async () => {
        const res = await api.get("/production-temp/pending", {
            params: {
                date_from: filters.dateFrom || undefined,
                date_to: filters.dateTo || undefined,
                shift: filters.shift || undefined,
                process_id: filters.processId || undefined,
                process_name: filters.processName || undefined,
                search: filters.search?.trim() || undefined,
                page: filters.page || 1,
                page_size: filters.pageSize || 20
            }
        });
        return normalizeManagerReportPage(res.data, filters.page || 1, filters.pageSize || 20);
    });
};

export type ApprovedReportFilters = PendingReportFilters;

export const getApprovedReports = async (
    filters: ApprovedReportFilters = {}
): Promise<ManagerReportPage> => {
    const key = [
        "manager-approved", filters.dateFrom || "", filters.dateTo || "",
        filters.shift || "", filters.processId || "", filters.processName || "",
        filters.search?.trim() || "", filters.page || 1, filters.pageSize || 20
    ].join(":");

    return getSessionCached(key, 15_000, async () => {
        const res = await api.get("/production-temp/approved", {
            params: {
                date_from: filters.dateFrom || undefined,
                date_to: filters.dateTo || undefined,
                shift: filters.shift || undefined,
                process_id: filters.processId || undefined,
                process_name: filters.processName || undefined,
                search: filters.search?.trim() || undefined,
                page: filters.page || 1,
                page_size: filters.pageSize || 20
            }
        });
        return normalizeManagerReportPage(res.data, filters.page || 1, filters.pageSize || 20);
    });
};

// Compatibility helpers intentionally remain bounded. Full-data exports use the
// dedicated export endpoints and are never routed through manager list pagination.
export const getReports = async(): Promise<ProductionReport[]> =>
    (await getApprovedReports({ page: 1, pageSize: 100 })).items;


// =====================================================
// CHI TIẾT BÁO CÁO
// =====================================================
export const getReportById = async(
    id:number,
    source?:string | null
)=>{


    const normalizedSource = String(source || "").toLowerCase();
    const isTempReport = normalizedSource === "pending" || normalizedSource === "temp";

    const url = isTempReport
        ? `/production-temp/${id}`
        : `/production/${id}`;



    const res =
    await api.get(url);



    return res.data.data || res.data;


};







// =====================================================
// UPDATE
// =====================================================

export const updateReport = async (
    id: number,
    data: ProductionReport,
    source: "pending" | "approved" = "approved",
    expectedUpdatedAt?: string | null
) => {
    const endpoint = source === "pending"
        ? `/production-temp/${id}`
        : `/production/${id}`;
    const payload = source === "approved"
        ? { ...data, expected_updated_at: expectedUpdatedAt || undefined }
        : data;

    const res = await api.put(endpoint, payload);
    return res.data;
};







// =====================================================
// DELETE
// =====================================================

export const deleteReport = async(

    id:number,
    reason:string

)=>{


    const res = await api.delete(

        `/production/${id}`,
        { data: { reason: String(reason || "").trim() } }

    );


    return res.data;


};







// =====================================================
// EXPORT EXCEL TEMP / GIA CÔNG
// =====================================================

export const exportProductionExcel = async(

    date:string

)=>{


    const res = await api.get(

        `/reports/export-excel?date=${date}&type=pending`,

        {

            responseType:"blob"

        }

    );



    downloadExcel(

        res.data,

        `BaoCaoChoDuyet_${date}.xlsx`

    );


};







// =====================================================
// LẤY NGÀY ĐÃ DUYỆT
// =====================================================

export const getApprovedDates = async()=>{


    const res = await api.get(

        "/production/dates"

    );


    return res.data.data || res.data || [];


};







// =====================================================
// BÁO CÁO ĐÃ DUYỆT THEO NGÀY
// =====================================================

export const getApprovedReportsByDate = async(

    date:string

):Promise<ProductionReport[]>=>{


    return (await getApprovedReports({ dateFrom: date, dateTo: date, page: 1, pageSize: 100 })).items;


};







// =====================================================
// EXPORT ĐÃ DUYỆT
// =====================================================

export const exportApprovedExcel = async(

    date:string

)=>{


    const res = await api.get(

        `/reports/export-excel?date=${date}&type=approved`,

        {

            responseType:"blob"

        }

    );



    downloadExcel(

        res.data,

        `BaoCaoDaDuyet_${date}.xlsx`

    );


};







// =====================================================
// DOWNLOAD FILE EXCEL
// =====================================================

const downloadExcel = (

    data:BlobPart,

    filename:string

)=>{


    const blob = new Blob(

        [

            data

        ],

        {

            type:

            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

        }

    );



    const url =

        window.URL.createObjectURL(blob);



    const link =

        document.createElement("a");



    link.href=url;


    link.download=filename;



    document.body.appendChild(link);



    link.click();



    link.remove();



    window.URL.revokeObjectURL(url);


};
// =====================================================
// GOOGLE SHEET
// =====================================================


// TẠO GOOGLE SHEET MỚI

// export const createGoogleSheet = async(
//     date:string
// )=>{


//     const res = await api.post(

//         "/reports/create-sheet",

//         {
//             date
//         }

//     );


//     return res.data;


// };




// CẬP NHẬT GOOGLE SHEET CŨ

// export const updateGoogleSheet = async(
//     date:string
// )=>{


//     const res = await api.post(

//         "/reports/update-sheet",

//         {
//             date
//         }

//     );


//     return res.data;


// };
// =====================================================
// LEAD / MANAGER DUYỆT CÁC BÁO CÁO ĐÃ CHỌN
// =====================================================

export type TempReviewTarget = { id: number; expected_updated_at?: string | null };

const normalizeTempReviewTargets = (items: Array<number | TempReviewTarget>) =>
    items.map((item) => typeof item === "number"
        ? { id: item, expected_updated_at: null }
        : { id: Number(item.id), expected_updated_at: item.expected_updated_at || null });

export const approveSelectedTempReports = async (
    items: Array<number | TempReviewTarget>
) => {
    const targets = normalizeTempReviewTargets(items);
    const res = await api.post(
        "/production-temp/approve-selected",
        { ids: targets.map((item) => item.id), targets }
    );
    invalidateManagerReportCaches();
    return res.data;

};

export const rejectSelectedTempReports = async (items: Array<number | TempReviewTarget>, reason: string) => {
    const targets = normalizeTempReviewTargets(items);
    const res = await api.post(
        "/production-temp/reject-selected",
        { ids: targets.map((item) => item.id), targets, reason }
    );
    invalidateManagerReportCaches();
    return res.data;
};

export interface ReportActionLog {
    id: number;
    report_type: "temp" | "approved";
    report_id: number;
    action: string;
    note?: string | null;
    full_name?: string | null;
    username?: string | null;
    role?: string | null;
    created_at: string;
}

export const getTempReportActionLogs = async (id: number): Promise<ReportActionLog[]> => {
    const res = await api.get(`/production-temp/${id}/logs`);
    return res.data?.data || [];
};


// // =====================================================
// // LEAD / MANAGER TỪ CHỐI CÁC BÁO CÁO ĐÃ CHỌN
// // =====================================================

// export const rejectSelectedTempReports = async (

//     ids: number[],

//     reason: string

// ) => {


//     const res = await api.post(

//         "/production-temp/reject-selected",

//         {
//             ids,
//             reason
//         }

//     );


//     return res.data;

// };

// =====================================================
// LẤY CHI TIẾT MỘT BÁO CÁO TEMP
// =====================================================

// =====================================================
// LẤY CHI TIẾT MỘT BÁO CÁO TEMP
// =====================================================

// =====================================================
// LẤY CHI TIẾT MỘT BÁO CÁO TEMP
// =====================================================

export const getTempReportDetail = async (
    id: number
): Promise<ProductionReport> => {

    return getTempReportById(id);

};
// =====================================================
// UPDATE BÁO CÁO TEMP
// =====================================================

export const updateTempReport = async (
    id: number,
    data: ProductionReport
) => {
    const res = await api.put(
        `/production-temp/${id}`,
        { ...data, expected_updated_at: data.updated_at || undefined }
    );

    return res.data;
};
// =====================================================
// XUẤT EXCEL CÁC BÁO CÁO ĐÃ DUYỆT ĐƯỢC CHỌN
// =====================================================

export interface ExcelExportResult {
    success: boolean;
    skipped?: boolean;
    code?: string;
    reason?: string;
    message?: string;
    files?: Array<{
        processName?: string;
        processCode?: string;
        success?: boolean;
        error?: string;
        saved?: boolean;
        pendingPath?: string | null;
    }>;
    [key: string]: unknown;
}

export const exportSelectedApprovedExcel = async (
    date: string
): Promise<ExcelExportResult> => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error("Ngày xuất Excel không hợp lệ");
    }

    const isElectronRuntime =
        Boolean(window.ktcDesktop?.isDesktop) ||
        navigator.userAgent.toLowerCase().includes("electron");

    // Khi chạy trong Electron, bắt buộc dùng IPC. Không được âm thầm rơi xuống
    // API Axios của web vì sẽ tạo thêm POST /reports/export-excel và có thể 401.
    if (isElectronRuntime) {
        if (
            !window.ktcDesktop?.isDesktop ||
            typeof window.ktcDesktop.syncAllExcel !== "function"
        ) {
            throw new Error(
                "Ứng dụng Desktop chưa tải được mô-đun cập nhật Excel. " +
                "Hãy đóng ứng dụng và cài lại bản Desktop mới nhất."
            );
        }

        const token = getAccessToken() || "";
        if (!token) {
            throw new Error(
                "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
            );
        }

        const result = await window.ktcDesktop.syncAllExcel(token, date) as ExcelExportResult;

        if (result?.skipped) {
            throw new Error(
                result.message ||
                "Đang có một lần cập nhật Excel khác chạy. Yêu cầu đã được xếp hàng."
            );
        }

        if (!result?.success) {
            const failedFiles = Array.isArray(result?.files)
                ? result.files
                    .filter(file => file?.success === false)
                    .map(file => {
                        const name =
                            file.processName ||
                            file.processCode ||
                            "File Excel";
                        return `${name}: ${file.error || "Không xác định được lỗi"}`;
                    })
                : [];

            throw new Error(
                failedFiles.length > 0
                    ? failedFiles.join("; ")
                    : result?.message ||
                      "Không thể cập nhật file Excel tháng."
            );
        }

        return result;
    }

    const startedAt = Date.now();
    const response = await api.post(
        "/reports/export-excel",
        { date },
        {
            responseType: "blob",
            timeout: 180_000
        }
    );

    console.info(
        "[EXPORT EXCEL] completed",
        { elapsedMs: Date.now() - startedAt, date }
    );

    const contentDisposition =
        response.headers["content-disposition"] as string | undefined;

    const [year, month] = date.split("-");
    let fileName = `Bao-cao-san-xuat-${month}-${year}.xlsx`;

    if (contentDisposition) {
        const utf8Match = contentDisposition.match(
            /filename\*=UTF-8''([^;]+)/i
        );
        const normalMatch = contentDisposition.match(
            /filename="?([^";]+)"?/i
        );
        const encodedName = utf8Match?.[1] || normalMatch?.[1];

        if (encodedName) {
            try {
                fileName = decodeURIComponent(encodedName);
            } catch {
                fileName = encodedName;
            }
        }
    }

    const blob = response.data instanceof Blob
        ? response.data
        : new Blob(
            [response.data],
            {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            }
        );

    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    try {
        link.href = downloadUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
    } finally {
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);
    }

    return {
        success: true,
        message: "Đã tải file Excel theo tháng."
    };
};

export const getDeductionOptionsByProcess = async (
    processId: number
): Promise<ProductionDeduction[]> => {

    const res = await api.get(
        `/processes/${processId}/deductions`
    );

    return res.data.data || res.data || [];

};


export const getDefectOptionsByProcess = async (
    processId: number
): Promise<ProductionDefect[]> => {

    const res = await api.get(
        `/processes/${processId}/defects`
    );

    return res.data.data || res.data || [];

};
// =====================================================
// TRẠNG THÁI FILE EXCEL THÁNG - DÙNG CHUNG WEB/MOBILE/DESKTOP
// =====================================================
export type MonthlyExcelStatus = {
    selectedDate: string;
    yearMonth: string;
    ready: boolean;
    fileName: string;
    size: number;
    reportCount: number;
    generatedAt: string | null;
    latestUpdatedAt: string | null;
};

export const getMonthlyExcelStatus = async (
    date: string
): Promise<MonthlyExcelStatus> => {
    const response = await api.get(
        "/reports/export-excel/status",
        { params: { date } }
    );

    return response.data.data;
};

// =====================================================
// F05 SHARED-MACHINE PHYSICAL EVENT API
// =====================================================
export interface MachineProductionEventDefectInput {
    defect_type_id?: number;
    defect_code?: string;
    quantity: number;
    responsible_worker_id: number;
}

export interface MachineProductionEvent {
    id: number;
    process_id: number;
    process_code?: string;
    machine_id: number;
    machine_code: string;
    product_code: string;
    work_date: string;
    shift: string;
    physical_ok_quantity: number;
    physical_ng_quantity: number;
    physical_counted_output: number;
    physical_total_output: number;
    machine_time_hours: number;
    maximum_output: number;
    standard_output: number;
    exclude_kqd_from_tt_snapshot: number;
    status: "pending" | "approved";
    defects?: Array<MachineProductionEventDefectInput & { id?: number; defect_name?: string }>;
    participants?: Array<{
        source: "temp" | "approved";
        machine_line_id: number;
        report_id: number;
        worker_id: number;
        credited_output: number;
        participation_time_hours: number;
    }>;
}

export const listMachineProductionEvents = async (filters: Record<string, string | number | undefined> = {}) => {
    const res = await api.get('/machine-production-events', { params: filters });
    return (res.data.data || []) as MachineProductionEvent[];
};

export const getMachineProductionEvent = async (id: number) => {
    const res = await api.get(`/machine-production-events/${id}`);
    return res.data.data as MachineProductionEvent;
};

export const createMachineProductionEvent = async (payload: {
    process_id: number;
    machine_id?: number;
    machine_code?: string;
    product_code: string;
    work_date: string;
    shift: string;
    physical_ok_quantity: number;
    machine_time_hours: number;
    defects?: MachineProductionEventDefectInput[];
    temp_machine_line_ids?: number[];
}) => {
    const res = await api.post('/machine-production-events', payload);
    return res.data.data as MachineProductionEvent;
};

export const updateMachineProductionEvent = async (id: number, patch: Record<string, unknown>) => {
    const res = await api.put(`/machine-production-events/${id}`, patch);
    return res.data.data as MachineProductionEvent;
};

export const linkMachineEventParticipants = async (id: number, tempMachineLineIds: number[]) => {
    const res = await api.post(`/machine-production-events/${id}/link-participants`, { temp_machine_line_ids: tempMachineLineIds });
    return res.data.data as MachineProductionEvent;
};

export const approveMachineProductionEvent = async (id: number) => {
    const res = await api.post(`/machine-production-events/${id}/approve`);
    return res.data.data as MachineProductionEvent;
};
