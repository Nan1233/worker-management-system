import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getReportById, updateReport } from "../../services/productionService";
import type { ProductionDeduction, ProductionDefect, ProductionReport } from "../../types/production";
import { useToast } from "../../components/feedback/toastContext";
import "./EditReport.css";

const numberValue = (value: unknown) => Number(value ?? 0) || 0;

function EditReport() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { showToast } = useToast();
    const source = searchParams.get("source") === "pending" ? "pending" : "approved";
    const reportId = Number(id);

    const [form, setForm] = useState<ProductionReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const load = async () => {
            if (!Number.isInteger(reportId) || reportId <= 0) {
                setError("Mã báo cáo không hợp lệ.");
                setLoading(false);
                return;
            }
            try {
                setLoading(true);
                const data = await getReportById(reportId, source);
                setForm({
                    ...data,
                    work_date: String(data.work_date || "").slice(0, 10),
                    defects: data.defects || [],
                    deductions: data.deductions || []
                });
            } catch (err) {
                console.error("LOAD REPORT ERROR:", err);
                setError("Không thể tải báo cáo để sửa.");
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, [reportId, source]);

    const defectTotal = useMemo(() => (form?.defects || []).reduce((sum, item) => sum + numberValue(item.quantity), 0), [form?.defects]);
    const deductionTotal = useMemo(() => (form?.deductions || []).reduce((sum, item) => sum + numberValue(item.hours), 0), [form?.deductions]);

    const setField = (field: keyof ProductionReport, value: string | number) => {
        setForm((current) => current ? { ...current, [field]: value } : current);
    };

    const updateDefect = (index: number, quantity: number) => {
        setForm((current) => {
            if (!current) return current;
            const defects = [...(current.defects || [])];
            defects[index] = { ...defects[index], quantity };
            const ttNg = defects.reduce((sum, item) => sum + numberValue(item.quantity), 0);
            return { ...current, defects, tt_ng: ttNg, actual_output: numberValue(current.tt_ok) + ttNg };
        });
    };

    const updateDeduction = (index: number, hours: number) => {
        setForm((current) => {
            if (!current) return current;
            const deductions = [...(current.deductions || [])];
            deductions[index] = { ...deductions[index], hours };
            const deductionTime = deductions.reduce((sum, item) => sum + numberValue(item.hours), 0);
            return { ...current, deductions, deduction_time: deductionTime, actual_time: Math.max(0, numberValue(current.total_time) - deductionTime) };
        });
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!form || saving) return;
        try {
            setSaving(true);
            setError("");
            const payload = {
                ...form,
                work_date: String(form.work_date).slice(0, 10),
                actual_time: Math.max(0, numberValue(form.total_time) - deductionTotal),
                deduction_time: deductionTotal,
                tt_ng: defectTotal,
                actual_output: numberValue(form.tt_ok) + defectTotal,
                defects: (form.defects || []).map((item: ProductionDefect) => ({ ...item, quantity: numberValue(item.quantity) })),
                deductions: (form.deductions || []).map((item: ProductionDeduction) => ({ ...item, hours: numberValue(item.hours) }))
            };
            await updateReport(reportId, payload, source);
            showToast("Cập nhật báo cáo thành công", "success");
            navigate(-1);
        } catch (err: any) {
            console.error("UPDATE REPORT ERROR:", err);
            const apiErrors = err?.response?.data?.errors;
            const detail = apiErrors && typeof apiErrors === "object" ? Object.values(apiErrors).join("; ") : "";
            setError(detail || err?.response?.data?.message || "Không thể cập nhật báo cáo.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <main className="edit-report-page"><div className="edit-report-card">Đang tải báo cáo...</div></main>;
    if (!form) return <main className="edit-report-page"><div className="edit-report-card edit-error">{error || "Không tìm thấy báo cáo."}</div></main>;

    return (
        <main className="edit-report-page">
            <form className="edit-report-card" onSubmit={handleSave}>
                <header className="edit-report-header">
                    <div>
                        <button type="button" className="edit-back" onClick={() => navigate(-1)}>← Quay lại</button>
                        <h1>Sửa báo cáo {source === "pending" ? "chờ duyệt" : "đã duyệt"}</h1>
                        <p>{form.worker_code} - {form.full_name} · {form.process_name || form.process_code}</p>
                    </div>
                    <button className="edit-save" type="submit" disabled={saving}>{saving ? "Đang lưu..." : "Lưu thay đổi"}</button>
                </header>

                {error && <div className="edit-error">{error}</div>}

                <section className="edit-grid">
                    <label>Ngày làm việc<input type="date" value={form.work_date || ""} onChange={(e) => setField("work_date", e.target.value)} required /></label>
                    <label>Ca<select value={form.shift || ""} onChange={(e) => setField("shift", e.target.value)} required><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option></select></label>
                    <label>Mã máy<input value={form.machine_no || ""} onChange={(e) => setField("machine_no", e.target.value)} required /></label>
                    <label>Mã sản phẩm<input value={form.product_name || ""} onChange={(e) => setField("product_name", e.target.value)} required /></label>
                    <label>Tổng thời gian<input type="number" min="0" max="24" step="0.01" value={numberValue(form.total_time)} onChange={(e) => { const total = numberValue(e.target.value); setForm({ ...form, total_time: total, actual_time: Math.max(0, total - deductionTotal) }); }} /></label>
                    <label>Thời gian thực tế<input type="number" value={Math.max(0, numberValue(form.total_time) - deductionTotal)} readOnly /></label>
                    <label>Định mức<input type="number" min="0" step="0.01" value={numberValue(form.standard_output)} onChange={(e) => setField("standard_output", numberValue(e.target.value))} /></label>
                    <label>TT OK<input type="number" min="0" step="1" value={numberValue(form.tt_ok)} onChange={(e) => { const ok = numberValue(e.target.value); setForm({ ...form, tt_ok: ok, actual_output: ok + defectTotal }); }} /></label>
                    <label>TT NG<input type="number" value={defectTotal} readOnly /></label>
                    <label>Thực tế<input type="number" value={numberValue(form.tt_ok) + defectTotal} readOnly /></label>
                </section>

                <section className="edit-detail-section">
                    <h2>Chi tiết thời gian trừ <span>{deductionTotal} giờ</span></h2>
                    <div className="edit-detail-grid">
                        {(form.deductions || []).map((item, index) => <label key={item.id || item.deduction_type_id || index}>{item.deduction_name || "Khấu trừ"}<input type="number" min="0" max="24" step="0.01" value={numberValue(item.hours)} onChange={(e) => updateDeduction(index, numberValue(e.target.value))} /></label>)}
                    </div>
                </section>

                <section className="edit-detail-section">
                    <h2>Chi tiết lỗi NG <span>{defectTotal}</span></h2>
                    <div className="edit-detail-grid">
                        {(form.defects || []).map((item, index) => <label key={item.id || item.defect_type_id || index}>{item.defect_name || "Lỗi NG"}<input type="number" min="0" step="1" value={numberValue(item.quantity)} onChange={(e) => updateDefect(index, numberValue(e.target.value))} /></label>)}
                    </div>
                </section>

                <label className="edit-note">Ghi chú<textarea rows={4} value={form.note || ""} onChange={(e) => setField("note", e.target.value)} /></label>
            </form>
        </main>
    );
}

export default EditReport;
