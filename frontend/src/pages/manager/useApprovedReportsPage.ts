import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { getApprovedReports, getReportById, invalidateApprovedReportCache } from "../../services/productionService";
import { useApprovedReportExcelImport } from "./useApprovedReportExcelImport";
import type { ProductionReport } from "../../types/production";
import { getToday } from "./managerReportDateLogic";
import { rangeFor } from "./approvedReportsPresentation";

export function useApprovedReportsPage(onOpenReport?: (reportId: number) => void) {
    const [date, setDate] = useState(getToday());
    const [range, setRange] = useState<{ dateFrom: string; dateTo: string } | null>(() => rangeFor(getToday(), "month"));
    const [searchKeyword, setSearchKeyword] = useState(""); const [searchQuery, setSearchQuery] = useState(""); const [process, setProcess] = useState(""); const [shift, setShift] = useState("");
    const [reports, setReports] = useState<ProductionReport[]>([]); const [processOptions, setProcessOptions] = useState<string[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
    const [page, setPage] = useState(1); const [pages, setPages] = useState(1); const [total, setTotal] = useState(0);
    const [counts, setCounts] = useState({ day: 0, week: 0, month: 0, year: 0 });
    const [detail, setDetail] = useState<ProductionReport | null>(null); const [detailLoading, setDetailLoading] = useState(false); const [detailError, setDetailError] = useState("");

    const reportLoadSeqRef = useRef(0);
    const detailRequestSeqRef = useRef(0);
    const detailReportRef = useRef<ProductionReport | null>(null);
    const previousFilterKeyRef = useRef("");

    useEffect(() => {
        const timer = setTimeout(() => {
            setSearchQuery(searchKeyword.trim());
        }, 250);
        return () => clearTimeout(timer);
    }, [searchKeyword]);

    const load = useCallback(async () => {
        const requestSeq = ++reportLoadSeqRef.current;
        const isCurrentRequest = () => reportLoadSeqRef.current === requestSeq;
        try {
            setLoading(true); setError("");
            const r = range || { dateFrom: date, dateTo: date };
            const filters = { dateFrom: r.dateFrom, dateTo: r.dateTo, processName: process || undefined, shift: shift || undefined, search: searchQuery || undefined };
            const result = await getApprovedReports({ ...filters, page, pageSize: 20 });
            if (!isCurrentRequest()) return;
            const lastPage = Math.max(1, result.pagination?.total_pages || 1);
            setTotal(result.pagination?.total || 0); setPages(lastPage);
            if (result.processes) setProcessOptions(result.processes.map(item => String(item?.process_name || item?.process_code || "")).filter(Boolean).sort((a, b) => a.localeCompare(b, "vi")));
            if (page > lastPage) { setReports([]); setPage(lastPage); return; }
            setReports(result.data || []);

        } catch (e: unknown) {
            if (!isCurrentRequest()) return;
            setError(axios.isAxiosError(e) ? e.response?.data?.message || "Không thể tải báo cáo đã duyệt" : "Không thể tải báo cáo đã duyệt");
            /* Keep the previous list visible when refresh fails. */
        } finally { if (isCurrentRequest()) setLoading(false); }
    }, [date, range, process, shift, searchQuery, page]);

    // KPI counts depend on filters, not on the current table page. Keep them
    // separate from paged rows to avoid four redundant API calls per page turn.
    useEffect(() => {
        let cancelled = false;
        const ranges = (["day", "week", "month", "year"] as const).map(type => rangeFor(date, type));
        void Promise.allSettled(ranges.map(x => getApprovedReports({
            dateFrom: x.dateFrom, dateTo: x.dateTo,
            processName: process || undefined, shift: shift || undefined,
            search: searchQuery || undefined, page: 1, pageSize: 1, includeMeta: false,
        }))).then(values => {
            if (cancelled) return;
            setCounts(previous => {
                const count = (index: number, fallback: number) => {
                    const result = values[index];
                    return result.status === "fulfilled" ? (result.value.pagination?.total || 0) : fallback;
                };
                return { day: count(0, previous.day), week: count(1, previous.week), month: count(2, previous.month), year: count(3, previous.year) };
            });
        });
        return () => { cancelled = true; };
    }, [date, process, shift, searchQuery]);

    const filterKey = JSON.stringify([date, range?.dateFrom || "", range?.dateTo || "", process, shift, searchQuery]);
    useEffect(() => {
        const changed = previousFilterKeyRef.current !== filterKey;
        previousFilterKeyRef.current = filterKey;
        if (changed && page !== 1) return;
        void load();
        return () => { reportLoadSeqRef.current += 1; };
    }, [load, filterKey, page]);
    useEffect(() => { setPage(1); }, [date, range, process, shift, searchQuery]);
    useEffect(() => {
        detailRequestSeqRef.current += 1; detailReportRef.current = null;
        setDetail(null); setDetailError(""); setDetailLoading(false);
    }, [date, range, process, shift, searchQuery, page]);

    const processes = useMemo(() => Array.from(new Set([...processOptions, process].filter(Boolean))).sort((a, b) => a.localeCompare(b, "vi")), [processOptions, process]);
    const shifts = useMemo(() => Array.from(new Set(["A", "B", "C", "D", ...reports.map(r => String(r.shift || "")).filter(Boolean), shift].filter(Boolean))).sort(), [reports, shift]);
    const quick = (type: "day" | "week" | "month" | "year") => { setDate(getToday()); setRange(type === "day" ? null : rangeFor(getToday(), type)); };

    const openDetail = async (report: ProductionReport) => {
        // Manager/admin-ops navigation uses the clicked report ID directly.
        // Other roles retain the existing inline detail panel.
        if (onOpenReport) {
            const reportId = Number(report.id);
            if (Number.isSafeInteger(reportId) && reportId > 0) onOpenReport(reportId);
            return;
        }
        const sequence = ++detailRequestSeqRef.current; detailReportRef.current = report;
        setDetail(report); setDetailLoading(true); setDetailError("");
        try {
            const full = await getReportById(Number(report.id), "approved");
            if (detailRequestSeqRef.current !== sequence) return;
            if (!full || Number(full.id) !== Number(report.id)) {
                setDetailError("Chi tiết không hợp lệ. Vui lòng tải lại.");
                return;
            }
            // Keep the list KPI only if the detail represents the same stored version.
            const previous = report as ProductionReport & { kpi?: unknown };
            const next = full as ProductionReport & { kpi?: unknown };
            setDetail(next.kpi == null && next.updated_at != null && next.updated_at === previous.updated_at
                ? { ...full, kpi: previous.kpi } as ProductionReport : full);
        } catch {
            if (detailRequestSeqRef.current === sequence) setDetailError("Không thể tải chi tiết. Vui lòng thử lại.");
        } finally {
            if (detailRequestSeqRef.current === sequence) setDetailLoading(false);
        }
    };
    const closeDetail = () => {
        detailRequestSeqRef.current += 1; detailReportRef.current = null;
        setDetail(null); setDetailLoading(false); setDetailError("");
    };
    const resetFilters = () => {
        const today = getToday();
        setDate(today); setRange(rangeFor(today, "month"));
        setSearchKeyword(""); setSearchQuery(""); setProcess(""); setShift("");
    };
    const refreshReports = () => {
        invalidateApprovedReportCache();
        detailRequestSeqRef.current += 1;
        detailReportRef.current = null;
        setDetail(null);
        setDetailError("");
        setDetailLoading(false);
        void load();
    };

    const {reportImportPreview, reportImportStatus, reportImportBusy, previewExcelImport, applyExcelImport, cancelExcelImport} = useApprovedReportExcelImport(load);

    return { date, setDate, range, setRange, searchKeyword, setSearchKeyword, process, setProcess, shift, setShift, reports, loading, error, page, setPage, pages, total, counts, detail, detailLoading, detailError, detailReportRef, processes, shifts, quick, openDetail, closeDetail, resetFilters, refreshReports, reportImportPreview, reportImportStatus, reportImportBusy, previewExcelImport, applyExcelImport, cancelExcelImport };
}
