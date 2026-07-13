import api from "../api/axios";
import type { ProductionReport } from "../types/production";


// =========================
// WORKER CREATE TEMP REPORT
// =========================

export const createTempReport = async (
    data: ProductionReport
) => {

    const res = await api.post(
        "/production-temp",
        data
    );

    return res.data;

};



// =========================
// MANAGER GET TEMP REPORTS
// =========================

export const getTempReports = async (): Promise<ProductionReport[]> => {

    const res = await api.get(
        "/production-temp"
    );

    return res.data.data;

};



// =========================
// GET TEMP DETAIL
// =========================

export const getTempReportById = async (
    id:number
):Promise<ProductionReport>=>{


    const res = await api.get(
        `/production-temp/${id}`
    );


    return res.data.data;

};




// =========================
// PRODUCTION MAIN DATA
// =========================


export const getReports = async (): Promise<ProductionReport[]> => {

    const res = await api.get("/production");

    return res.data.data;

};



export const getReportById = async (
    id: number
): Promise<ProductionReport> => {


    const res = await api.get(
        `/production/${id}`
    );


    return res.data.data;

};



export const updateReport = async (
    id:number,
    data:ProductionReport
)=>{


    const res = await api.put(
        `/production/${id}`,
        data
    );


    return res.data;

};



export const deleteReport = async (
    id:number
)=>{


    const res = await api.delete(
        `/production/${id}`
    );


    return res.data;

};