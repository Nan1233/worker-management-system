import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
    getDeductionOptionsByProcess,
    getDefectOptionsByProcess,
    getReportById,
    updateReport,
} from "../../services/productionService";
import type { ProductionDeduction, ProductionDefect, ProductionReport } from "../../types/production";
import { useToast } from "../../components/feedback/toastContext";
import "./EditReport.css";

const n = (value: unknown) => {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
};

const fmt = (value: unknown) => n(value).toLocaleString("vi-VN", { maximumFractionDigits: 2 });

const normalizeDefects = (items: ProductionDefect[] = []) => items
    .filter((item) => n(item.quantity) > 0)
    .map((item) => ({ ...item, defect_type_id: Number(item.defect_type_id || item.id || 0), quantity: n(item.quantity) }));

const normalizeDeductions = (items: ProductionDeduction[] = []) => items
    .filter((item) => n(item.hours) > 0)
    .map((item) => ({ ...item, deduction_type_id: Number(item.deduction_type_id || item.id || 0), hours: n(item.hours) }));

function EditReport() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { showToast } = useToast();
    const source = searchParams.get("source") === "pending" ? "pending" : "approved";
    const reportId = Number(id);

    const [form, setForm] = useState<ProductionReport | null>(null);
    const [defectOptions, setDefectOptions] = useState<ProductionDefect[]>([]);
    const [deductionOptions, setDeductionOptions] = useState<ProductionDeduction[]>([]);
    const [actualHours, setActualHours] = useState("0");
    const [actualMinutes, setActualMinutes] = useState("0");
    const [changeReason, setChangeReason] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [loadedUpdatedAt, setLoadedUpdatedAt] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (!Number.isInteger(reportId) || reportId <= 0) {
                setError("ID báo cáo không hợp lệ.");
                setLoading(false);
                return;
            }
            try {
                setLoading(true);
                setError("");
                const data = await getReportById(reportId, source);
                if (cancelled) return;
                const processId = Number(data.process_id);
                const [defects, deductions] = await Promise.all([
                    processId > 0 ? getDefectOptionsByProcess(processId) : Promise.resolve([]),
                    processId > 0 ? getDeductionOptionsByProcess(processId) : Promise.resolve([]),
                ]);
                if (cancelled) return;

                const actual = n(data.actual_time);
                const totalMinutes = Math.max(0, Math.round(actual * 60));
                setActualHours(String(Math.floor(totalMinutes / 60)));
                setActualMinutes(String(totalMinutes % 60));
                setDefectOptions(defects);
                setDeductionOptions(deductions);
                setLoadedUpdatedAt(data.updated_at || null);
                setForm({
                    ...data,
                    work_date: String(data.work_date || "").slice(0, 10),
                    defects: Array.isArray(data.defects) ? data.defects : [],
                    deductions: Array.isArray(data.deductions) ? data.deductions : [],
                });
            } catch (err: any) {
                if (!cancelled) setError(err?.response?.data?.message || "Không thể tải báo cáo để sửa.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void load();
        return () => { cancelled = true; };
    }, [reportId, source]);

    const defectTotal = useMemo(() => (form?.defects || []).reduce((sum, item) => sum + n(item.quantity), 0), [form?.defects]);
    const deductionMinutes = useMemo(() => Math.round((form?.deductions || []).reduce((sum, item) => sum + n(item.hours), 0) * 60), [form?.deductions]);
    const actualTime = useMemo(() => Math.max(0, Number(actualHours) || 0) + Math.min(59, Math.max(0, Number(actualMinutes) || 0)) / 60, [actualHours, actualMinutes]);
    const totalTime = actualTime + deductionMinutes / 60;
    const actualOutput = n(form?.tt_ok) + defectTotal;
    const standardTarget = n(form?.standard_output) * actualTime;
    const productivity = standardTarget > 0 ? actualOutput / standardTarget * 100 : 0;
    const achieved = actualOutput > 0 ? n(form?.tt_ok) / actualOutput * 100 : 0;

    const usedDefects = useMemo(() => new Set((form?.defects || []).map((item) => Number(item.defect_type_id || item.id))), [form?.defects]);
    const usedDeductions = useMemo(() => new Set((form?.deductions || []).map((item) => Number(item.deduction_type_id || item.id))), [form?.deductions]);
    const availableDefects = defectOptions.filter((item) => !usedDefects.has(Number(item.defect_type_id || item.id)));
    const availableDeductions = deductionOptions.filter((item) => !usedDeductions.has(Number(item.deduction_type_id || item.id)));

    const setField = <K extends keyof ProductionReport>(field: K, value: ProductionReport[K]) => {
        setForm((current) => current ? { ...current, [field]: value } : current);
    };

    const setActualTime = (hours: string, minutes: string) => {
        const safeHours = Math.max(0, Math.min(24, Number(hours.replace(/\D/g, "")) || 0));
        const safeMinutes = Math.max(0, Math.min(59, Number(minutes.replace(/\D/g, "")) || 0));
        setActualHours(String(safeHours));
        setActualMinutes(String(safeMinutes));
    };

    const updateDefect = (index: number, quantity: number) => {
        setForm((current) => {
            if (!current) return current;
            const defects = [...(current.defects || [])];
            defects[index] = { ...defects[index], quantity: Math.max(0, quantity) };
            return { ...current, defects, tt_ng: defects.reduce((sum, item) => sum + n(item.quantity), 0) };
        });
    };

    const addDefect = (idValue: string) => {
        const id = Number(idValue);
        const option = defectOptions.find((item) => Number(item.defect_type_id || item.id) === id);
        if (!option) return;
        setForm((current) => current ? {
            ...current,
            defects: [...(current.defects || []), { ...option, defect_type_id: id, quantity: 0 }],
        } : current);
    };

    const removeDefect = (index: number) => {
        setForm((current) => current ? { ...current, defects: (current.defects || []).filter((_, i) => i !== index) } : current);
    };

    const updateDeduction = (index: number, minutes: number) => {
        setForm((current) => {
            if (!current) return current;
            const deductions = [...(current.deductions || [])];
            deductions[index] = { ...deductions[index], hours: Math.max(0, minutes) / 60 };
            return { ...current, deductions };
        });
    };

    const addDeduction = (idValue: string) => {
        const id = Number(idValue);
        const option = deductionOptions.find((item) => Number(item.deduction_type_id || item.id) === id);
        if (!option) return;
        setForm((current) => current ? {
            ...current,
            deductions: [...(current.deductions || []), { ...option, deduction_type_id: id, hours: 0 }],
        } : current);
    };

    const removeDeduction = (index: number) => {
        setForm((current) => current ? { ...current, deductions: (current.deductions || []).filter((_, i) => i !== index) } : current);
    };

    const save = async (event: FormEvent) => {
        event.preventDefault();
        if (!form || saving) return;
        if (source === "approved" && !changeReason.trim()) {
            setError("Báo cáo đã duyệt bắt buộc phải có lý do chỉnh sửa.");
            return;
        }
        try {
            setSaving(true);
            setError("");
            const payload: ProductionReport = {
                ...form,
                work_date: String(form.work_date || "").slice(0, 10),
                actual_time: actualTime,
                deduction_time: deductionMinutes / 60,
                total_time: totalTime,
                tt_ok: Math.max(0, n(form.tt_ok)),
                tt_ng: defectTotal,
                actual_output: actualOutput,
                defects: normalizeDefects(form.defects || []),
                deductions: normalizeDeductions(form.deductions || []),
                reason: source === "approved" ? changeReason.trim() : undefined,
                expected_updated_at: loadedUpdatedAt,
            };
            const result = await updateReport(reportId, payload, source, loadedUpdatedAt);
            const freshUpdatedAt = result?.data?.updated_at || result?.updated_at || loadedUpdatedAt;
            setLoadedUpdatedAt(freshUpdatedAt);
            showToast("Đã lưu đầy đủ lỗi NG và thời gian trừ.", "success");
            navigate(`${source === "pending" ? "/manager/reports" : "/manager/approved"}`, { replace: true });
        } catch (err: any) {
            const code = err?.response?.data?.code;
            if (code === "REPORT_VERSION_CONFLICT") {
                setError("Báo cáo đã thay đổi sau khi mở. Hãy tải lại báo cáo trước khi lưu.");
            } else {
                const apiErrors = err?.response?.data?.errors;
                const detail = apiErrors && typeof apiErrors === "object" ? Object.values(apiErrors).flat().join("; ") : "";
                setError(detail || err?.response?.data?.message || "Không thể lưu báo cáo.");
            }
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <main className="edit-report-page"><div className="edit-report-card">Đang tải báo cáo...</div></main>;
    if (!form) return <main className="edit-report-page"><div className="edit-report-card edit-error">{error || "Không tìm thấy báo cáo."}</div></main>;

    return (
        <main className="edit-report-page">
            <form className="edit-report-card edit-report-compact" onSubmit={save}>
                <header className="edit-report-header">
                    <div>
                        <button type="button" className="edit-back" onClick={() => navigate(-1)}>← Quay lại</button>
                        <h1>Sửa báo cáo · {source === "pending" ? "Chờ duyệt" : "Đã duyệt"}</h1>
                        <p><strong>{form.full_name || form.worker_name || form.worker_code || "—"}</strong> · {form.worker_code || "—"} · {form.process_name || form.process_code || "—"}</p>
                    </div>
                    <div className="edit-header-actions">
                        <span className={source === "approved" ? "edit-status approved" : "edit-status pending"}>{source === "approved" ? "Đã duyệt" : "Chờ duyệt"}</span>
                        <button className="edit-save" type="submit" disabled={saving}>{saving ? "Đang lưu..." : "Lưu thay đổi"}</button>
                    </div>
                </header>

                {error && <div className="edit-error">{error}</div>}

                <section className="edit-section">
                    <div className="edit-section-title"><h2>Thông tin báo cáo</h2><span>Giữ nguyên logic như form công nhân</span></div>
                    <div className="edit-form-grid">
                        <label>Ngày báo cáo<input type="date" value={form.work_date || ""} onChange={(e) => setField("work_date", e.target.value)} required /></label>
                        <label>Ca<select value={form.shift || "A"} onChange={(e) => setField("shift", e.target.value)}><option>A</option><option>B</option><option>C</option><option>D</option></select></label>
                        <label>Máy<input value={form.machine_no || ""} onChange={(e) => setField("machine_no", e.target.value)} /></label>
                        <label>Sản phẩm<input value={form.product_name || ""} onChange={(e) => setField("product_name", e.target.value)} /></label>
                        <label>% học việc<input type="number" min="0" max="100" step="0.01" value={n(form.training_percent ?? form.hv_percent ?? 100)} onChange={(e) => setField("training_percent", Math.max(0, Math.min(100, n(e.target.value))))} /></label>
                        <label>Định mức (SP/h)<input value={fmt(form.standard_output)} readOnly /></label>
                    </div>
                </section>

                <section className="edit-section">
                    <div className="edit-section-title"><h2>Thời gian làm việc</h2><strong>{fmt(totalTime)} giờ</strong></div>
                    <div className="edit-form-grid edit-time-grid">
                        <label>Giờ thực tế<input type="number" min="0" max="24" value={actualHours} onChange={(e) => setActualTime(e.target.value, actualMinutes)} /></label>
                        <label>Phút thực tế<input type="number" min="0" max="59" value={actualMinutes} onChange={(e) => setActualTime(actualHours, e.target.value)} /></label>
                        <div className="edit-readonly-metric"><span>Thời gian thực tế</span><strong>{fmt(actualTime)} giờ</strong></div>
                        <div className="edit-readonly-metric"><span>Thời gian trừ</span><strong>{deductionMinutes} phút</strong></div>
                    </div>
                </section>

                <section className="edit-section">
                    <div className="edit-section-title"><h2>Sản lượng & kiểm soát</h2><div className="edit-mini-kpis"><span>OK <b>{fmt(form.tt_ok)}</b></span><span>NG <b>{fmt(defectTotal)}</b></span><span>Tổng <b>{fmt(actualOutput)}</b></span><span>Năng suất <b>{fmt(productivity)}%</b></span><span>Đạt <b>{fmt(achieved)}%</b></span></div></div>
                    <div className="edit-form-grid">
                        <label>TT OK<input type="number" min="0" step="1" value={n(form.tt_ok)} onChange={(e) => setField("tt_ok", Math.max(0, n(e.target.value)))} /></label>
                        <div className={`edit-readonly-metric ${productivity <= 75 || productivity > 100 ? "metric-alert" : ""}`}><span>% năng suất</span><strong>{fmt(productivity)}%</strong></div>
                        <div className="edit-readonly-metric"><span>% đạt</span><strong>{fmt(achieved)}%</strong></div>
                    </div>
                </section>

                <section className="edit-section">
                    <div className="edit-section-title"><h2>Chi tiết lỗi NG</h2><strong>{defectTotal} lỗi</strong></div>
                    <div className="edit-item-list">
                        {(form.defects || []).map((item, index) => (
                            <div className="edit-item-row" key={`${item.defect_type_id || item.id || index}-${item.defect_name}`}>
                                <div><b>{item.defect_name || item.defect_code || `Lỗi ${index + 1}`}</b><small>{item.defect_code || ""}</small></div>
                                <input aria-label={`Số lượng ${item.defect_name}`} type="number" min="0" step="1" value={n(item.quantity)} onChange={(e) => updateDefect(index, n(e.target.value))} />
                                <button type="button" onClick={() => removeDefect(index)}>Bỏ</button>
                            </div>
                        ))}
                    </div>
                    <div className="edit-add-row">
                        <select value="" onChange={(e) => { addDefect(e.target.value); }}>
                            <option value="">+ Thêm lỗi NG</option>
                            {availableDefects.map((item) => <option key={Number(item.defect_type_id || item.id)} value={Number(item.defect_type_id || item.id)}>{item.defect_name || item.defect_code}</option>)}
                        </select>
                    </div>
                    {(form.defects || []).length === 0 && <div className="edit-empty">Chưa có lỗi NG. Có thể thêm trực tiếp tại đây.</div>}
                </section>

                <section className="edit-section">
                    <div className="edit-section-title"><h2>Thời gian trừ</h2><strong>{deductionMinutes} phút</strong></div>
                    <div className="edit-item-list">
                        {(form.deductions || []).map((item, index) => (
                            <div className="edit-item-row" key={`${item.deduction_type_id || item.id || index}-${item.deduction_name}`}>
                                <div><b>{item.deduction_name || item.deduction_code || `Khoản ${index + 1}`}</b><small>{item.deduction_code || ""}</small></div>
                                <input aria-label={`Số phút ${item.deduction_name}`} type="number" min="0" max="1440" step="1" value={Math.round(n(item.hours) * 60)} onChange={(e) => updateDeduction(index, n(e.target.value))} />
                                <button type="button" onClick={() => removeDeduction(index)}>Bỏ</button>
                            </div>
                        ))}
                    </div>
                    <div className="edit-add-row">
                        <select value="" onChange={(e) => { addDeduction(e.target.value); }}>
                            <option value="">+ Thêm thời gian trừ</option>
                            {availableDeductions.map((item) => <option key={Number(item.deduction_type_id || item.id)} value={Number(item.deduction_type_id || item.id)}>{item.deduction_name || item.deduction_code}</option>)}
                        </select>
                    </div>
                    {(form.deductions || []).length === 0 && <div className="edit-empty">Chưa có thời gian trừ. Có thể thêm trực tiếp tại đây.</div>}
                </section>

                <section className="edit-section edit-note-section">
                    <label>Ghi chú<textarea rows={2} value={form.note || ""} onChange={(e) => setField("note", e.target.value)} /></label>
                    {source === "approved" && <label>Lý do chỉnh sửa <textarea rows={2} value={changeReason} onChange={(e) => setChangeReason(e.target.value)} placeholder="Bắt buộc để lưu lịch sử chỉnh sửa" required /></label>}
                </section>

                <footer className="edit-footer"><button type="button" className="edit-cancel" onClick={() => navigate(-1)} disabled={saving}>Hủy</button><button type="submit" className="edit-save" disabled={saving}>{saving ? "Đang lưu..." : "Lưu thay đổi"}</button></footer>
            </form>
        </main>
    );
}

export default EditReport;
