import api from "../api/axios";
import type { ProductionReport } from "../types/production";

export const createReport = async (
    data: ProductionReport
) => {
    const res = await api.post("/production", data);
    return res.data;
};

export const getReports = async () => {
    const res = await api.get<ProductionReport[]>("/production");
    return res.data;
};

export const getReportById = async (
    id: number
) => {
    const res = await api.get<ProductionReport>(`/production/${id}`);
    return res.data;
};

export const updateReport = async (
    id: number,
    data: ProductionReport
) => {
    const res = await api.put(`/production/${id}`, data);
    return res.data;
};

export const deleteReport = async (
    id: number
) => {
    const res = await api.delete(`/production/${id}`);
    return res.data;
};