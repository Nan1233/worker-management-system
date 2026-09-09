import api from "./api";
import { getSessionCached } from "./sessionCache";
import type { ProductionReport } from "../types/production";

export interface ApprovedReportQueryFilters {
  dateFrom?: string;
  dateTo?: string;
  shift?: string;
  processId?: number | string;
  processName?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface ApprovedReportQueryPage {
  data: ProductionReport[];
  pagination: { page: number; page_size: number; total: number; total_pages: number };
}

export const getApprovedReportsServer = async (filters: ApprovedReportQueryFilters = {}): Promise<ApprovedReportQueryPage> => {
  const page = Math.max(1, Number(filters.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize || 20)));
  const key = [
    "manager-approved-server",
    filters.dateFrom || "",
    filters.dateTo || "",
    filters.shift || "",
    filters.processId || "",
    filters.processName || "",
    filters.search?.trim() || "",
    page,
    pageSize,
  ].join(":");

  return getSessionCached(key, 15000, async () => {
    const res = await api.get("/production/", {
      params: {
        date_from: filters.dateFrom || undefined,
        date_to: filters.dateTo || undefined,
        shift: filters.shift || undefined,
        process_id: filters.processId || undefined,
        process_name: filters.processName || undefined,
        search: filters.search?.trim() || undefined,
        page,
        page_size: pageSize,
      },
    });
    const payload = res.data || {};
    return {
      data: Array.isArray(payload.data) ? payload.data : [],
      pagination: {
        page: Number(payload.pagination?.page || page),
        page_size: Number(payload.pagination?.page_size || pageSize),
        total: Number(payload.pagination?.total || 0),
        total_pages: Math.max(1, Number(payload.pagination?.total_pages || 1)),
      },
    };
  });
};

export const invalidateApprovedReportServerCache = () => {
  // The shared cache uses prefix invalidation; the legacy service keeps its own
  // manager-approved cache and is invalidated by the existing action helpers.
};
