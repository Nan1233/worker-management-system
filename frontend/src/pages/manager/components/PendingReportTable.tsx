import type { ProductionReport } from "../../../types/production";
import { text, processLabel, fmt, pct, dateText, kpi } from "../managerReportsPresentation";
import { pendingReportCode, pendingTrainingPercent } from "../pendingReportPresentation";

/** Read-only table view; filters, loading and review actions stay in Reports. */
type PendingReportTableProps = {
    reports: ProductionReport[];
    loading: boolean;
    error: string;
    onRetry: () => void;
    detail: ProductionReport | null;
    onOpenRow: (report: ProductionReport) => void;
    selectedIds: number[];
    onToggleSelected: (id: number) => void;
    onToggleVisibleSelection: () => void;
    selectedVisibleCount: number;
    allVisibleSelected: boolean;
    duplicateReportCodes: Map<string, number>;
    approving: boolean;
    bulkApproving: boolean;
    rejecting: boolean;
};

export default function PendingReportTable(props: PendingReportTableProps) {
    const {
        reports, loading, error, onRetry, detail, onOpenRow,
        selectedIds, onToggleSelected, onToggleVisibleSelection,
        selectedVisibleCount, allVisibleSelected, duplicateReportCodes,
        approving, bulkApproving, rejecting
    } = props;
    return (
<div className={`pending-table-wrap ${reports.length === 0 ? "pending-table-empty" : ""}`} role="region" aria-label="Bảng báo cáo chờ duyệt, có thể cuộn ngang" tabIndex={0} style={{ overflowX: "auto" }}>
                        <table className="pending-reference-table" style={{ width: "100%", borderCollapse: "collapse" }}><caption className="pending-table-caption">Danh sách báo cáo sản xuất chờ duyệt</caption>
                            <thead><tr>
                                <th className="select-col"><input type="checkbox" aria-label="Chọn tất cả báo cáo trên trang này" checked={allVisibleSelected} ref={node => { if (node) node.indeterminate = selectedVisibleCount > 0 && !allVisibleSelected; }} onChange={onToggleVisibleSelection} disabled={loading || approving || bulkApproving || rejecting || reports.length === 0} /></th>
                                {["Mã báo cáo", "Công nhân", "Công đoạn", "Ca", "Ngày báo cáo", "Thời gian", "% HV", "TT OK", "NG", "% năng suất", "% đạt", "% PP", "Trạng thái"].map(label => <th key={label} className={["% HV", "TT OK", "NG", "% năng suất", "% đạt", "% PP"].includes(label) ? "pending-full-metric" : ""}>{label}</th>)}
                            </tr></thead>
                            <tbody>
                                {loading ? <tr><td colSpan={14} className="management-empty" style={{ padding: 48, textAlign: "center" }}>Đang tải báo cáo...</td></tr> : error ? <tr><td colSpan={14} className="management-error" style={{ padding: 48, textAlign: "center", color: "#c24141" }}><div role="alert">{error}</div><button type="button" onClick={onRetry} disabled={loading} style={{ marginTop: 12, minHeight: 40, padding: "8px 16px", border: "1px solid #c24141", borderRadius: 8, background: "#fff", color: "#9f2828", fontWeight: 700, cursor: "pointer" }}>Thử tải lại</button></td></tr> : reports.length === 0 ? <tr><td colSpan={14} className="management-empty" style={{ padding: 48, textAlign: "center" }}>Không có báo cáo chờ duyệt.</td></tr> : reports.map((r, i) => {
                                    const x = kpi(r);
                                    const code = pendingReportCode(r, i);
                                    return <tr key={r.id ?? i} data-report-id={r.id} tabIndex={0} aria-selected={detail?.id === r.id} className={detail?.id === r.id ? "pending-row-active" : ""} onClick={() => onOpenRow(r)} onKeyDown={e => {
                                        if (e.target !== e.currentTarget) return;
                                        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenRow(r); }
                                    }} style={{ cursor: "pointer" }}>
                                        <td className="select-col"><input type="checkbox" aria-label={`Chọn báo cáo ${r.id}`} checked={selectedIds.includes(Number(r.id))} disabled={loading || approving || bulkApproving || rejecting} onChange={() => onToggleSelected(Number(r.id))} onClick={e => e.stopPropagation()} /></td>
                                        <td className="report-code">{pendingReportCode(r, i, (duplicateReportCodes.get(code) || 0) > 1)}</td>
                                        <td>{`${text(r.full_name || r.worker_name)} (${text(r.worker_code)})`}</td>
                                        <td>{processLabel(r)}</td>
                                        <td><span className="shift-chip">{text(r.shift)}</span></td>
                                        <td>{dateText(r.work_date)}</td>
                                        <td>{`${fmt(r.total_time || r.actual_time)} giờ`}</td>
                                        <td className="pending-full-metric">{pct(pendingTrainingPercent(r))}</td>
                                        <td className="pending-full-metric">{fmt(x.ok)}</td>
                                        <td className="pending-full-metric">{fmt(x.ng)}</td>
                                        <td className={`pending-full-metric ${x.nangSuat <= 75 || x.nangSuat > 100 ? "pending-full-productivity" : ""}`}>{x.standardMissing ? "Thiếu định mức" : pct(x.nangSuat)}</td>
                                        <td className="pending-full-metric">{pct(x.dat)}</td>
                                        <td className={`pending-full-metric ${x.pp === 0 || x.ngTypeCount === 1 ? "pending-full-pp" : ""}`}>{pct(x.pp)}</td>
                                        <td>Chờ duyệt</td>
                                    </tr>;
                                })}
                            </tbody>
                        </table>
                    </div>
    );
}
