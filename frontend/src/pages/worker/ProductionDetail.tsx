import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getReportById, updateTempReport } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import { formatMinutes } from "../../utils/timeDisplay";

const number = (value?: number | string | null) =>
    new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Number(value) || 0);
const quantity = (value?: number | string | null) =>
    new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));
const hours = (value?: number | string | null) => `${number(value)} giờ`;
const toHours = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};
const WORKER_EDIT_WINDOW_MS = 10 * 60 * 1000;

export default function ProductionDetail() {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const source = searchParams.get("source");
    const navigate = useNavigate();
    const [report, setReport] = useState<ProductionReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [editingTime, setEditingTime] = useState(false);
    const [actualTimeInput, setActualTimeInput] = useState("");
    const [deductionTimeInput, setDeductionTimeInput] = useState("");
    const [savingTime, setSavingTime] = useState(false);
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                if (!id) return;
                const data = await getReportById(Number(id), source);
                if (active) setReport(data);
            } catch (err: any) {
                if (active) setError(err?.response?.data?.message || "Không thể tải chi tiết báo cáo.");
            } finally {
                if (active) setLoading(false);
            }
        };
        void load();
        return () => { active = false; };
    }, [id, source]);

    useEffect(() => {
        if (!report?.created_at) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [report?.created_at]);

    const defects = useMemo(() => (report?.defects || []).filter((item) => Number(item.quantity) > 0), [report]);
    const deductions = useMemo(() => (report?.deductions || []).filter((item) => Number(item.hours) > 0), [report]);

    if (loading) return <div className="detail-container"><div className="detail-state">Đang tải chi tiết...</div></div>;
    if (!report) return <div className="detail-container"><div className="detail-state error">{error || "Không tìm thấy báo cáo."}</div></div>;

    const statusLabel = report.status === "approved" ? "Đã duyệt" : report.status === "rejected" ? "Bị từ chối" : report.status === "need_fix" ? "Cần sửa" : "Chờ duyệt";
    const isPending = report.status === "pending" || report.status === "need_fix";
    const createdAtMs = report.created_at ? new Date(report.created_at).getTime() : NaN;
    const remainingMs = Number.isFinite(createdAtMs) ? Math.max(0, createdAtMs + WORKER_EDIT_WINDOW_MS - now) : 0;
    const canWorkerEditTime = isPending && remainingMs > 0;
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    const remainingMinutes = Math.floor(remainingSeconds / 60);
    const remainingSecondPart = remainingSeconds % 60;

    const startTimeEdit = () => {
        setActualTimeInput(String(Number(report.actual_time || 0)));
        setDeductionTimeInput(String(Number(report.deduction_time || 0)));
        setEditingTime(true);
    };

    const saveTimeEdit = async () => {
        if (!report.id || !canWorkerEditTime) return;
        const actualTime = toHours(actualTimeInput);
        const deductionTime = toHours(deductionTimeInput);
        const totalTime = actualTime + deductionTime;
        if (totalTime > 12.000001) {
            setError("Tổng thời gian không được vượt quá 12 giờ.");
            return;
        }
        try {
            setSavingTime(true);
            setError("");
            const result = await updateTempReport(Number(report.id), {
                ...report,
                actual_time: actualTime,
                deduction_time: deductionTime,
                total_time: totalTime,
                expected_updated_at: report.updated_at || undefined,
            } as ProductionReport);
            const next = result?.data || result;
            if (next && typeof next === "object") {
                setReport((current) => current ? { ...current, ...next } : current);
            } else {
                const refreshed = await getReportById(Number(report.id), source);
                setReport(refreshed);
            }
            setEditingTime(false);
        } catch (err: any) {
            setError(err?.response?.data?.message || "Không thể cập nhật thời gian báo cáo.");
        } finally {
            setSavingTime(false);
        }
    };

    return (
        <div className="ktc-page">
        <main className="detail-container">
            <header className="detail-header">
                <div><h1>Chi tiết báo cáo</h1><p>Kiểm tra đầy đủ sản lượng, thời gian và lỗi NG</p></div>
                <button className="back-btn" onClick={() => navigate(-1)}>← Quay lại</button>
            </header>

            <section className="detail-summary">
                <div><span>Trạng thái</span><strong className={`status ${report.status || "pending"}`}>{statusLabel}</strong></div>
                <div><span>Ngày sản xuất</span><strong>{new Date(report.work_date).toLocaleDateString("vi-VN")}</strong></div>
                <div><span>Ca</span><strong>{report.shift || "-"}</strong></div>
                <div><span>Công đoạn</span><strong>{report.process_name || report.process_code || "-"}</strong></div>
            </section>

            {canWorkerEditTime && !editingTime && (
                <section className="detail-section" style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <div>
                            <strong>Được sửa thời gian trong {remainingMinutes}:{String(remainingSecondPart).padStart(2, "0")}</strong>
                            <p style={{ margin: "4px 0 0" }}>Chỉ sửa thời gian của chính báo cáo này. Sản lượng và thông tin sản xuất không thay đổi.</p>
                        </div>
                        <button type="button" className="back-btn" onClick={startTimeEdit}>Sửa giờ</button>
                    </div>
                </section>
            )}

            {editingTime && canWorkerEditTime && (
                <section className="detail-section" style={{ marginBottom: 16 }}>
                    <h2>Sửa thời gian báo cáo</h2>
                    <div className="detail-grid">
                        <label><span>Thời gian thực tế (giờ)</span><input type="number" min="0" max="12" step="0.01" value={actualTimeInput} onChange={(e) => setActualTimeInput(e.target.value)} /></label>
                        <label><span>Thời gian trừ (giờ)</span><input type="number" min="0" max="12" step="0.01" value={deductionTimeInput} onChange={(e) => setDeductionTimeInput(e.target.value)} /></label>
                        <div><span>Tổng thời gian sau sửa</span><strong>{hours(toHours(actualTimeInput) + toHours(deductionTimeInput))}</strong></div>
                        <div><span>Thời gian còn lại</span><strong>{remainingMinutes}:{String(remainingSecondPart).padStart(2, "0")}</strong></div>
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                        <button type="button" className="back-btn" onClick={() => setEditingTime(false)} disabled={savingTime}>Hủy</button>
                        <button type="button" className="back-btn" onClick={saveTimeEdit} disabled={savingTime || !canWorkerEditTime}>{savingTime ? "Đang lưu..." : "Lưu giờ"}</button>
                    </div>
                </section>
            )}

            {!canWorkerEditTime && isPending && Number.isFinite(createdAtMs) && (
                <section className="detail-section" style={{ marginBottom: 16 }}>
                    <p style={{ margin: 0 }}>Đã hết 10 phút chỉnh sửa thời gian. Nếu cần sửa, vui lòng liên hệ quản lý.</p>
                </section>
            )}

            {error && <div className="history-error" style={{ marginBottom: 16 }}>{error}</div>}

            {report.status === "rejected" && report.review_note && (
                <section className="detail-rejection"><strong>Lý do từ chối</strong><p>{report.review_note}</p></section>
            )}

            <section className="detail-section">
                <h2>Thông tin báo cáo</h2>
                <div className="detail-grid">
                    <div><span>Người nhập</span><strong>{report.full_name || "-"}</strong></div>
                    <div><span>Mã công nhân</span><strong>{report.worker_code || "-"}</strong></div>
                    <div><span>Máy</span><strong>{report.machine_no || "-"}</strong></div>
                    <div><span>Sản phẩm</span><strong>{report.product_name || "-"}</strong></div>
                    <div><span>Thời gian nhập</span><strong>{report.created_at ? new Date(report.created_at).toLocaleString("vi-VN") : "-"}</strong></div>
                    <div><span>Cập nhật cuối</span><strong>{report.updated_at ? new Date(report.updated_at).toLocaleString("vi-VN") : "-"}</strong></div>
                </div>
            </section>

            <section className="detail-section">
                <h2>{report.machinePerformance?.machine_count ? "Năng suất máy và công nhân" : "Sản lượng"}</h2>
                {report.machinePerformance?.machine_count ? (
                    <>
                        <div className="metric-grid">
                            <div><span>Tổng tối đa của máy</span><strong>{quantity(report.machinePerformance.maximum_output)}</strong></div>
                            <div><span>Sản lượng tính năng suất</span><strong>{quantity(report.machinePerformance.counted_output)}</strong></div>
                            <div><span>Hiệu suất máy</span><strong>{number(report.machinePerformance.efficiency_percent)}%</strong></div>
                            <div><span>Năng suất công nhân</span><strong>{number(report.workerPerformance?.efficiency_percent)}%</strong></div>
                            <div className="ok"><span>Tổng OK</span><strong>{quantity(report.machinePerformance.total_ok)}</strong></div>
                            <div className="ng"><span>Tổng NG</span><strong>{quantity(report.machinePerformance.total_ng)}</strong></div>
                        </div>
                        <div className="detail-list">
                            {(report.machine_lines || []).map((line, index) => (
                                <div key={line.id || `${line.machine_code}-${index}`}>
                                    <span>{line.machine_code} · {line.product_code} · {number(line.machine_time_hours)} giờ · {line.standard_source === "MACHINE" ? "Định mức máy" : "Định mức mặc định"}</span>
                                    <strong>OK {quantity(line.ok_quantity)} · NG {quantity(line.ng_quantity)} · {number(line.machine_efficiency_percent)}%</strong>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="metric-grid">
                        <div><span>Định mức</span><strong>{number(report.standard_output)}</strong></div>
                        <div><span>Sản lượng thực tế</span><strong>{quantity(report.actual_output)}</strong></div>
                        <div className="ok"><span>OK</span><strong>{quantity(report.tt_ok)}</strong></div>
                        <div className="ng"><span>Tổng NG</span><strong>{quantity(report.tt_ng)}</strong></div>
                    </div>
                )}
            </section>

            <section className="detail-section time-section">
                <h2>Thời gian</h2>
                <div className="metric-grid">
                    <div><span>Thời gian làm việc</span><strong>{hours(report.total_time)}</strong></div>
                    <div><span>Tổng thời gian trừ</span><strong>{hours(report.deduction_time)}</strong></div>
                    <div><span>Thời gian thực tế</span><strong>{hours(report.actual_time)}</strong></div>
                </div>
                <div className="detail-list">
                    {deductions.length ? deductions.map((item, index) => (
                        <div key={item.id || `${item.deduction_type_id}-${index}`}><span>{item.deduction_name || item.deduction_code || "Thời gian trừ"}</span><strong>{formatMinutes(item.hours)}</strong></div>
                    )) : <p className="empty-row">Không có thời gian trừ</p>}
                </div>
            </section>

            <section className="detail-section">
                <h2>Chi tiết NG</h2>
                <div className="detail-list">
                    {defects.length ? defects.map((item, index) => (
                        <div key={item.id || `${item.defect_type_id}-${index}`}><span>{item.defect_name || item.defect_code || "Lỗi NG"}</span><strong>{quantity(item.quantity)}</strong></div>
                    )) : <p className="empty-row">Không có lỗi NG</p>}
                </div>
            </section>

            {report.note && <section className="detail-section"><h2>Ghi chú</h2><p className="detail-note">{report.note}</p></section>}
        </main>
        </div>
    );
}
