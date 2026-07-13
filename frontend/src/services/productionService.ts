import api from "../api/axios";

import type {
    ProductionReport
} from "../types/production";




// ======================================
// WORKER TẠO BÁO CÁO CHỜ DUYỆT
// ======================================

export const createTempReport = async(

    data:ProductionReport

)=>{


    const res = await api.post(

        "/production-temp",

        data

    );


    return res.data;


};









// ======================================
// MANAGER LẤY DANH SÁCH NGÀY CÓ BÁO CÁO
// ======================================

export const getTempDates = async()=>{


    const res = await api.get(

        "/production-temp/dates"

    );


    return res.data.data || [];


};









// ======================================
// MANAGER XEM BÁO CÁO THEO NGÀY
// ======================================

export const getTempReportsByDate = async(

    date:string

):Promise<ProductionReport[]>=>{


    const res = await api.get(

        `/production-temp/by-date?date=${date}`

    );


    return res.data.data || [];


};









// ======================================
// MANAGER DUYỆT TOÀN BỘ NGÀY
// ======================================

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









// ======================================
// MANAGER XEM CHI TIẾT TEMP
// ======================================

export const getTempReportById = async(

    id:number

):Promise<ProductionReport>=>{


    const res = await api.get(

        `/production-temp/${id}`

    );


    return res.data.data;


};









// ======================================
// WORKER XEM BÁO CÁO CỦA MÌNH
// ======================================

export const getMyTempReports = async()=>{


    const res = await api.get(

        "/production-temp/my"

    );


    return res.data.data || [];


};









// ======================================
// DỮ LIỆU ĐÃ DUYỆT
// ======================================

export const getReports = async():

Promise<ProductionReport[]>=>{


    const res = await api.get(

        "/production"

    );


    return res.data.data || [];


};









// ======================================
// CHI TIẾT BÁO CÁO ĐÃ DUYỆT
// ======================================

export const getReportById = async(

    id:number

):Promise<ProductionReport>=>{


    const res = await api.get(

        `/production/${id}`

    );


    return res.data.data;


};









// ======================================
// UPDATE BÁO CÁO ĐÃ DUYỆT
// ======================================

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









// ======================================
// DELETE
// ======================================

export const deleteReport = async(

    id:number

)=>{


    const res = await api.delete(

        `/production/${id}`

    );


    return res.data;


};









// ======================================
// EXPORT EXCEL GIA CÔNG
// ======================================

export const exportProductionExcel = async(

    payload:any

)=>{


    const res = await api.post(

        "/reports/export-excel",

        payload,

        {

            responseType:"blob"

        }

    );



    const blob = new Blob(

        [

            res.data

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


    link.download =
        "GiaCong.xlsx";



    document.body.appendChild(link);



    link.click();



    link.remove();



    window.URL.revokeObjectURL(url);


};