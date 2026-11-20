import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { describeApprovalError } from "../../utils/approvalError";
import { getStoredUser } from "../../utils/authStorage";
import { approveSelectedTempReports, approveTempReport, getPendingReports, getTempReportDetail, rejectSelectedTempReports } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import { getToday } from "./managerReportDateLogic";
import { dateText, rangeFor } from "./managerReportsPresentation";
import { pendingReportCode } from "./pendingReportPresentation";
import PendingReportTable from "./components/PendingReportTable";
import PendingReportDetail from "./components/PendingReportDetail";
import PendingRejectDialog from "./components/PendingRejectDialog";
import "./ReportsSplitReference.css";
import "./ReportTableSimplified.css";
import "./ReportsDetailCompact.css";

export default function Reports({ onOpenPendingReport }: { onOpenPendingReport?: (report: ProductionReport) => void } = {}) {
    const [date, setDate] = useState(getToday());
    const [range, setRange] = useState<{ dateFrom: string; dateTo: string } | null>(null);
    const [searchKeyword, setSearchKeyword] = useState(""); const [searchQuery, setSearchQuery] = useState(""); const [process, setProcess] = useState(""); const [shift, setShift] = useState("");
    const [reports, setReports] = useState<ProductionReport[]>([]); const [processOptions, setProcessOptions] = useState<string[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
    const [page, setPage] = useState(1); const [pages, setPages] = useState(1); const [total, setTotal] = useState(0);
    const [detail, setDetail] = useState<ProductionReport | null>(null); const [detailLoading, setDetailLoading] = useState(false); const [detailError, setDetailError] = useState(""); const [approving, setApproving] = useState(false);
    const [selectedIds, setSelectedIds] = useState<number[]>([]); const [bulkApproving, setBulkApproving] = useState(false); const [bulkProgress, setBulkProgress] = useState({ completed: 0, total: 0 });
    const [actionFeedback, setActionFeedback] = useState<{ kind: "success" | "warning" | "error"; message: string } | null>(null);
    const [rejectReason, setRejectReason] = useState(""); const [rejectNote, setRejectNote] = useState(""); const [rejecting, setRejecting] = useState(false); const [rejectDialogOpen, setRejectDialogOpen] = useState(false); const [rejectTargetIds, setRejectTargetIds] = useState<number[]>([]);

    const reportLoadSeqRef = useRef(0);
    const reportAbortRef = useRef<AbortController | null>(null);
    const managerActionLockRef = useRef(false);
    const detailRequestSeqRef = useRef(0);
    const rejectDialogTriggerRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        const timer = setTimeout(() => {
            setSearchQuery(searchKeyword.trim());
        }, 250);
        return () => clearTimeout(timer);
    }, [searchKeyword]);

    const load = useCallback(async () => {
        const requestSeq = ++reportLoadSeqRef.current;
        reportAbortRef.current?.abort();
        const controller = new AbortController();
        reportAbortRef.current = controller;
        const isCurrentRequest = () => reportLoadSeqRef.current === requestSeq;
        try {
            setLoading(true); setError("");
            const r = range || { dateFrom: date, dateTo: date };
            const result = await getPendingReports({ dateFrom: r.dateFrom, dateTo: r.dateTo, processName: process || undefined, shift: shift || undefined, search: searchQuery || undefined, page, pageSize: 8, includeMeta: true, signal: controller.signal });
            if (!isCurrentRequest()) return;
            const lastPage = Math.max(1, result.pagination?.total_pages || 1);
            setTotal(result.pagination?.total || 0);
            setPages(lastPage);
            if (result.processes) setProcessOptions(result.processes.map(item => String(item?.process_name || item?.process_code || "")).filter(Boolean).sort((a, b) => a.localeCompare(b, "vi")));
            // After approving the last item on a page, request the new last page
            // instead of briefly showing a mismatched empty page.
            if (page > lastPage) { setReports([]); setPage(lastPage); return; }
            setReports(result.data || []);
        } catch (e: any) {
            if (!isCurrentRequest()) return;
            // A transient reload failure must not erase the previous page or the
            // process filter choices. Keep the last successful snapshot visible
            // behind the retryable error until a new request succeeds.
            setError(e?.response?.data?.message || "Không thể tải báo cáo chờ duyệt");
        } finally {
            if (reportAbortRef.current === controller) reportAbortRef.current = null;
            if (isCurrentRequest()) setLoading(false);
        }
    }, [date, range, process, shift, searchQuery, page]);

    const filterKey = JSON.stringify([date, range?.dateFrom || "", range?.dateTo || "", process, shift, searchQuery]);
    const previousFilterKeyRef = useRef(filterKey);
    // A bulk request may finish after the user changes filters or pages.
    // Never restore its failed IDs into a different selection scope.
    const selectionScopeRef = useRef("");
    useEffect(() => {
        selectionScopeRef.current = JSON.stringify([filterKey, page]);
    }, [filterKey, page]);

    useEffect(() => {
        const filtersChanged = previousFilterKeyRef.current !== filterKey;
        previousFilterKeyRef.current = filterKey;
        // The filter-reset effect below moves a non-first page to page 1.
        // Avoid fetching the old page with newly changed filters.
        if (filtersChanged && page !== 1) return;
        void load();
        return () => {
            reportAbortRef.current?.abort();
            reportLoadSeqRef.current += 1;
        };
    }, [load, filterKey, page]);

    useEffect(() => {
        detailRequestSeqRef.current += 1;
        setPage(1); setDetail(null); setDetailLoading(false); setDetailError(""); setSelectedIds([]);
        setRejectDialogOpen(false); setRejectTargetIds([]);
    }, [date, range, process, shift, searchQuery]);
    useEffect(() => {
        setSelectedIds([]);
        detailRequestSeqRef.current += 1;
        setDetail(null);
        setDetailLoading(false);
        setDetailError("");
        setRejectDialogOpen(false);
        setRejectTargetIds([]);
    }, [page]);

    const processes = processOptions;
    const shifts = useMemo(() => Array.from(new Set(["A", "B", "C", "D", ...reports.map(r => String(r.shift || "")).filter(Boolean), shift].filter(Boolean))).sort(), [reports, shift]);
    const quick = (type: "day" | "week" | "month" | "year") => {
        const today = getToday();
        setDate(today);
        setRange(type === "day" ? null : rangeFor(today, type));
    };
    const resetFilters = () => {
        setSearchKeyword("");
        setSearchQuery("");
        setProcess("");
        setShift("");
        setDate(getToday());
        setRange(null);
        setActionFeedback(null);
    };
    const actionBusy = approving || bulkApproving || rejecting;
    const filtersDisabled = actionBusy || rejectDialogOpen;
    const selectedVisibleCount = reports.filter(report => selectedIds.includes(Number(report.id))).length;

    const closeDetail = () => {
        detailRequestSeqRef.current += 1;
        setDetail(null);
        setDetailLoading(false);
        setDetailError("");
    };

    const openDetail = async (report: ProductionReport) => {
        const requestSeq = ++detailRequestSeqRef.current;
        const isCurrent = () => detailRequestSeqRef.current === requestSeq;
        setDetail(report);
        setDetailError("");
        setDetailLoading(true);
        try {
            const full = await getTempReportDetail(Number(report.id));
            if (isCurrent()) {
                const validDetail = full && Number(full.id) === Number(report.id);
                setDetail(validDetail ? full : report);
                if (!validDetail) setDetailError("Dữ liệu chi tiết không hợp lệ hoặc đã thay đổi. Vui lòng tải lại trước khi xử lý.");
            }
        } catch {
            if (isCurrent()) {
                setDetail(report);
                setDetailError("Tải chi tiết thất bại. Vui lòng thử lại trước khi xử lý báo cáo.");
            }
        } finally {
            if (isCurrent()) setDetailLoading(false);
        }
    };

    const navigate = useNavigate();
    const currentUser = getStoredUser();
    const role = String(currentUser?.role || "manager").toLowerCase();
    const basePath = currentUser?.role === "admin" ? "/admin" : role === "lead" ? "/lead" : role === "admin_ops" ? "/admin-ops" : "/manager";

    const approveDetail = async () => {
        if (!detail || detailLoading || detailError || approving || rejectDialogOpen || loading || error || managerActionLockRef.current) return;
        const approvedId = Number(detail.id);
        const requestSeq = detailRequestSeqRef.current;
        const selectionScope = selectionScopeRef.current;
        managerActionLockRef.current = true;
        setApproving(true);
        try {
            // Capture the report being approved: switching detail while awaiting
            // must not close or redirect the manager's newer selection.
            await approveSelectedTempReports([approvedId]);
            if (detailRequestSeqRef.current === requestSeq) closeDetail();
            // A single approval must not replace a newer page/filter request.
            setSelectedIds(previous => previous.filter(id => id !== approvedId));
            setActionFeedback({ kind: "success", message: `Đã duyệt báo cáo #${approvedId} thành công.` });
            // Approval outcome is independent of the best-effort list refresh.
            if (selectionScopeRef.current === selectionScope) await load();
        } catch (e: any) {
            setActionFeedback({ kind: "error", message: describeApprovalError(e, "Không thể duyệt báo cáo. Vui lòng thử lại.") });
            // Shared GC machine approvals require a physical event on the detail page.
            if (e?.response?.data?.code === "MACHINE_EVENT_REQUIRED" && detailRequestSeqRef.current === requestSeq) {
                navigate(`${basePath}/report/${approvedId}?source=pending`);
            }
        } finally {
            managerActionLockRef.current = false;
            setApproving(false);
        }
    };

    const openRejectDialog = (ids: number[]) => {
        const validIds = [...new Set(ids.map(Number).filter(id => Number.isInteger(id) && id > 0))];
        if (!validIds.length || rejecting || approving || bulkApproving || loading || error || managerActionLockRef.current) return;
        rejectDialogTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setRejectTargetIds(validIds);
        setRejectReason("");
        setRejectNote("");
        setRejectDialogOpen(true);
    };

    const closeRejectDialog = () => {
        if (rejecting) return;
        setRejectDialogOpen(false);
        setRejectTargetIds([]);
        rejectDialogTriggerRef.current?.focus();
    };
    useEffect(() => {
        if (!rejectDialogOpen) return;
        document.getElementById("pending-reject-reason")?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !managerActionLockRef.current) {
                event.preventDefault();
                setRejectDialogOpen(false);
                setRejectTargetIds([]);
                rejectDialogTriggerRef.current?.focus();
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [rejectDialogOpen]);

    const rejectTargets = async () => {
        if (rejecting || loading || error || !rejectTargetIds.length || managerActionLockRef.current) return;
        const reason = rejectReason === "Khác" ? rejectNote.trim() : rejectReason.trim();
        if (!reason) { window.alert("Vui lòng chọn lý do từ chối."); return; }
        const targets = reports.filter(report => rejectTargetIds.includes(Number(report.id)));
        if (targets.length !== rejectTargetIds.length) {
            window.alert("Một số báo cáo không còn trong danh sách hiện tại. Hãy tải lại danh sách rồi thử lại.");
            return;
        }
        if (!window.confirm(`Từ chối ${targets.length} báo cáo đã chọn? Lý do: ${reason}`)) return;
        const detailRequestSeq = detailRequestSeqRef.current;
        const rejectedIds = [...rejectTargetIds];
        const selectionScope = selectionScopeRef.current;
        managerActionLockRef.current = true;
        setRejecting(true);
        try {
            const failedIds: number[] = [];
            const failures: string[] = [];
            let succeeded = 0;
            for (const report of targets) {
                try { await rejectSelectedTempReports([Number(report.id)], reason); succeeded += 1; }
                catch (e: any) { failedIds.push(Number(report.id)); failures.push(`#${report.id}: ${e?.response?.data?.message || e?.message || "Không thể từ chối"}`); }
            }
            if (selectionScopeRef.current === selectionScope) {
                setSelectedIds(previous => [...new Set([...previous.filter(id => !rejectedIds.includes(id)), ...failedIds])]);
            }
            if (detail && detailRequestSeqRef.current === detailRequestSeq && rejectedIds.includes(Number(detail.id)) && !failedIds.includes(Number(detail.id))) closeDetail();
            setRejectDialogOpen(false);
            setRejectTargetIds([]);
            rejectDialogTriggerRef.current?.focus();
            setActionFeedback({
                kind: failures.length ? "warning" : "success",
                message: `Đã từ chối ${succeeded}/${targets.length} báo cáo.${failures.length ? ` Các báo cáo lỗi: ${failures.join("; ")}` : ""}`,
            });
            // Do not delay or misclassify the decision result if refresh fails.
            if (selectionScopeRef.current === selectionScope) await load();
        } catch (e: any) {
            setActionFeedback({ kind: "error", message: e?.response?.data?.message || e?.message || "Không thể hoàn tất từ chối báo cáo." });
        } finally { managerActionLockRef.current = false; setRejecting(false); }
    };

    const visibleIds = reports.map(r => Number(r.id)).filter(id => Number.isInteger(id) && id > 0);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id));
    const toggleSelected = (id: number) => {
        if (loading || rejecting || approving || bulkApproving || managerActionLockRef.current) return;
        setSelectedIds(previous => previous.includes(id) ? previous.filter(x => x !== id) : [...previous, id]);
    };
    const toggleVisibleSelection = () => {
        if (loading || rejecting || approving || bulkApproving || managerActionLockRef.current) return;
        setSelectedIds(previous => allVisibleSelected ? previous.filter(id => !visibleIds.includes(id)) : [...new Set([...previous, ...visibleIds])]);
    };
    const approveBulk = async () => {
        const targets = reports.filter(r => selectedIds.includes(Number(r.id)));
        if (!targets.length || bulkApproving || loading || error || managerActionLockRef.current) return;
        if (!window.confirm(`Duyệt lần lượt ${targets.length} báo cáo đã chọn? Báo cáo lỗi sẽ được giữ lại để xử lý sau.`)) return;
        const detailRequestSeq = detailRequestSeqRef.current;
        const approvedIds = targets.map(report => Number(report.id));
        const selectionScope = selectionScopeRef.current;
        managerActionLockRef.current = true;
        setBulkApproving(true); setBulkProgress({ completed: 0, total: targets.length }); setError("");
        const failedIds: number[] = [];
        const failures: string[] = [];
        let succeeded = 0;
        try {
            // Keep individual approval outcomes; only two independent requests run at once.
            // This reduces multi-select latency without making the backend's
            // transaction/validation checks optional or retrying an unknown result.
            setBulkProgress({ completed: 0, total: targets.length });
            let nextIndex = 0;
            let completed = 0;
            const approveWorker = async () => {
                while (nextIndex < targets.length) {
                    const report = targets[nextIndex++];
                    const id = Number(report.id);
                    try {
                        await approveTempReport(id);
                        succeeded += 1;
                    } catch (e: any) {
                        failedIds.push(id);
                        const code = `PR${String(report.work_date || "REPORT").slice(0, 10).replace(/-/g, "")}-${report.worker_code || id}`;
                        failures.push(`${code} (#${id}): ${describeApprovalError(e, "Không thể duyệt")}`);
                    } finally {
                        completed += 1;
                        setBulkProgress({ completed, total: targets.length });
                    }
                }
            };
            await Promise.all(Array.from({ length: Math.min(2, targets.length) }, () => approveWorker()));
            if (selectionScopeRef.current === selectionScope) setSelectedIds(failedIds);
            if (detail && detailRequestSeqRef.current === detailRequestSeq && approvedIds.includes(Number(detail.id)) && !failedIds.includes(Number(detail.id))) closeDetail();
            // The current filter/page owns its own request; never abort it with stale parameters.
            setActionFeedback({
                kind: failedIds.length ? "warning" : "success",
                message: `Đã duyệt ${succeeded}/${targets.length} báo cáo.${failedIds.length ? ` Chưa duyệt được ${failedIds.length} báo cáo: ${failures.join("; ")}` : ""}`,
            });
            // A stale or failed refresh must not change the approval summary.
            if (selectionScopeRef.current === selectionScope) await load();
        } catch (e: any) {
            setActionFeedback({ kind: "error", message: describeApprovalError(e, "Không thể hoàn tất duyệt hàng loạt.") });
        } finally { managerActionLockRef.current = false; setBulkApproving(false); setBulkProgress({ completed: 0, total: 0 }); }
    };

    // Stable report identifiers are computed from React state, not rendered row positions.
    const duplicateReportCodes = useMemo(() => {
        const counts = new Map<string, number>();
        for (const report of reports) {
            const base = pendingReportCode(report);
            counts.set(base, (counts.get(base) || 0) + 1);
        }
        return counts;
    }, [reports]);
    const openRow = (report: ProductionReport) => {
        if (onOpenPendingReport) {
            const id = Number(report.id);
            if (Number.isSafeInteger(id) && id > 0) onOpenPendingReport(report);
            return;
        }
        void openDetail(report);
    };

    return (
        <div className="pending-reference-page pending-review-screen">
            <div className="pending-page-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div><h1 style={{ margin: 0, color: "#12385f", fontSize: 26, fontWeight: 800 }}>Báo cáo chờ duyệt</h1>
                <div style={{ marginTop: 5, color: "#6f89a8", fontSize: 13 }}>Xem và xử lý báo cáo sản xuất, bao gồm các đề xuất chỉnh sửa.</div></div>
                {window.location.pathname.startsWith("/manager") && <button type="button" onClick={() => navigate("/manager/edit-proposals")} style={{ border: "1px solid #cbd9e8", borderRadius: 8, padding: "9px 13px", background: "#fff", color: "#24547d", fontWeight: 700, cursor: "pointer" }}>Đề xuất chỉnh sửa</button>}
            </div>

            <div className="pending-review-toolbar">
                <span role="status" aria-live="polite">{range ? `Từ ${dateText(range.dateFrom)} đến ${dateText(range.dateTo)}` : `Ngày ${dateText(date)}`}</span>
                <div>
                    <button type="button" onClick={resetFilters} disabled={filtersDisabled}>Đặt lại bộ lọc</button>
                    <button type="button" onClick={() => void load()} disabled={loading || filtersDisabled}>{loading ? "Đang tải..." : "Làm mới danh sách"}</button>
                </div>
            </div>
            {actionFeedback && <div className={`pending-review-feedback ${actionFeedback.kind}`} role={actionFeedback.kind === "error" ? "alert" : "status"} aria-live="polite">
                <span>{actionFeedback.message}</span>
                <button type="button" aria-label="Đóng thông báo" onClick={() => setActionFeedback(null)}>×</button>
            </div>}
            <div className="pending-filter-card">
                <label className="pending-search" style={{ gridArea: "search", display: "flex", flexDirection: "column", alignSelf: "end", gap: 4, minWidth: 0, position: "relative" }}><span style={{ position: "static", display: "block", width: "auto", height: "auto", border: 0, fontSize: 12, lineHeight: "16px", color: "#526b88", zIndex: "auto" }}>Tìm kiếm</span><input value={searchKeyword} disabled={filtersDisabled} onChange={e => setSearchKeyword(e.target.value)} aria-label="Tìm báo cáo theo mã hoặc công nhân" placeholder="Tìm kiếm mã báo cáo, công nhân..." /></label>
                <label className="pending-date-filter" style={{ gridArea: "date", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}><span>Ngày báo cáo</span><input type="date" value={date} disabled={filtersDisabled} onChange={e => { setDate(e.target.value); setRange(null); }} /></label>
                <div className="pending-quick-filters" style={{ gridArea: "quick", minWidth: 0 }}>
                    {(["Hôm nay", "Tuần này", "Tháng này", "Năm này"] as const).map(label => {
                        const type = label === "Hôm nay" ? "day" : label === "Tuần này" ? "week" : label === "Tháng này" ? "month" : "year";
                        const active = type === "day" ? !range && date === getToday() : Boolean(range && date === getToday() && range.dateFrom === rangeFor(date, type).dateFrom && range.dateTo === rangeFor(date, type).dateTo);
                        return <button key={label} type="button" className={active ? "active" : ""} aria-pressed={active} disabled={filtersDisabled} onClick={() => quick(type)}>{label}</button>;
                    })}
                </div>
                <label className="pending-process-filter" style={{ gridArea: "process", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}><span>Công đoạn</span><select value={process} disabled={filtersDisabled} onChange={e => setProcess(e.target.value)}><option value="">Tất cả</option>{processes.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
                <label className="pending-shift-filter" style={{ gridArea: "shift", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}><span>Ca làm việc</span><select value={shift} disabled={filtersDisabled} onChange={e => setShift(e.target.value)}><option value="">Tất cả</option>{shifts.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
            </div>

            <div className={`pending-workspace ${detail ? "" : "list-only"}`} style={{ marginTop: 12 }}>
                <section className="pending-list-card">
                    <div className="pending-list-tabs">
                        <button type="button" className="pending-list-tab active">Danh sách chờ duyệt <span className="tab-badge" style={{ background: "#fff0d8", color: "#a56a00" }}>{total}</span></button>
                    </div>
                    <div className="pending-bulk-toolbar">
                        <div className="pending-bulk-summary" style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 190, color: "#526b88", fontSize: 13 }}>
                            <span style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 9, background: selectedIds.length ? "#e2efff" : "#edf2f7", color: selectedIds.length ? "#1769aa" : "#64748b", fontWeight: 800, fontSize: 14 }}>{selectedIds.length}</span>
                            <span><strong style={{ color: "#244564" }}>{selectedVisibleCount} báo cáo</strong> được chọn trên trang</span>
                        </div>
                        {selectedVisibleCount > 0 && !actionBusy && <button type="button" className="pending-clear-selection" onClick={() => setSelectedIds([])}>Bỏ chọn</button>}
                        <div className="pending-bulk-buttons" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", gap: 10, marginLeft: "auto" }}>
                            <button type="button" onClick={() => openRejectDialog(selectedIds)} disabled={selectedIds.length === 0 || rejecting || approving || bulkApproving || loading || Boolean(error)} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 40, border: "1px solid", borderColor: selectedIds.length ? "#e5a4a4" : "#e2e8f0", borderRadius: 9, padding: "0 16px", background: selectedIds.length ? "#fff" : "#f1f5f9", color: selectedIds.length ? "#b42323" : "#94a3b8", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", cursor: selectedIds.length && !rejecting && !loading ? "pointer" : "not-allowed", transition: "background .15s ease, border-color .15s ease" }}>{rejecting ? "Đang từ chối..." : `✕ Từ chối ${selectedIds.length}`}</button>
                            <button type="button" onClick={() => void approveBulk()} disabled={selectedIds.length === 0 || bulkApproving || approving || rejecting || loading || Boolean(error)} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 40, border: "1px solid", borderColor: selectedIds.length ? "#1769aa" : "#cbd5e1", borderRadius: 9, padding: "0 18px", background: selectedIds.length ? "linear-gradient(135deg, #1976c9, #145da0)" : "#cbd5e1", color: "#fff", fontSize: 13, fontWeight: 750, whiteSpace: "nowrap", cursor: selectedIds.length && !bulkApproving && !loading ? "pointer" : "not-allowed", boxShadow: selectedIds.length ? "0 3px 8px rgba(23,105,170,.18)" : "none", transition: "background .15s ease, box-shadow .15s ease" }}>{bulkApproving ? `Đang duyệt ${bulkProgress.completed}/${bulkProgress.total}...` : `✓ Duyệt ${selectedIds.length}`}</button>
                        </div>
                    </div>
                    {bulkApproving && <div className="pending-review-progress" role="status" aria-live="polite">
                        Đang duyệt báo cáo {bulkProgress.completed}/{bulkProgress.total}
                        <progress value={bulkProgress.completed} max={Math.max(1, bulkProgress.total)} />
                    </div>}
                    <PendingReportTable
                        reports={reports} loading={loading} error={error} onRetry={() => void load()}
                        detail={detail} onOpenRow={openRow} selectedIds={selectedIds}
                        onToggleSelected={toggleSelected} onToggleVisibleSelection={toggleVisibleSelection}
                        selectedVisibleCount={selectedVisibleCount} allVisibleSelected={allVisibleSelected}
                        duplicateReportCodes={duplicateReportCodes}
                        approving={approving} bulkApproving={bulkApproving} rejecting={rejecting}
                    />
                                        <div className="pending-table-footer" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
                        <span role="status" aria-live="polite">Trang {page}/{pages} · {total} báo cáo</span>
                        <nav className="management-pagination" aria-label="Phân trang báo cáo"><button type="button" aria-label="Trang trước" disabled={loading || approving || bulkApproving || rejecting || page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Trước</button><button type="button" aria-label="Trang sau" disabled={loading || approving || bulkApproving || rejecting || page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))}>Sau</button></nav>
                    </div>
                </section>
                <PendingReportDetail
                    detail={detail} detailLoading={detailLoading} detailError={detailError}
                    actionBusy={actionBusy} approving={approving} rejecting={rejecting}
                    bulkApproving={bulkApproving} rejectDialogOpen={rejectDialogOpen}
                    loading={loading} error={error}
                    closeDetail={closeDetail} openDetail={openDetail}
                    openRejectDialog={openRejectDialog} approveDetail={approveDetail}
                />
            </div>
        <PendingRejectDialog
            rejectDialogOpen={rejectDialogOpen} rejectTargetIds={rejectTargetIds}
            rejectReason={rejectReason} rejectNote={rejectNote} rejecting={rejecting}
            loading={loading} error={error} closeRejectDialog={closeRejectDialog}
            setRejectReason={setRejectReason} setRejectNote={setRejectNote} rejectTargets={rejectTargets}
        />
        </div>
    );
}
