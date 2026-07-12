import api from "../api/axios";
import type { ProductionReport } from "../types/production";

export const createReport = async (data: ProductionReport) => {
    const res = await api.post("/production", data);
    return res.data;
};

export const getReports = async (): Promise<ProductionReport[]> => {
    const res = await api.get("/production");
    return res.data.data;
};

export const getReportById = async (
    id: number
): Promise<ProductionReport> => {
    const res = await api.get(`/production/${id}`);
    return res.data.data;
};

export const updateReport = async (
    id: number,
    data: ProductionReport
) => {
    const res = await api.put(`/production/${id}`, data);
    return res.data;
};

export const deleteReport = async (id: number) => {
    const res = await api.delete(`/production/${id}`);
    return res.data;
};