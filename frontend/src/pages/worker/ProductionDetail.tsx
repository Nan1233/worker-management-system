import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getReportById, updateTempReport } from "../../services/productionService";
import { getMachinesByProcess, getProductStandardsByProcess, type MachineOption, type ProductStandardOption } from "../../services/masterDataService";
import type { ProductionReport } from "../../types/production";
import { formatMinutes } from "../../utils/timeDisplay";

const number = (value?: number | string | null) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Number(value) || 0);
const quantity = (value?: number | string | null) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));
const hours = (value?: number | string | null) => `${number(value)} giờ`;
const toHours = (value: string) => { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0; };
const WORKER_EDIT_WINDOW_MS = 10 * 60 * 1000;

type EditMachineLine = NonNullable<ProductionReport["machine_lines"]>[number];

const normalizeMachineLine = (line?: Partial<EditMachineLine>): EditMachineLine => ({
    id: line?.id,
    machine_event_id: line?.machine_event_id ?? null,
    machine_id: line?.machine_id,
    machine_code: String(line?.machine_code || ""),
    product_code: String(line?.product_code || ""),
    machine_time_hours: Number(line?.machine_time_hours || 0),
    ok_quantity: Number(line?.ok_quantity || 0),
    ng_quantity: Number(line?.ng_quantity || 0),
    standard_time_seconds: line?.standard_time_seconds ?? null,
    standard_output: Number(line?.standard_output || 0),
    standard_source: line?.standard_source,
    exclude_kqd_from_tt: line?.exclude_kqd_from_tt,
    maximum_output: line?.maximum_output,
    counted_output: line?.counted_output,
    earned_standard_hours: line?.earned_standard_hours,
    machine_efficiency_percent: line?.machine_efficiency_percent,
    physical_output: line?.physical_output,
    defects: line?.defects || [],
});

export default function ProductionDetail() {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const source = searchParams.get("source");
    const navigate = useNavigate();
    const [report, setReport] = useState<ProductionReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [editing, setEditing] = useState(false);
    const [editLines, setEditLines] = useState<EditMachineLine[]>([]);
    const [actualTimeInput, setActualTimeInput] = useState("");
    const [deductionTimeInput, setDeductionTimeInput] = useState("");
    const [saving, setSaving] = useState(false);
    const [masterLoading, setMasterLoading] = useState(false);
    const [machines, setMachines] = useState<MachineOption[]>([]);
    const [products, setProducts] = useState<ProductStandardOption[]>([]);
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                if (!id) throw new Error("ID báo cáo không hợp lệ.");
                const reportId = Number(id);
                if (!Number.isInteger(reportId) || reportId <= 0) throw new Error("ID báo cáo không hợp lệ.");
                const normalizedSource = String(source || "").toLowerCase();
                const candidates: Array<"pending" | "approved"> = normalizedSource === "pending" || normalizedSource === "temp"
                    ? ["pending", "approved"] : normalizedSource === "approved" ? ["approved", "pending"] : ["pending", "approved"];
                let lastError: any = null;
                let data: ProductionReport | null = null;
                for (const candidate of candidates) {
                    try { data = await getReportById(reportId, candidate); if (data) break; }
                    catch (err: any) { lastError = err; if (err?.response?.status !== 404) throw err; }
                }
                if (!data) throw new Error(lastError?.response?.data?.message || "Không tìm thấy báo cáo.");
                if (active) setReport(data);
            } catch (err: any) {
                if (active) setError(err?.response?.data?.message || err?.message || "Không thể tải chi tiết báo cáo.");
            } finally { if (active) setLoading(false); }
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
    const canWorkerEdit = isPending && remainingMs > 0;
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    const remainingMinutes = Math.floor(remainingSeconds / 60);
    const remainingSecondPart = remainingSeconds % 60;

    const beginEdit = async () => {
        setError("");
        setActualTimeInput(String(Number(report.actual_time || 0)));
        setDeductionTimeInput(String(Number(report.deduction_time || 0)));
        setEditLines((report.machine_lines || []).map((line) => normalizeMachineLine(line)));
        setEditing(true);
        if (!report.process_id) return;
        try {
            setMasterLoading(true);
            const [machineRows, productRows] = await Promise.all([
                getMachinesByProcess(Number(report.process_id)),
                getProductStandardsByProcess(Number(report.process_id), report.process_code),
            ]);
            setMachines(machineRows);
            setProducts(productRows);
        } catch (err: any) {
            setError(err?.response?.data?.message || "Không tải được danh mục máy/sản phẩm.");
        } finally { setMasterLoading(false); }
    };

    const updateLine = (index: number, patch: Partial<EditMachineLine>) => {
        setEditLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line));
    };

    const addLine = () => {
        if (editLines.length >= 4) return;
        setEditLines((current) => [...current, normalizeMachineLine()]);
    };

    const removeLine = (index: number) => {
        setEditLines((current) => current.filter((_, i) => i !== index));
    };

    const productOptionsForMachine = (machineCode: string) => {
        const normalized = machineCode.trim().toUpperCase();
        if (!normalized) return products;
        const scoped = products.filter((item) => {
            const eligible = String(item.eligible_machine_codes || "").split(/[,;|]/).map((value) => value.trim().toUpperCase()).filter(Boolean);
            return !eligible.length || eligible.includes(normalized);
        });
        return scoped;
    };

    const saveEdit = async () => {
        if (!report.id || !canWorkerEdit) return;
        const actualTime = toHours(actualTimeInput);
        const deductionTime = toHours(deductionTimeInput);
        const totalTime = actualTime + deductionTime;
        if (totalTime > 12.000001) { setError("Tổng thời gian không được vượt quá 12 giờ."); return; }
        const machineMode = editLines.length > 0;
        if (machineMode && editLines.some((line) => !line.machine_code.trim() || !line.product_code.trim())) {
            setError("Mỗi máy phải có mã máy và mã sản phẩm."); return;
        }
        if (machineMode && editLines.some((line) => Number(line.machine_time_hours) <= 0)) {
            setError("Mỗi máy phải có thời gian chạy máy lớn hơn 0."); return;
        }
        try {
            setSaving(true); setError("");
            const totalOk = editLines.reduce((sum, line) => sum + Math.max(0, Math.trunc(Number(line.ok_quantity) || 0)), 0);
            const totalNg = editLines.reduce((sum, line) => sum + Math.max(0, Math.trunc(Number(line.ng_quantity) || 0)), 0);
            const payload: ProductionReport = {
                ...report,
                machine_no: machineMode ? editLines[0].machine_code : report.machine_no,
                product_name: machineMode ? editLines[0].product_code : report.product_name,
                operation_mode: machineMode ? "MACHINE" : (report.operation_mode || "MANUAL"),
                actual_time: actualTime,
                deduction_time: deductionTime,
                total_time: totalTime,
                tt_ok: machineMode ? totalOk : Number(report.tt_ok || 0),
                tt_ng: machineMode ? totalNg : Number(report.tt_ng || 0),
                actual_output: machineMode ? totalOk + totalNg : Number(report.actual_output || 0),
                machine_lines: machineMode ? editLines.map((line) => ({
                    id: line.id,
                    machine_event_id: line.machine_event_id ?? null,
                    machine_id: line.machine_id,
                    machine_code: line.machine_code.trim(),
                    product_code: line.product_code.trim(),
                    machine_time_hours: Number(line.machine_time_hours) || 0,
                    ok_quantity: Math.max(0, Math.trunc(Number(line.ok_quantity) || 0)),
                    ng_quantity: Math.max(0, Math.trunc(Number(line.ng_quantity) || 0)),
                    standard_time_seconds: line.standard_time_seconds ?? null,
                    standard_output: line.standard_output,
                    standard_source: line.standard_source,
                    exclude_kqd_from_tt: line.exclude_kqd_from_tt,
                    defects: line.defects || [],
                })) : [],
                expected_updated_at: report.updated_at || undefined,
            } as ProductionReport;
            const result = await updateTempReport(Number(report.id), payload);
            const next = result?.data || result;
            if (next && typeof next === "object" && (next.id || next.report || next.status)) {
                const refreshed = await getReportById(Number(report.id), "pending");
                setReport(refreshed);
            } else {
                setReport(await getReportById(Number(report.id), "pending"));
            }
            setEditing(false);
        } catch (err: any) {
            setError(err?.response?.data?.message || err?.response?.data?.errors?.machine_lines || "Không thể cập nhật báo cáo.");
        } finally { setSaving(false); }
    };

    return (
        <div className="ktc-page"><main className="detail-container">
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

            {canWorkerEdit && !editing && <section className="detail-section" style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div><strong>Được sửa báo cáo trong {remainingMinutes}:{String(remainingSecondPart).padStart(2, "0")}</strong><p style={{ margin: "4px 0 0" }}>Có thể sửa thời gian, sản lượng và thêm/sửa máy.</p></div>
                    <button type="button" className="back-btn" onClick={() => void beginEdit()}>Sửa báo cáo</button>
                </div>
            </section>}

            {editing && canWorkerEdit && <section className="detail-section" style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><h2 style={{ margin: 0 }}>Sửa báo cáo</h2><strong>{remainingMinutes}:{String(remainingSecondPart).padStart(2, "0")}</strong></div>
                {masterLoading && <p>Đang tải danh mục máy/sản phẩm...</p>}
                {editLines.length > 0 && <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                    {editLines.map((line, index) => {
                        const productOptions = productOptionsForMachine(line.machine_code);
                        return <div key={index} style={{ border: "1px solid #d9e2ef", borderRadius: 10, padding: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><strong>Máy {index + 1}</strong>{editLines.length > 1 && <button type="button" className="back-btn" onClick={() => removeLine(index)}>Xóa</button>}</div>
                            <div className="detail-grid">
                                <label><span>Mã máy</span><select value={line.machine_code} onChange={(e) => updateLine(index, { machine_code: e.target.value, product_code: "", machine_id: machines.find((m) => m.machine_code === e.target.value)?.id })}><option value="">Chọn máy</option>{machines.map((machine) => <option key={machine.id} value={machine.machine_code}>{machine.machine_code}</option>)}</select></label>
                                <label><span>Mã sản phẩm</span><select value={line.product_code} disabled={!line.machine_code} onChange={(e) => updateLine(index, { product_code: e.target.value })}><option value="">Chọn sản phẩm</option>{productOptions.map((product) => <option key={`${product.id}-${product.product_code}`} value={product.product_code}>{product.product_code}</option>)}</select></label>
                                <label><span>Giờ chạy máy</span><input type="number" min="0" step="1" value={Math.floor(Number(line.machine_time_hours) || 0)} onChange={(e) => { const hoursValue = Math.max(0, Number(e.target.value) || 0); updateLine(index, { machine_time_hours: hoursValue + (Number(line.machine_time_hours) % 1) }); }} /></label>
                                <label><span>Phút chạy máy</span><input type="number" min="0" max="59" step="1" value={Math.round(((Number(line.machine_time_hours) || 0) % 1) * 60)} onChange={(e) => { const mins = Math.min(59, Math.max(0, Number(e.target.value) || 0)); const h = Math.floor(Number(line.machine_time_hours) || 0); updateLine(index, { machine_time_hours: h + mins / 60 }); }} /></label>
                                <label><span>OK</span><input type="number" min="0" step="1" value={line.ok_quantity} onChange={(e) => updateLine(index, { ok_quantity: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} /></label>
                                <label><span>NG</span><input type="number" min="0" step="1" value={line.ng_quantity} onChange={(e) => updateLine(index, { ng_quantity: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} /></label>
                            </div>
                        </div>;
                    })}
                </div>}
                {editLines.length === 0 && <p style={{ marginTop: 12 }}>Báo cáo này đang ở chế độ tay.</p>}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                    {editLines.length > 0 && editLines.length < 4 && <button type="button" className="back-btn" onClick={addLine}>+ Thêm máy</button>}
                    {editLines.length === 0 && <button type="button" className="back-btn" onClick={addLine}>+ Chuyển sang làm máy</button>}
                    <button type="button" className="back-btn" onClick={() => setEditing(false)} disabled={saving}>Hủy</button>
                    <button type="button" className="back-btn" onClick={() => void saveEdit()} disabled={saving}>{saving ? "Đang lưu..." : "Lưu báo cáo"}</button>
                </div>
                {error && <div className="history-error" style={{ marginTop: 10 }}>{error}</div>}
            </section>}

            {!canWorkerEdit && isPending && <section className="detail-section" style={{ marginBottom: 16 }}><p style={{ margin: 0 }}>Đã hết 10 phút chỉnh sửa báo cáo. Nếu cần sửa, vui lòng liên hệ quản lý.</p></section>}
            {error && !editing && <div className="history-error" style={{ marginBottom: 16 }}>{error}</div>}

            {report.status === "rejected" && report.review_note && <section className="detail-rejection"><strong>Lý do từ chối</strong><p>{report.review_note}</p></section>}

            <section className="detail-section"><h2>Thông tin báo cáo</h2><div className="detail-grid">
                <div><span>Người nhập</span><strong>{report.full_name || "-"}</strong></div><div><span>Mã công nhân</span><strong>{report.worker_code || "-"}</strong></div><div><span>Máy</span><strong>{report.machine_no || "-"}</strong></div><div><span>Sản phẩm</span><strong>{report.product_name || "-"}</strong></div><div><span>Thời gian nhập</span><strong>{report.created_at ? new Date(report.created_at).toLocaleString("vi-VN") : "-"}</strong></div><div><span>Cập nhật cuối</span><strong>{report.updated_at ? new Date(report.updated_at).toLocaleString("vi-VN") : "-"}</strong></div>
            </div></section>

            <section className="detail-section"><h2>{report.machinePerformance?.machine_count ? "Năng suất máy và công nhân" : "Sản lượng"}</h2>
                {report.machinePerformance?.machine_count ? <><div className="metric-grid"><div><span>Tổng tối đa của máy</span><strong>{quantity(report.machinePerformance.maximum_output)}</strong></div><div><span>Sản lượng tính năng suất</span><strong>{quantity(report.machinePerformance.counted_output)}</strong></div><div><span>Hiệu suất máy</span><strong>{number(report.machinePerformance.efficiency_percent)}%</strong></div><div><span>Năng suất công nhân</span><strong>{number(report.workerPerformance?.efficiency_percent)}%</strong></div><div className="ok"><span>Tổng OK</span><strong>{quantity(report.machinePerformance.total_ok)}</strong></div><div className="ng"><span>Tổng NG</span><strong>{quantity(report.machinePerformance.total_ng)}</strong></div></div><div className="detail-list">{(report.machine_lines || []).map((line, index) => <div key={line.id || `${line.machine_code}-${index}`}><span>{line.machine_code} · {line.product_code} · {number(line.machine_time_hours)} giờ · {line.standard_source === "MACHINE" ? "Định mức máy" : "Định mức mặc định"}</span><strong>OK {quantity(line.ok_quantity)} · NG {quantity(line.ng_quantity)} · {number(line.machine_efficiency_percent)}%</strong></div>)}</div></> : <div className="metric-grid"><div><span>Định mức</span><strong>{number(report.standard_output)}</strong></div><div><span>Sản lượng thực tế</span><strong>{quantity(report.actual_output)}</strong></div><div className="ok"><span>OK</span><strong>{quantity(report.tt_ok)}</strong></div><div className="ng"><span>Tổng NG</span><strong>{quantity(report.tt_ng)}</strong></div></div>}
            </section>

            <section className="detail-section time-section"><h2>Thời gian</h2><div className="metric-grid"><div><span>Thời gian làm việc</span><strong>{hours(report.total_time)}</strong></div><div><span>Tổng thời gian trừ</span><strong>{hours(report.deduction_time)}</strong></div><div><span>Thời gian thực tế</span><strong>{hours(report.actual_time)}</strong></div></div><div className="detail-list">{deductions.length ? deductions.map((item, index) => <div key={item.id || `${item.deduction_type_id}-${index}`}><span>{item.deduction_name || item.deduction_code || "Thời gian trừ"}</span><strong>{formatMinutes(item.hours)}</strong></div>) : <p className="empty-row">Không có thời gian trừ</p>}</div></section>

            <section className="detail-section"><h2>Chi tiết NG</h2><div className="detail-list">{defects.length ? defects.map((item, index) => <div key={item.id || `${item.defect_type_id}-${index}`}><span>{item.defect_name || item.defect_code || "Lỗi NG"}</span><strong>{quantity(item.quantity)}</strong></div>) : <p className="empty-row">Không có lỗi NG</p>}</div></section>
            {report.note && <section className="detail-section"><h2>Ghi chú</h2><p className="detail-note">{report.note}</p></section>}
        </main></div>
    );
}