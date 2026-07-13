import api from "../api/axios";

import type {
    ProductionReport
} from "../types/production";




// =========================
// WORKER TẠO BÁO CÁO CHỜ DUYỆT
// =========================

export const createTempReport = async(
    data: ProductionReport
)=>{


    const res = await api.post(

        "/production-temp",

        data

    );


    return res.data;

};







// =========================
// MANAGER LẤY DANH SÁCH CHỜ DUYỆT
// =========================

export const getTempReports = async():

Promise<ProductionReport[]>=>{


    const res = await api.get(

        "/production-temp"

    );


    return res.data.data || [];

};







// =========================
// MANAGER XEM CHI TIẾT BÁO CÁO CHỜ DUYỆT
// =========================

export const getTempReportById = async(

    id:number

):

Promise<ProductionReport>=>{


    const res = await api.get(

        `/production-temp/${id}`

    );


    return res.data.data;

};








// =========================
// WORKER LẤY LỊCH SỬ CỦA MÌNH
// =========================

export const getMyTempReports = async():

Promise<ProductionReport[]>=>{


    const res = await api.get(

        "/production-temp/my"

    );


    return res.data.data || [];

};








// =========================
// DỮ LIỆU ĐÃ DUYỆT
// =========================

export const getReports = async():

Promise<ProductionReport[]>=>{


    const res = await api.get(

        "/production"

    );


    return res.data.data || [];

};







export const getReportById = async(

    id:number

):

Promise<ProductionReport>=>{


    const res = await api.get(

        `/production/${id}`

    );


    return res.data.data;

};







// =========================
// UPDATE
// =========================

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







// =========================
// DELETE
// =========================

export const deleteReport = async(

    id:number

)=>{


    const res = await api.delete(

        `/production/${id}`

    );


    return res.data;

};