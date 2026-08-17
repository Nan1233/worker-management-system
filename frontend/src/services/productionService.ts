import { getAccessToken } from "../utils/authStorage";
import api from "./api";
import { clearSessionCache, getSessionCached } from "./sessionCache";

import type {
    ProductionDeduction,
    ProductionDefect,
    ProductionReport
} from "../types/production";
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

export const createTempReport = async (
    data: ProductionReport
) => {
    // Không để màn hình Worker treo vô thời hạn nếu Render/TiDB không phản hồi.
    // 30s đủ rộng cho cold start nhưng vẫn đảm bảo finally ở ProcessPage được chạy.
    const res = await api.post(
        "/production-temp",
        data,
        { timeout: 30_000 }
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
    const res = await api.get("/production-temp/dates");
    return res.data.data || res.data || [];
};







// =====================================================
// MANAGER XEM TEMP THEO NGÀY
// =====================================================

export const getTempReportsByDate = async(
    date:string
):Promise<ProductionReport[]>=>{
    const res = await api.get(`/production-temp/by-date?date=${date}`);
    return res.data.data || res.data || [];
};







export const getTempReportById = async (
    id: number
): Promise<ProductionReport> => {
    const res = await api.get(`/production-temp/${id}`, {
        params: { _t: Date.now() }
    });
    return res.data.data || res.data;
};



// =====================================================
// WORKER XEM LỊCH SỬ TEMP
// =====================================================

export const getMyTempReports = async()=>{
    const res = await api.get("/production-temp/my");
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
    data: ProductionReport[];
    pagination: ManagerReportPagination;
    processes?: string[];
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

const normalizeManagerReportPage = (payload: any): ManagerReportPage => ({
    data: Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [],
    pagination: {
        page: Number(payload?.pagination?.page || 1),
        page_size: Number(payload?.pagination?.page_size || 20),
        total: Number(payload?.pagination?.total || (Array.isArray(payload?.data) ? payload.data.length : 0)),
        total_pages: Math.max(1, Number(payload?.pagination?.total_pages || 1)),
    },
    processes: Array.isArray(payload?.processes) ? payload.processes : undefined,
});

export const getPendingReports = async (filters: PendingReportFilters = {}): Promise<ManagerReportPage> => {
    const includeMeta = true;
    const key = [
        "manager-pending", filters.dateFrom || "", filters.dateTo || "", filters.shift || "",
        filters.processId || "", filters.processName || "", filters.search?.trim() || "",
        filters.page || 1, filters.pageSize || 20
    ].join(":");
    return getSessionCached(key, 15_000, async () => {
        const res = await api.get("/production-temp/pending", {
            params: {
                date_from: filters.dateFrom || undefined,
                date_to: filters.dateTo || undefined,
                shift: filters.shift,
                process_id: filters.processId || undefined,
                process_name: filters.processName,
                search: filters.search?.trim(),
                page: filters.page || 1,
                page_size: filters.pageSize || 20,
                include_meta: includeMeta ? 1 : 0,
            },
        });
        return normalizeManagerReportPage(res.data);
    });
};

export interface ApprovedReportFilters extends PendingReportFilters {}

export const getApprovedReports = async (filters: ApprovedReportFilters = {}): Promise<ManagerReportPage> => {
    const includeMeta = true;
    const key = [
        "manager-approved", filters.dateFrom || "", filters.dateTo || "", filters.shift || "",
        filters.processId || "", filters.processName || "", filters.search?.trim() || "",
        filters.page || 1, filters.pageSize || 20
    ].join(":");
    return getSessionCached(key, 15_000, async () => {
        const res = await api.get("/production-temp/approved", {
            params: {
                date_from: filters.dateFrom || undefined,
                date_to: filters.dateTo || undefined,
                shift: filters.shift,
                process_id: filters.processId || undefined,
                process_name: filters.processName,
                search: filters.search?.trim(),
                page: filters.page || 1,
                page_size: filters.pageSize || 20,
                include_meta: includeMeta ? 1 : 0,
            },
        });
        return normalizeManagerReportPage(res.data);
    });
};

export const invalidatePendingReportCache = () => clearSessionCache("manager-pending");
export const invalidateApprovedReportCache = () => clearSessionCache("manager-approved");
export const invalidateManagerReportCaches = () => {
    clearSessionCache("manager-pending");
    clearSessionCache("manager-approved");
};

export const getReports = async(): Promise<ProductionReport[]> => (await getApprovedReports()).data;

export const getReportById = async(id:number, source?:string | null)=>{
    const normalizedSource = String(source || "").toLowerCase();
    const isTempReport = normalizedSource === "pending" || normalizedSource === "temp";
    const url = isTempReport ? `/production-temp/${id}` : `/production/${id}`;
    const res = await api.get(url);
    return res.data.data || res.data;
};

export const updateReport = async (
    id: number,
    data: ProductionReport,
    source: "pending" | "approved" = "approved",
    expectedUpdatedAt: string | null = null
) => {
    const endpoint = source === "pending" ? `/production-temp/${id}` : `/production/${id}`;
    const payload = source === "approved" ? { ...data, expected_updated_at: expectedUpdatedAt || undefined } : data;
    const res = await api.put(endpoint, payload);
    return res.data;
};

export const deleteReport = async(id:number, reason:string)=>{
    const res = await api.delete(`/production/${id}`, { data: { reason: String(reason || "").trim() } });
    return res.data;
};

export const exportProductionExcel = async(date:string)=>{
    const res = await api.get(`/reports/export-excel?date=${date}&type=pending`, { responseType:"blob" });
    downloadExcel(res.data, `BaoCaoChoDuyet_${date}.xlsx`);
};

export const getApprovedDates = async()=>{
    const res = await api.get("/production/dates");
    return res.data.data || res.data || [];
};

export const getApprovedReportsByDate = async(date:string):Promise<ProductionReport[]> =>
    (await getApprovedReports({ dateFrom: date, dateTo: date })).data;

export const exportApprovedExcel = async(date:string)=>{
    const res = await api.get(`/reports/export-excel?date=${date}&type=approved`, { responseType:"blob" });
    downloadExcel(res.data, `BaoCaoDaDuyet_${date}.xlsx`);
};

const downloadExcel = (data:BlobPart, filename:string)=>{
    const blob = new Blob([data], { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href=url;
    link.download=filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
};

export type TempReviewTarget = { id: number; expected_updated_at?: string | null };
const normalizeTempReviewTargets = (items: Array<number | TempReviewTarget>) =>
    items.map((item) => typeof item === "number"
        ? { id: item, expected_updated_at: null }
        : { id: Number(item.id), expected_updated_at: item.expected_updated_at || null });

export const approveSelectedTempReports = async (items: Array<number | TempReviewTarget>) => {
    const targets = normalizeTempReviewTargets(items);
    const res = await api.post("/production-temp/approve-selected", { ids: targets.map((item) => item.id), targets });
    invalidateManagerReportCaches();
    return res.data;
};

export const rejectSelectedTempReports = async (items: Array<number | TempReviewTarget>, reason: string) => {
    const targets = normalizeTempReviewTargets(items);
    const res = await api.post("/production-temp/reject-selected", { ids: targets.map((item) => item.id), targets, reason });
    invalidateManagerReportCaches();
    invalidatePendingReportCache();
    return res.data;
};

export interface MachineProductionEventDefectInput {
    defect_type_id?: number;
    defect_code?: string;
    quantity: number;
    responsible_worker_id: number;
}
export interface MachineProductionEvent {
    id: number;
    process_id: number;
    machine_id: number;
    machine_code: string;
    product_code: string;
    work_date: string;
    shift: string;
    physical_ok_quantity: number;
    physical_ng_quantity?: number;
    physical_counted_output: number;
    physical_total_output?: number;
    credited_output?: number;
    machine_time_hours: number;
    maximum_output?: number;
    standard_output?: number;
    standard_source?: string | null;
    exclude_kqd_from_tt_snapshot?: number | null;
    status: string;
    defects?: MachineProductionEventDefectInput[];
    participants?: Array<{ worker_id: number; machine_line_id?: number; report_id?: number }>;
    [key: string]: unknown;
}
export interface MachineProductionEventInput {
    process_id: number;
    machine_id?: number | null;
    machine_code: string;
    product_code: string;
    work_date: string;
    shift: string;
    physical_ok_quantity: number;
    machine_time_hours: number;
    defects?: MachineProductionEventDefectInput[];
    temp_machine_line_ids?: number[];
}
export interface MachineProductionEventUpdate {
    physical_ok_quantity?: number;
    machine_time_hours?: number;
    defects?: MachineProductionEventDefectInput[];
}
export const createMachineProductionEvent = async (data: MachineProductionEventInput): Promise<MachineProductionEvent> => {
    const res = await api.post("/machine-production-events", data);
    return res.data?.data ?? res.data;
};
export const getMachineProductionEvent = async (eventId: number): Promise<MachineProductionEvent> => {
    const res = await api.get(`/machine-production-events/${eventId}`);
    return res.data?.data ?? res.data;
};
export const updateMachineProductionEvent = async (eventId: number, patch: MachineProductionEventUpdate): Promise<MachineProductionEvent> => {
    const res = await api.put(`/machine-production-events/${eventId}`, patch);
    return res.data?.data ?? res.data;
};
