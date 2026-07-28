import { getAccessToken } from "../utils/authStorage";
import api from "./api";




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

export const getCompanyNetworkAccess = async (): Promise<CompanyNetworkAccess> => {
    const res = await api.get("/network/access", {
        params: { _t: Date.now() }
    });

    return res.data?.data || res.data;
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

export interface PendingReportFilters {
    dateFrom?: string;
    dateTo?: string;
    shift?: string;
    processId?: number | string;
    search?: string;
}

export const getPendingReports = async (
    filters: PendingReportFilters = {}
) => {
    const res = await api.get(
        "/production-temp/pending",
        {
            params: {
                date_from: filters.dateFrom || undefined,
                date_to: filters.dateTo || undefined,
                shift: filters.shift || undefined,
                process_id: filters.processId || undefined,
                search: filters.search?.trim() || undefined
            }
        }
    );

    return res.data.data || res.data || [];
};







// =====================================================
// MANAGER XEM ĐÃ DUYỆT
// =====================================================

export const getApprovedReports = async()=>{


    const res = await api.get(

        "/production-temp/approved"

    );


    return res.data.data || res.data || [];


};







// =====================================================
// LẤY BÁO CÁO ĐÃ DUYỆT
// =====================================================

export const getReports = async():

Promise<ProductionReport[]>=>{


    const res = await api.get(

        "/production"

    );


    return res.data.data || res.data || [];


};







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
    source: "pending" | "approved" = "approved"
) => {
    const endpoint = source === "pending"
        ? `/production-temp/${id}`
        : `/production/${id}`;

    const res = await api.put(endpoint, data);
    return res.data;
};







// =====================================================
// DELETE
// =====================================================

export const deleteReport = async(

    id:number

)=>{


    const res = await api.delete(

        `/production/${id}`

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


    const res = await api.get(

        `/production/by-date?date=${date}`

    );


    return res.data.data || res.data || [];


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

export const approveSelectedTempReports = async (

    ids: number[]

) => {


    const res = await api.post(

        "/production-temp/approve-selected",

        {
            ids
        }

    );


    return res.data;

};

export const rejectSelectedTempReports = async (ids: number[], reason: string) => {
    const res = await api.post(
        "/production-temp/reject-selected",
        { ids, reason }
    );
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
        data
    );

    return res.data;
};
// =====================================================
// XUẤT EXCEL CÁC BÁO CÁO ĐÃ DUYỆT ĐƯỢC CHỌN
// =====================================================

export const exportSelectedApprovedExcel = async (
    date: string
) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error("Ngày xuất Excel không hợp lệ");
    }

    // Trong Electron, không tạo Blob và không mở hộp Save As.
    // Electron gọi API rồi ghi đè trực tiếp các file Excel tháng trong Documents.
    if (window.ktcDesktop?.isDesktop) {
        const token = getAccessToken() || "";
        if (!token) {
            throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        }

        const result = await window.ktcDesktop.syncAllExcel(token, date);
        if (!result?.success) {
            throw new Error(result?.message || "Không thể cập nhật file Excel tháng");
        }
        return result;
    }

    const response = await api.post(
        "/reports/export-excel",
        { date },
        { responseType: "blob" }
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

    const blob = new Blob(
        [response.data],
        {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        }
    );

    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
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
