import api from "../api/axios";




import type {
    ProductionDeduction,
    ProductionDefect,
    ProductionReport
} from "../types/production";
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







// =====================================================
// DUYỆT THEO NGÀY
// =====================================================

export const approveTempByDate = async(

    date:string

)=>{


    const res = await api.post(

        "/production-temp/approve-date",

        {

            date

        }

    );


    return res.data;


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

export const getPendingReports = async()=>{


    const res = await api.get(

        "/production-temp/pending"

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


    const url =
        source === "pending"
            ? `/production-temp/${id}`
            : `/production/${id}`;



    const res =
    await api.get(url);



    return res.data.data || res.data;


};







// =====================================================
// UPDATE
// =====================================================

export const updateReport = async(

    id:number,

    data:ProductionReport

)=>{


    const res = await api.put(

        `/production/${id}`,

        data

    );


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
    ids: number[],
    date?: string
) => {
    const validIds = [
        ...new Set(
            ids
                .map(Number)
                .filter(
                    id =>
                        Number.isInteger(id) &&
                        id > 0
                )
        )
    ];

    if (validIds.length === 0) {
        throw new Error(
            "Vui lòng chọn ít nhất một báo cáo"
        );
    }

    const response = await api.post(
        "/reports/export-excel",
        {
            ids: validIds
        },
        {
            responseType: "blob"
        }
    );

    const contentDisposition =
        response.headers[
            "content-disposition"
        ];

    let fileName =
        `bao-cao-da-duyet-${
            date || "da-chon"
        }.xlsx`;

    if (contentDisposition) {
        const fileNameMatch =
            contentDisposition.match(
                /filename="?([^"]+)"?/i
            );

        if (fileNameMatch?.[1]) {
            fileName =
                decodeURIComponent(
                    fileNameMatch[1]
                );
        }
    }

    const blob = new Blob(
        [response.data],
        {
            type:
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        }
    );

    const downloadUrl =
        window.URL.createObjectURL(blob);

    const link =
        document.createElement("a");

    link.href = downloadUrl;
    link.download = fileName;

    document.body.appendChild(link);

    link.click();
    link.remove();

    window.URL.revokeObjectURL(
        downloadUrl
    );
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