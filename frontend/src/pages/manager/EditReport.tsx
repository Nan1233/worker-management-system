import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
    getDeductionOptionsByProcess,
    getDefectOptionsByProcess,
    getReportById,
    updateReport
} from "../../services/productionService";
import type {
    ProductionDeduction,
    ProductionDefect,
    ProductionReport
} from "../../types/production";
import { useToast } from "../../components/feedback/toastContext";
import "./EditReport.css";

const numberValue = (value: unknown) => Number(value ?? 0) || 0;

const mergeDefects = (
    options: ProductionDefect[],
    saved: ProductionDefect[]
): ProductionDefect[] => {
    const savedById = new Map(
        saved
            .filter((item) => Number(item.defect_type_id) > 0)
            .map((item) => [Number(item.defect_type_id), item])
    );
    const savedByName = new Map(
        saved.map((item) => [String(item.defect_name || "").trim().toLowerCase(), item])
    );

    const merged: ProductionDefect[] = options.map((option) => {
        const current = savedById.get(Number(option.id || option.defect_type_id))
            || savedByName.get(String(option.defect_name || "").trim().toLowerCase());
        return {
            ...option,
            defect_type_id: Number(option.defect_type_id || option.id),
            id: current?.id,
            quantity: numberValue(current?.quantity)
        };
    });

    for (const current of saved) {
        const exists = merged.some((item) =>
            Number(item.defect_type_id) === Number(current.defect_type_id)
            || String(item.defect_name || "").trim().toLowerCase()
                === String(current.defect_name || "").trim().toLowerCase()
        );
        if (!exists) merged.push({ ...current, quantity: numberValue(current.quantity) });
    }

    return merged;
};

const mergeDeductions = (
    options: ProductionDeduction[],
    saved: ProductionDeduction[]
): ProductionDeduction[] => {
    const savedById = new Map(
        saved
            .filter((item) => Number(item.deduction_type_id) > 0)
            .map((item) => [Number(item.deduction_type_id), item])
    );
    const savedByName = new Map(
        saved.map((item) => [String(item.deduction_name || "").trim().toLowerCase(), item])
    );

    const merged: ProductionDeduction[] = options.map((option) => {
        const current = savedById.get(Number(option.id || option.deduction_type_id))
            || savedByName.get(String(option.deduction_name || "").trim().toLowerCase());
        return {
            ...option,
            deduction_type_id: Number(option.deduction_type_id || option.id),
            id: current?.id,
            hours: numberValue(current?.hours)
        };
    });

    for (const current of saved) {
        const exists = merged.some((item) =>
            Number(item.deduction_type_id) === Number(current.deduction_type_id)
            || String(item.deduction_name || "").trim().toLowerCase()
                === String(current.deduction_name || "").trim().toLowerCase()
        );
        if (!exists) merged.push({ ...current, hours: numberValue(current.hours) });
    }

    return merged;
};

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
    const [actualHours, setActualHours] = useState("");
    const [actualMinutes, setActualMinutes] = useState("");
    const [changeReason, setChangeReason] = useState("");

    useEffect(() => {
        const load = async () => {
            if (!Number.isInteger(reportId) || reportId <= 0) {
                setError("Mã báo cáo không hợp lệ.");
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setError("");
                const data = await getReportById(reportId, source);
                const processId = Number(data.process_id);
                const [defectOptions, deductionOptions] = await Promise.all([
                    processId > 0 ? getDefectOptionsByProcess(processId) : Promise.resolve([]),
                    processId > 0 ? getDeductionOptionsByProcess(processId) : Promise.resolve([])
                ]);

                const savedActualTime = numberValue(data.actual_time);
                const savedHours = Math.floor(savedActualTime);
                const savedMinutes = Math.round((savedActualTime - savedHours) * 60);
                setActualHours(String(savedHours));
                setActualMinutes(String(savedMinutes));

                setForm({
                    ...data,
                    work_date: String(data.work_date || "").slice(0, 10),
                    defects: mergeDefects(defectOptions, data.defects || []),
                    deductions: mergeDeductions(deductionOptions, data.deductions || [])
                });
            } catch (err) {
                console.error("LOAD REPORT ERROR:", err);
                setError("Không thể tải báo cáo hoặc danh mục chi tiết để sửa.");
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, [reportId, source]);

    const defectTotal = useMemo(
        () => (form?.defects || []).reduce((sum, item) => sum + numberValue(item.quantity), 0),
        [form?.defects]
    );
    const deductionTotal = useMemo(
        () => (form?.deductions || []).reduce((sum, item) => sum + numberValue(item.hours), 0),
        [form?.deductions]
    );

    const setField = (field: keyof ProductionReport, value: string | number) => {
        setForm((current) => current ? { ...current, [field]: value } : current);
    };

    const updateDefect = (index: number, quantity: number) => {
        setForm((current) => {
            if (!current) return current;
            const defects = [...(current.defects || [])];
            defects[index] = { ...defects[index], quantity };
            const ttNg = defects.reduce((sum, item) => sum + numberValue(item.quantity), 0);
            return {
                ...current,
                defects,
                tt_ng: ttNg,
                actual_output: numberValue(current.tt_ok) + ttNg
            };
        });
    };

    const updateDeduction = (index: number, minutes: number) => {
        setForm((current) => {
            if (!current) return current;
            const deductions = [...(current.deductions || [])];
            deductions[index] = { ...deductions[index], hours: Math.max(0, minutes) / 60 };
            const deductionTime = deductions.reduce((sum, item) => sum + numberValue(item.hours), 0);
            const actualTime = Math.max(0, Number(actualHours) || 0) + Math.min(59, Math.max(0, Number(actualMinutes) || 0)) / 60;
            return {
                ...current,
                deductions,
                deduction_time: deductionTime,
                actual_time: actualTime,
                total_time: actualTime + deductionTime
            };
        });
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!form || saving) return;

        try {
            setSaving(true);
            setError("");

            if (source === "approved" && !changeReason.trim()) {
                setError("Vui lòng nhập lý do chỉnh sửa báo cáo đã duyệt.");
                return;
            }

            const payload: ProductionReport = {
                ...form,
                reason: source === "approved" ? changeReason.trim() : undefined,
                work_date: String(form.work_date).slice(0, 10),
                actual_time: Math.max(0, Number(actualHours) || 0) + Math.min(59, Math.max(0, Number(actualMinutes) || 0)) / 60,
                total_time: (Math.max(0, Number(actualHours) || 0) + Math.min(59, Math.max(0, Number(actualMinutes) || 0)) / 60) + deductionTotal,
                deduction_time: deductionTotal,
                tt_ng: defectTotal,
                actual_output: numberValue(form.tt_ok) + defectTotal,
                defects: (form.defects || []).map((item) => ({
                    defect_type_id: Number(item.defect_type_id || item.id),
                    defect_code: item.defect_code,
                    defect_name: item.defect_name,
                    quantity: numberValue(item.quantity)
                })),
                deductions: (form.deductions || []).map((item) => ({
                    deduction_type_id: Number(item.deduction_type_id || item.id),
                    deduction_code: item.deduction_code,
                    deduction_name: item.deduction_name,
                    hours: numberValue(item.hours)
                }))
            };

            await updateReport(reportId, payload, source);
            showToast("Cập nhật đầy đủ chi tiết báo cáo thành công", "success");
            navigate(-1);
        } catch (err: any) {
            console.error("UPDATE REPORT ERROR:", err);
            const apiErrors = err?.response?.data?.errors;
            const detail = apiErrors && typeof apiErrors === "object"
                ? Object.values(apiErrors).flat().join("; ")
                : "";
            setError(detail || err?.response?.data?.message || "Không thể cập nhật báo cáo.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <main className="edit-report-page"><div className="edit-report-card">Đang tải báo cáo...</div></main>;
    }
    if (!form) {
        return <main className="edit-report-page"><div className="edit-report-card edit-error">{error || "Không tìm thấy báo cáo."}</div></main>;
    }

    return (
        <main className="edit-report-page">
            <form className="edit-report-card" onSubmit={handleSave}>
                <header className="edit-report-header">
                    <div>
                        <button type="button" className="edit-back" onClick={() => navigate(-1)}>← Quay lại</button>
                        <h1>Sửa báo cáo {source === "pending" ? "chờ duyệt" : "đã duyệt"}</h1>
                        <p>{form.worker_code} - {form.full_name} · {form.process_name || form.process_code}</p>
                    </div>
                    <button className="edit-save" type="submit" disabled={saving}>
                        {saving ? "Đang lưu..." : "Lưu thay đổi"}
                    </button>
                </header>

                {error && <div className="edit-error">{error}</div>}

                <section className="edit-grid">
                    <label>Ngày làm việc<input type="date" value={form.work_date || ""} onChange={(e) => setField("work_date", e.target.value)} required /></label>
                    <label>Ca<select value={form.shift || ""} onChange={(e) => setField("shift", e.target.value)} required><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option></select></label>
                    <label>Mã máy<input value={form.machine_no || ""} onChange={(e) => setField("machine_no", e.target.value)} required /></label>
                    <label>Mã sản phẩm<input value={form.product_name || ""} onChange={(e) => setField("product_name", e.target.value)} required /></label>
                    <label>Giờ làm thực tế<input type="number" min="0" max="24" step="1" value={actualHours} onChange={(e) => { const value = e.target.value.replace(/\D/g, ""); if (value !== "" && Number(value) > 24) return; setActualHours(value); const actual = (Number(value) || 0) + (Number(actualMinutes) || 0) / 60; setForm({ ...form, actual_time: actual, total_time: actual + deductionTotal }); }} /></label>
                    <label>Phút làm thực tế<input type="number" min="0" max="59" step="1" value={actualMinutes} onChange={(e) => { const value = e.target.value.replace(/\D/g, ""); if (value !== "" && Number(value) > 59) return; setActualMinutes(value); const actual = (Number(actualHours) || 0) + (Number(value) || 0) / 60; setForm({ ...form, actual_time: actual, total_time: actual + deductionTotal }); }} /></label>
                    <label>Thời gian thực tế (giờ)<input type="number" value={numberValue(form.actual_time).toFixed(3)} readOnly /></label>
                    <label>Tổng thời gian trừ (giờ)<input type="number" value={deductionTotal.toFixed(3)} readOnly /></label>
                    <label>Tổng thời gian (giờ)<input type="number" value={(numberValue(form.actual_time) + deductionTotal).toFixed(3)} readOnly /></label>
                    <label>Định mức<input type="number" min="1" step="1" inputMode="numeric" value={Math.round(numberValue(form.standard_output))} onChange={(e) => setField("standard_output", Math.round(numberValue(e.target.value)))} /></label>
                    <label>TT OK<input type="number" min="0" step="1" value={numberValue(form.tt_ok)} onChange={(e) => { const ok = numberValue(e.target.value); setForm({ ...form, tt_ok: ok, actual_output: ok + defectTotal }); }} /></label>
                    <label>TT NG<input type="number" value={defectTotal} readOnly /></label>
                    <label>Thực tế<input type="number" value={numberValue(form.tt_ok) + defectTotal} readOnly /></label>
                </section>

                <section className="edit-detail-section">
                    <h2>Chi tiết thời gian trừ <span>{Math.round(deductionTotal * 60)} phút ({deductionTotal.toFixed(3)} giờ)</span></h2>
                    {(form.deductions || []).length === 0 ? (
                        <p className="edit-empty">Công đoạn này chưa có danh mục thời gian trừ.</p>
                    ) : (
                        <div className="edit-detail-grid">
                            {(form.deductions || []).map((item, index) => (
                                <label key={`${item.deduction_type_id || item.id || index}-${item.deduction_name}`}>
                                    {item.deduction_name || item.deduction_code || "Khấu trừ"}
                                    <input
                                        type="number"
                                        min="0"
                                        max="1440"
                                        step="1"
                                        value={Math.round(numberValue(item.hours) * 60)}
                                        onChange={(e) => updateDeduction(index, numberValue(e.target.value))}
                                    />
                                </label>
                            ))}
                        </div>
                    )}
                </section>

                <section className="edit-detail-section">
                    <h2>Chi tiết lỗi NG <span>{defectTotal}</span></h2>
                    {(form.defects || []).length === 0 ? (
                        <p className="edit-empty">Công đoạn này chưa có danh mục lỗi NG.</p>
                    ) : (
                        <div className="edit-detail-grid">
                            {(form.defects || []).map((item, index) => (
                                <label key={`${item.defect_type_id || item.id || index}-${item.defect_name}`}>
                                    {item.defect_name || item.defect_code || "Lỗi NG"}
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={numberValue(item.quantity)}
                                        onChange={(e) => updateDefect(index, numberValue(e.target.value))}
                                    />
                                </label>
                            ))}
                        </div>
                    )}
                </section>

                <label className="edit-note">Ghi chú<textarea rows={4} value={form.note || ""} onChange={(e) => setField("note", e.target.value)} /></label>
                {source === "approved" ? (
                    <label className="edit-note">Lý do chỉnh sửa <textarea rows={3} value={changeReason} onChange={(e) => setChangeReason(e.target.value)} placeholder="Bắt buộc để phục vụ audit và truy vết" required /></label>
                ) : null}
            </form>
        </main>
    );
}

export default EditReport;
