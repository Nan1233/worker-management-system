import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getReportById } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import { formatMinutes } from "../../utils/timeDisplay";

const EDIT_WINDOW_MS = 10 * 60 * 1000;
const fmt = (v: unknown) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Number(v) || 0);
const qty = (v: unknown) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.round(Number(v) || 0));
const time = (v: unknown) => `${fmt(v)} giờ`;

export default function ProductionDetail() {
    const { id } = useParams();
    const [params] = useSearchParams();
    const source = params.get("source");
    const navigate = useNavigate();
    const [report, setReport] = useState<ProductionReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const reportId = Number(id);
                if (!Number.isInteger(reportId) || reportId <= 0) throw new Error("ID báo cáo không hợp lệ.");
                const wanted = String(source || "").toLowerCase();
                const candidates: Array<"pending" | "approved"> = wanted === "approved" ? ["approved", "pending"] : ["pending", "approved"];
                let data: any = null;
                let last: any = null;
                for (const candidate of candidates) {
                    try {
                        data = await getReportById(reportId, candidate);
                        if (data) break;
                    } catch (e: any) {
                        last = e;
                        if (e?.response?.status !== 404) throw e;
                    }
                }
                if (!data) throw new Error(last?.response?.data?.message || "Không tìm thấy báo cáo.");
                if (active) setReport(data as ProductionReport);
            } catch (e: any) {
                if (active) setError(e?.response?.data?.message || e?.message || "Không thể tải chi tiết báo cáo.");
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [id, source]);

    useEffect(() => {
        if (!report?.created_at) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [report?.created_at]);

    const defects = useMemo(() => (report?.defects || []).filter((x) => Number(x.quantity) > 0), [report]);
    const deductions = useMemo(() => (report?.deductions || []).filter((x) => Number(x.hours) > 0), [report]);
    const machineLines: any[] = Array.isArray((report as any)?.machine_lines) ? (report as any).machine_lines : [];
    const machineMode = machineLines.length > 0 || String((report as any)?.operation_mode || "").toUpperCase() === "MACHINE";
    const createdMs = report?.created_at ? new Date(report.created_at).getTime() : NaN;
    const remainingMs = Number.isFinite(createdMs) ? Math.max(0, createdMs + EDIT_WINDOW_MS - now) : 0;
    const canEdit = ["pending", "need_fix"].includes(String(report?.status || "").toLowerCase()) && remainingMs > 0;
    const remainingSeconds = Math.ceil(remainingMs / 1000);

    if (loading) return <div className="detail-container"><div className="detail-state">Đang tải chi tiết...</div></div>;
    if (!report) return <div className="detail-container"><div className="detail-state error">{error || "Không tìm thấy báo cáo."}</div></div>;

    const statusLabel = report.status === "approved" ? "Đã duyệt" : report.status === "rejected" ? "Bị từ chối" : report.status === "need_fix" ? "Cần sửa" : "Chờ duyệt";

    return (
        <div className="ktc-page">
            <main className="detail-container">
                <header className="detail-header">
                    <div><h1>Chi tiết báo cáo</h1><p>Chế độ xem chi tiết — không chỉnh sửa trực tiếp tại trang này</p></div>
                    <div style={{ display: "flex", gap: 8 }}>
                        {canEdit && <button className="back-btn" type="button" onClick={() => navigate(`/worker/history/${report.id}/edit`)}>Sửa báo cáo · {Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, "0")}</button>}
                        <button className="back-btn" type="button" onClick={() => navigate(-1)}>← Quay lại</button>
                    </div>
                </header>

                <section className="detail-summary">
                    <div><span>Trạng thái</span><strong className={`status ${report.status || "pending"}`}>{statusLabel}</strong></div>
                    <div><span>Ngày sản xuất</span><strong>{report.work_date ? new Date(report.work_date).toLocaleDateString("vi-VN") : "-"}</strong></div>
                    <div><span>Ca</span><strong>{report.shift || "-"}</strong></div>
                    <div><span>Công đoạn</span><strong>{report.process_name || (report as any).process_code || "-"}</strong></div>
                </section>

                {!canEdit && ["pending", "need_fix"].includes(String(report.status || "").toLowerCase()) && <section className="detail-section"><strong>Đã hết thời gian chỉnh sửa.</strong><p style={{ marginBottom: 0 }}>Báo cáo chỉ được xem. Nếu cần thay đổi, liên hệ quản lý.</p></section>}
                {report.status === "rejected" && report.review_note && <section className="detail-rejection"><strong>Lý do từ chối</strong><p>{report.review_note}</p></section>}

                <section className="detail-section">
                    <h2>Thông tin báo cáo</h2>
                    <div className="detail-grid">
                        <div><span>Người nhập</span><strong>{(report as any).full_name || "-"}</strong></div>
                        <div><span>Mã công nhân</span><strong>{(report as any).worker_code || "-"}</strong></div>
                        <div><span>Máy</span><strong>{report.machine_no || "-"}</strong></div>
                        <div><span>Sản phẩm</span><strong>{report.product_name || "-"}</strong></div>
                        <div><span>Học việc</span><strong>{fmt((report as any).training_percent_snapshot ?? (report as any).training_percent ?? 100)}%</strong></div>
                        <div><span>Nhập lúc</span><strong>{report.created_at ? new Date(report.created_at).toLocaleString("vi-VN") : "-"}</strong></div>
                    </div>
                </section>

                <section className="detail-section">
                    <h2>{machineMode ? "Sản lượng & năng suất máy" : "Sản lượng"}</h2>
                    {machineMode ? (
                        <>
                            <div className="metric-grid">
                                <div><span>Tổng OK</span><strong>{qty(report.tt_ok)}</strong></div>
                                <div className="ng"><span>Tổng NG</span><strong>{qty(report.tt_ng)}</strong></div>
                                <div><span>Tổng sản lượng</span><strong>{qty((Number(report.tt_ok) || 0) + (Number(report.tt_ng) || 0))}</strong></div>
                                <div><span>Năng suất công nhân</span><strong>{fmt((report as any).workerPerformance?.efficiency_percent ?? (report as any).worker_performance_percent ?? 0)}%</strong></div>
                            </div>
                            <div className="detail-list">
                                {machineLines.map((line, index) => <div key={line.id || `${line.machine_code}-${index}`} style={{ display: "block" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span><strong>{line.machine_code || "-"}</strong> · {line.product_code || "-"} · {fmt(line.machine_time_hours)} giờ</span><strong>OK {qty(line.ok_quantity)} · NG {qty(line.ng_quantity)}</strong></div>{Array.isArray(line.defects) && line.defects.length > 0 && <div style={{ marginTop: 7, paddingLeft: 14, fontSize: 12 }}>{line.defects.filter((d: any) => Number(d.quantity) > 0).map((d: any, i: number) => <div key={d.id || `${d.defect_type_id}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span>{d.defect_code || ""} {d.defect_name || "Lỗi NG"}</span><strong>{qty(d.quantity)}</strong></div>)}</div>}</div>)}
                            </div>
                        </>
                    ) : <div className="metric-grid"><div><span>Định mức</span><strong>{fmt(report.standard_output)}</strong></div><div><span>Sản lượng thực tế</span><strong>{qty(report.actual_output)}</strong></div><div className="ok"><span>OK</span><strong>{qty(report.tt_ok)}</strong></div><div className="ng"><span>NG</span><strong>{qty(report.tt_ng)}</strong></div></div>}
                </section>

                <section className="detail-section">
                    <h2>Thời gian</h2>
                    <div className="metric-grid"><div><span>Thời gian thực tế</span><strong>{time(report.actual_time)}</strong></div><div><span>Thời gian trừ</span><strong>{time(report.deduction_time)}</strong></div><div><span>Tổng thời gian</span><strong>{time(report.total_time)}</strong></div></div>
                    <div className="detail-list">{deductions.length ? deductions.map((d, i) => <div key={d.id || `${d.deduction_type_id}-${i}`}><span>{d.deduction_name || d.deduction_code || "Thời gian trừ"}</span><strong>{formatMinutes(d.hours)}</strong></div>) : <p className="empty-row">Không có thời gian trừ</p>}</div>
                </section>

                <section className="detail-section">
                    <h2>Chi tiết NG của người</h2>
                    <div className="detail-list">{defects.length ? defects.map((d, i) => <div key={d.id || `${d.defect_type_id}-${i}`}><span>{d.defect_code || ""} {d.defect_name || "Lỗi NG"}</span><strong>{qty(d.quantity)}</strong></div>) : <p className="empty-row">Không có lỗi NG</p>}</div>
                </section>

                {report.note && <section className="detail-section"><h2>Ghi chú</h2><p className="detail-note">{report.note}</p></section>}
                {error && <div className="history-error">{error}</div>}
            </main>
        </div>
    );
}
