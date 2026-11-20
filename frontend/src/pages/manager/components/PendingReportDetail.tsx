import type { ProductionReport } from "../../../types/production";
import { num, text, processLabel, fmt, pct, dateText, kpi, metricStyle } from "../managerReportsPresentation";

/** Detail presentation only; fetching, navigation and mutations live in Reports. */
type PendingReportDetailProps = {
    detail: ProductionReport | null;
    detailLoading: boolean;
    detailError: string;
    actionBusy: boolean;
    approving: boolean;
    rejecting: boolean;
    bulkApproving: boolean;
    rejectDialogOpen: boolean;
    loading: boolean;
    error: string;
    closeDetail: () => void;
    openDetail: (report: ProductionReport) => void;
    openRejectDialog: (ids: number[]) => void;
    approveDetail: () => void;
};

export default function PendingReportDetail(props: PendingReportDetailProps) {
    const {
        detail, detailLoading, detailError, actionBusy, approving, rejecting,
        bulkApproving, rejectDialogOpen, loading, error,
        closeDetail, openDetail, openRejectDialog, approveDetail
    } = props;
    if (!detail) return null;
    const detailKpi = kpi(detail);
    const detailAny = detail as ProductionReport & Record<string, unknown>;
    const detailDeductions = Array.isArray(detailAny.deductions) ? (detailAny.deductions as any[]).filter(x => num(x.hours) > 0) : [];
    const detailDefects = Array.isArray(detailAny.defects) ? (detailAny.defects as any[]).filter(x => num(x.quantity) > 0) : [];

    return (
<aside className="pending-detail-card pending-detail-card-compact" aria-label={`Chi tiết báo cáo #${detail.id}`}>
                    <div className="pending-detail-head">
                        <div className="pending-detail-title"><h2>Chi tiết báo cáo</h2><span className="pending-detail-status" style={{ background: "#fff0d8", color: "#a56a00" }}>Chờ duyệt</span><span className="pending-detail-code">#{detail.id}</span></div>
                        <button type="button" className="pending-detail-close" onClick={closeDetail} disabled={actionBusy} aria-label="Đóng">×</button>
                    </div>
                    {detailLoading ? <div className="pending-detail-loading" role="status">Đang tải chi tiết...</div> : detailError ? <div role="alert" className="pending-detail-loading" style={{ padding: 16, color: "#a32929" }}>{detailError}<button type="button" onClick={() => void openDetail(detail)} style={{ minHeight: 40, marginTop: 12, padding: "8px 12px", border: "1px solid #d99", borderRadius: 8, background: "#fff", color: "#a32929" }}>Thử tải lại</button></div> : detailKpi && <div className="pending-detail-body">
                        <section className="pending-detail-section"><h3>Thông tin chung</h3><div className="pending-detail-grid">
                            {[
                                ["Công nhân", `${text(detail.full_name || detail.worker_name)} (${text(detail.worker_code)})`],
                                ["Ngày báo cáo", dateText(detail.work_date)],
                                ["Công đoạn", processLabel(detail)],
                                ["Ca làm việc", text(detail.shift)],
                                ["Máy móc", text(detail.machine_no)],
                                ["Sản phẩm", text(detail.product_name)],
                                ["Thời gian", `${fmt(detail.total_time || detail.actual_time)} giờ`],
                                ["Học việc", pct(detailKpi.hv)]
                            ].map(([label, value]) => <div className="pending-detail-field" key={String(label)}><span>{label}</span><strong>{String(value)}</strong></div>)}
                        </div></section>
                        <section className="pending-detail-section"><h3>Kết quả sản xuất</h3><div className="pending-result-grid">
                            <div className="pending-result-item"><span>Sản lượng OK</span><strong>{fmt(detailKpi.ok)}</strong></div>
                            <div className="pending-result-item ng"><span>Sản lượng NG</span><strong>{fmt(detailKpi.ng)}</strong></div>
                            <div className="pending-result-item total"><span>Tổng sản lượng</span><strong>{fmt(detailKpi.actual)}</strong></div>
                            <div className="pending-result-item rate"><span>% đạt</span><strong>{pct(detailKpi.dat)}</strong></div>
                        </div></section>
                        <section className="pending-detail-section"><h3>Chỉ số KPI</h3><div className="pending-detail-info-grid">
                            <div className="pending-detail-field"><span>TT định mức</span><strong>{detailKpi.standardMissing ? "Thiếu định mức" : fmt(detailKpi.ttDinhMuc)}</strong></div>
                            <div className="pending-detail-field" style={metricStyle("productivity", detailKpi.nangSuat, detailKpi.ngTypeCount)}><span>% năng suất</span><strong>{detailKpi.standardMissing ? "Thiếu định mức" : pct(detailKpi.nangSuat)}</strong></div>
                            <div className="pending-detail-field"><span>% đạt</span><strong>{pct(detailKpi.dat)}</strong></div>
                            <div className="pending-detail-field" style={metricStyle("pp", detailKpi.pp, detailKpi.ngTypeCount)}><span>% PP (NG)</span><strong>{pct(detailKpi.pp)}{detailKpi.pp === 0 || detailKpi.ngTypeCount === 1 ? "" : ""}</strong></div>
                        </div></section>
                        <section className="pending-detail-section"><h3>Chi tiết thời gian trừ</h3>{detailDeductions.length ? <div className="pending-defect-list">{detailDeductions.map((x: any, i: number) => <span className="pending-defect" key={i}>{text(x.deduction_name, x.deduction_code)}: {fmt(num(x.hours) * 60)} phút</span>)}</div> : <div className="pending-history-empty">Không có thời gian trừ.</div>}</section>
                        <section className="pending-detail-section"><h3>Chi tiết lỗi NG</h3>{detailDefects.length ? <div className="pending-defect-list">{detailDefects.map((x: any, i: number) => <span className="pending-defect" key={i}>{text(x.defect_name, x.defect_code)}: {fmt(x.quantity)} sản phẩm</span>)}</div> : detailKpi.ng > 0 ? <div className="pending-history-empty" style={{ background: "#fff8e1", border: "1px solid #f0c36d", color: "#7a5b00" }}>NG {fmt(detailKpi.ng)} sản phẩm — chưa phân loại lỗi.</div> : <div className="pending-history-empty">Không có lỗi NG.</div>}</section>
                        <section className="pending-detail-section"><h3>Ghi chú</h3><div className="pending-detail-field"><span>Ghi chú</span><strong>{text(detail.note || (detail as any).notes, "Không có ghi chú")}</strong></div></section>
                    </div>}
                    <div className="pending-detail-actions pending-detail-actions-compact">
                        <button type="button" className="pending-detail-cancel" onClick={closeDetail} disabled={actionBusy}>Đóng</button>
                        <button type="button" onClick={() => openRejectDialog([Number(detail.id)])} disabled={rejecting || approving || bulkApproving || rejectDialogOpen || detailLoading || Boolean(detailError) || loading || Boolean(error)} style={{ border: "1px solid #dc5656", background: "#fff1f1", color: "#b42323", borderRadius: 8, padding: "9px 14px", fontWeight: 700, cursor: rejecting || detailLoading ? "not-allowed" : "pointer" }}>{rejecting ? "Đang từ chối..." : "Từ chối báo cáo"}</button>
                        <button type="button" className="pending-detail-approve" onClick={() => void approveDetail()} disabled={approving || rejectDialogOpen || detailLoading || Boolean(detailError) || bulkApproving || rejecting || loading || Boolean(error)}>{approving ? "Đang duyệt..." : "Duyệt báo cáo"}</button>
                    </div>
                </aside>
    );
}
