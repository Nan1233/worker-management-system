import { useCallback, useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import axios from "axios";
import {
    approveSelectedTempReports,
    createTempReport,
    deleteReport,
    getApprovedReports,
    getDefectOptionsByProcess,
    getDeductionOptionsByProcess,
    invalidateManagerReportCaches,
    updateReport,
} from "../../services/productionService";
import type { ProductionDefect, ProductionDeduction, ProductionReport } from "../../types/production";
import { useToast } from "../../components/feedback/toastContext";
import { usePermissions } from "../../hooks/usePermissions";
import { getToday } from "./managerReportDateLogic";
import "./Reports.css";
import "./ReportsSplitReference.css";

const n = (v: unknown) => Number(v || 0);
const fmt = (v: unknown) => n(v).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const txt = (v: unknown, fallback = "") => v === null || v === undefined ? fallback : String(v);
const dateText = (v: unknown) => { const s = String(v || "").slice(0, 10); if (!s) return ""; const [y, m, d] = s.split("-"); return y && m && d ? `${d}/${m}/${y}` : s; };
const rangeFor = (value: string, type: "year" | "month" | "week") => {
    const start = new Date(`${value}T00:00:00`); const end = new Date(start);
    if (type === "year") { start.setMonth(0, 1); end.setMonth(11, 31); }
    else if (type === "month") { start.setDate(1); end.setMonth(end.getMonth() + 1, 0); }
    else { const offset = (start.getDay() + 6) % 7; start.setDate(start.getDate() - offset); end.setTime(start.getTime()); end.setDate(start.getDate() + 6); }
    const s = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { dateFrom: s(start), dateTo: s(end) };
};

const cell: CSSProperties = { padding: "7px 9px", borderRight: "1px solid #dfe6ef", borderBottom: "1px solid #dfe6ef", whiteSpace: "nowrap", verticalAlign: "middle", fontSize: 13, height: 42 };
const input: CSSProperties = { width: "100%", minWidth: 70, boxSizing: "border-box", border: "1px solid transparent", borderRadius: 0, padding: "5px 6px", fontSize: 13, background: "transparent", outline: "none" };
const button: CSSProperties = { border: "1px solid #cbd7e6", borderRadius: 5, background: "#fff", padding: "7px 12px", fontSize: 13, cursor: "pointer", fontWeight: 600 };

const defectFields: Array<{ key: string; label: string }> = [
    { key: "kqd_dap_lai", label: "KQD đập lại" }, { key: "kqd_tuot", label: "KQD tuột" }, { key: "vo_do_long", label: "Vỡ" }, { key: "xuoc_do_long", label: "Xước" }, { key: "cong_gay", label: "Cọng gãy" },
    { key: "xoay", label: "Xoay" }, { key: "khong_dut", label: "Không đứt" }, { key: "bavia_hut", label: "Bavia hút" }, { key: "ppcm", label: "PPCM" }, { key: "loi_cao_su", label: "Lỗi cao su" }, { key: "ng_kich_thuoc", label: "NG kích thước" },
];

export default function ApprovedReports() {
    const { can } = usePermissions();
    const { showToast } = useToast();
    const canEdit = can("REPORT_APPROVED_EDIT");
    const [date, setDate] = useState(getToday());
    const [range, setRange] = useState<{ dateFrom: string; dateTo: string } | null>(null);
    const [search, setSearch] = useState("");
    const [process, setProcess] = useState("");
    const [shift, setShift] = useState("");
    const [reports, setReports] = useState<ProductionReport[]>([]);
    const [drafts, setDrafts] = useState<Record<number, ProductionReport>>({});
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [editing, setEditing] = useState(false);
    const [activeEditRow, setActiveEditRow] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [deductions, setDeductions] = useState<ProductionDeduction[]>([]);
    const [defects, setDefects] = useState<ProductionDefect[]>([]);

    const load = useCallback(async () => {
        try {
            setLoading(true); setError("");
            const r = range || { dateFrom: date, dateTo: date };
            const result = await getApprovedReports({ dateFrom: r.dateFrom, dateTo: r.dateTo, processName: process || undefined, shift: shift || undefined, search: search.trim() || undefined, page, pageSize: 20 });
            setReports(result.data || []); setTotal(result.pagination.total); setPages(result.pagination.total_pages);
            const processIds = Array.from(new Set((result.data || []).map(x => Number((x as any).process_id)).filter(Boolean)));
            const [ded, def] = await Promise.all([
                Promise.all(processIds.map(id => getDeductionOptionsByProcess(id).catch(() => [] as ProductionDeduction[]))),
                Promise.all(processIds.map(id => getDefectOptionsByProcess(id).catch(() => [] as ProductionDefect[]))),
            ]);
            setDeductions(ded.flat().filter((x, i, a) => a.findIndex(y => String(y.id || y.deduction_code || y.deduction_name) === String(x.id || x.deduction_code || x.deduction_name)) === i));
            setDefects(def.flat().filter((x, i, a) => a.findIndex(y => String(y.id || y.defect_code || y.defect_name) === String(x.id || x.defect_code || x.defect_name)) === i));
            setDrafts({}); setSelected(new Set());
        } catch (e: unknown) {
            setError(axios.isAxiosError(e) ? e.response?.data?.message || "Không thể tải báo cáo đã duyệt" : "Không thể tải báo cáo đã duyệt");
            setReports([]); setTotal(0); setPages(1);
        } finally { setLoading(false); }
    }, [date, range, process, shift, search, page]);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => { setPage(1); setEditing(false); setActiveEditRow(null); setDrafts({}); setSelected(new Set()); }, [date, range, process, shift, search]);

    const rows = useMemo(() => Object.keys(drafts).length ? reports.map(r => drafts[Number(r.id)] || r) : reports, [reports, drafts]);
    const processes = useMemo(() => Array.from(new Set(reports.map(r => r.process_name).filter(Boolean) as string[])).sort(), [reports]);
    const shifts = useMemo(() => Array.from(new Set(reports.map(r => r.shift).filter(Boolean))).sort(), [reports]);
    const allDeductionNames = useMemo(() => Array.from(new Set([...deductions.map(x => x.deduction_name), ...rows.flatMap((r: any) => (r.deductions || []).map((x: any) => x.deduction_name))].filter(Boolean))), [deductions, rows]);
    const allDefectNames = useMemo(() => Array.from(new Set([...defects.map(x => x.defect_name), ...rows.flatMap((r: any) => (r.defects || []).map((x: any) => x.defect_name))].filter(Boolean))), [defects, rows]);

    const valueFor = (r: any, name: string, kind: "deduction" | "defect") => {
        const list = kind === "deduction" ? r.deductions : r.defects;
        const found = Array.isArray(list) ? list.find((x: any) => x.deduction_name === name || x.defect_name === name) : null;
        return n(found?.[kind === "deduction" ? "hours" : "quantity"]);
    };
    const setDraft = (id: number, field: keyof ProductionReport, value: unknown) => setDrafts(cur => ({ ...cur, [id]: { ...cur[id], [field]: value } }));
    const setDetailValue = (id: number, kind: "deduction" | "defect", name: string, value: number) => setDrafts(cur => {
        const row: any = { ...(cur[id] as any) };
        const key = kind === "deduction" ? "deductions" : "defects";
        const valueKey = kind === "deduction" ? "hours" : "quantity";
        const nameKey = kind === "deduction" ? "deduction_name" : "defect_name";
        const list = Array.isArray(row[key]) ? [...row[key]] : [];
        const found = list.findIndex((x: any) => x[nameKey] === name);
        const item = found >= 0 ? { ...list[found] } : { [nameKey]: name, [valueKey]: 0 };
        item[valueKey] = value;
        if (found >= 0) list[found] = item; else list.push(item);
        row[key] = list;
        return { ...cur, [id]: row as ProductionReport };
    });
    const startEdit = () => { if (!canEdit) return; setDrafts(Object.fromEntries(reports.map(r => [Number(r.id), { ...r }]))); setActiveEditRow(null); setEditing(true); };
    const cancelEdit = () => { setDrafts({}); setActiveEditRow(null); setEditing(false); };
    const toggle = (id: number) => setSelected(cur => { const next = new Set(cur); next.has(id) ? next.delete(id) : next.add(id); return next; });
    const toggleAll = () => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map(r => Number(r.id)).filter(Boolean)));

    const handleEnter = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const currentCell = event.currentTarget.closest("td");
        const currentRow = currentCell?.parentElement;
        const nextRow = currentRow?.nextElementSibling as HTMLTableRowElement | null;
        if (!currentCell || !currentRow || !nextRow) return;
        const cellIndex = Array.from(currentRow.children).indexOf(currentCell);
        if (cellIndex < 0) return;
        const nextInput = nextRow.children[cellIndex]?.querySelector<HTMLInputElement>('input:not([type="checkbox"])');
        if (nextInput) nextInput.focus();
    };

    const save = async () => {
        if (!canEdit || saving) return;
        try {
            setSaving(true);
            for (const r of rows) {
                if (!r.id || Number(r.id) < 0) continue;
                const d = drafts[Number(r.id)]; if (!d) continue;
                const actual = Math.max(0, n(d.actual_time)); const deduction = Math.max(0, n(d.deduction_time)); const ok = Math.max(0, n(d.tt_ok)); const ng = Math.max(0, n(d.tt_ng));
                const next = { ...d, actual_time: actual, deduction_time: deduction, total_time: actual + deduction, tt_ok: ok, tt_ng: ng, actual_output: ok + ng } as ProductionReport;
                const result = await updateReport(Number(r.id), next, "approved", r.updated_at || null);
                const updated = (result?.data || result?.report || result) as ProductionReport;
                setReports(cur => cur.map(x => Number(x.id) === Number(r.id) ? ({ ...next, ...(updated || {}) }) : x));
            }
            invalidateManagerReportCaches(); setDrafts({}); setEditing(false); setActiveEditRow(null); showToast("Đã lưu toàn bộ thay đổi", "success");
        } catch (e: unknown) { showToast(axios.isAxiosError(e) ? e.response?.data?.message || "Không thể lưu thay đổi" : "Không thể lưu thay đổi"); }
        finally { setSaving(false); }
    };

    const add = () => {
        if (!canEdit) return;
        const base = rows[0] as any;
        if (!base) { showToast("Hãy chọn công đoạn/có ít nhất một báo cáo mẫu trước khi thêm"); return; }
        const tempId = -Date.now();
        const blank = { ...base, id: tempId, work_date: date, worker_code: "", full_name: "", shift: shift || base.shift || "", machine_no: "", product_name: "", actual_time: 0, deduction_time: 0, total_time: 0, standard_output: 0, actual_output: 0, tt_ok: 0, tt_ng: 0, note: "", process_id: Number(base.process_id) } as ProductionReport;
        setReports(cur => [blank, ...cur]); setDrafts(cur => ({ ...cur, [tempId]: blank })); setSelected(new Set([tempId])); setActiveEditRow(tempId); setEditing(true);
    };

    const remove = async () => {
        if (!canEdit || selected.size === 0) return;
        if (!window.confirm(`Xóa ${selected.size} báo cáo đã chọn?`)) return;
        try {
            setSaving(true);
            const ids = Array.from(selected).filter(id => id > 0);
            for (const id of ids) await deleteReport(id, "Quản lý xóa báo cáo đã duyệt");
            setReports(cur => cur.filter(r => !selected.has(Number(r.id)))); setSelected(new Set()); invalidateManagerReportCaches(); showToast("Đã xóa báo cáo", "success");
        } catch (e: unknown) { showToast(axios.isAxiosError(e) ? e.response?.data?.message || "Không thể xóa báo cáo" : "Không thể xóa báo cáo"); }
        finally { setSaving(false); }
    };

    const saveNew = async () => {
        const newRows = rows.filter(r => Number(r.id) < 0);
        if (!newRows.length) return save();
        try {
            setSaving(true);
            const createdIds: Array<{ id: number; expected_updated_at?: string | null }> = [];
            for (const r of newRows) {
                const d = drafts[Number(r.id)] as any;
                if (!d?.worker_id || !d?.process_id || !d?.work_date || !d?.shift || !d?.product_name) { showToast("Báo cáo mới cần công nhân, công đoạn, ngày, ca và sản phẩm"); return; }
                const result = await createTempReport({ ...d, id: undefined, total_time: n(d.actual_time) + n(d.deduction_time), actual_output: n(d.tt_ok) + n(d.tt_ng) } as ProductionReport);
                const id = Number(result?.data?.id || result?.id);
                if (id) createdIds.push({ id, expected_updated_at: result?.data?.updated_at || result?.updated_at || null });
            }
            if (createdIds.length) await approveSelectedTempReports(createdIds);
            invalidateManagerReportCaches(); await load(); setEditing(false); setDrafts({}); setActiveEditRow(null); showToast("Đã thêm báo cáo", "success");
        } catch (e: unknown) { showToast(axios.isAxiosError(e) ? e.response?.data?.message || "Không thể thêm báo cáo" : "Không thể thêm báo cáo"); }
        finally { setSaving(false); }
    };
    const saveAll = async () => { if (rows.some(r => Number(r.id) < 0)) await saveNew(); else await save(); };

    return <div className="management-report-page manager-page" style={{ minWidth: 0 }}>
        <header className="pending-page-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
            <div><h1>Quản lý báo cáo</h1><p>Chỉ báo cáo đã duyệt · bảng liền mạch như Excel · chọn dòng, Sửa, nhập trực tiếp, Tab chuyển ô.</p></div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {canEdit && <><button type="button" style={button} onClick={add}>＋ Thêm</button><button type="button" style={button} onClick={startEdit}>Sửa</button><button type="button" style={{ ...button, background: "#1769d2", color: "#fff", borderColor: "#1769d2" }} disabled={!editing || saving} onClick={() => void saveAll()}>{saving ? "Đang lưu..." : "Lưu"}</button><button type="button" style={button} disabled={!editing || saving} onClick={cancelEdit}>Hủy</button><button type="button" style={{ ...button, color: "#b42318" }} disabled={selected.size === 0 || saving} onClick={() => void remove()}>Xóa</button></>}
                <button type="button" style={button} onClick={() => void load()}>↻ Làm mới</button>
            </div>
        </header>

        <section className="pending-filter-card">
            <div className="pending-search"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Mã CN, họ tên, máy, sản phẩm..." /></div>
            <label><span>Ngày</span><input type="date" value={date} onChange={e => { setDate(e.target.value); setRange(null); }} /></label>
            <label><span>Công đoạn</span><select value={process} onChange={e => setProcess(e.target.value)}><option value="">Tất cả</option>{processes.map(p => <option key={p}>{p}</option>)}</select></label>
            <label><span>Ca</span><select value={shift} onChange={e => setShift(e.target.value)}><option value="">Tất cả</option>{shifts.map(s => <option key={s}>{s}</option>)}</select></label>
            <div className="pending-quick-filters"><span>Chọn nhanh</span><button type="button" className={!range ? "active" : ""} onClick={() => setRange(null)}>Hôm nay</button><button type="button" onClick={() => setRange(rangeFor(date, "week"))}>Tuần này</button><button type="button" onClick={() => setRange(rangeFor(date, "month"))}>Tháng này</button><button type="button" onClick={() => setRange(rangeFor(date, "year"))}>Năm này</button></div>
        </section>

        {error && <div className="management-error">{error}</div>}
        <section className="pending-list-card" style={{ width: "100%", overflow: "hidden" }}>
            <div className="pending-list-tabs" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><strong>{total} báo cáo đã duyệt</strong><span style={{ fontSize: 12, color: "#7185a4" }}>Chọn dòng · Sửa · Lưu · Xóa · Tab như Excel</span></div>
            <div className="pending-table-wrap" style={{ overflow: "auto", maxWidth: "100%", maxHeight: "calc(100vh - 330px)", border: "1px solid #dbe3ee", background: "#fff" }}>
                <table style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: 2600, width: "max-content" }}>
                    <thead style={{ position: "sticky", top: 0, zIndex: 4 }}><tr style={{ background: "#eef4fb" }}>
                        <th style={{ ...cell, position: "sticky", left: 0, zIndex: 5, background: "#eef4fb" }}><input type="checkbox" checked={rows.length > 0 && selected.size === rows.length} onChange={toggleAll} /></th>
                        <th style={cell}>Ngày</th><th style={cell}>Mã CN</th><th style={cell}>Họ tên</th><th style={cell}>Ca</th><th style={cell}>Máy</th><th style={cell}>Sản phẩm</th><th style={cell}>% HV</th><th style={cell}>TT giờ</th><th style={cell}>Trừ giờ</th>{allDeductionNames.map(x => <th key={`d-${x}`} style={cell}>{x}</th>)}<th style={cell}>Tổng giờ</th><th style={cell}>Định mức/h</th><th style={cell}>TT định mức</th><th style={cell}>TT OK</th><th style={cell}>NG</th><th style={cell}>% năng suất</th><th style={cell}>% đạt</th><th style={cell}>% PP</th>{allDefectNames.map(x => <th key={`n-${x}`} style={cell}>{x}</th>)}{defectFields.map(x => <th key={x.key} style={cell}>{x.label}</th>)}<th style={{ ...cell, minWidth: 220 }}>Ghi chú</th>
                    </tr></thead>
                    <tbody>{loading ? <tr><td colSpan={40} style={{ ...cell, textAlign: "center", padding: 30 }}>Đang tải...</td></tr> : rows.length === 0 ? <tr><td colSpan={40} style={{ ...cell, textAlign: "center", padding: 30 }}>Không có báo cáo đã duyệt.</td></tr> : rows.map((report, index) => {
                        const id = Number(report.id); const r: any = editing && drafts[id] ? drafts[id] : report; const ok = n(r.tt_ok); const ng = n(r.tt_ng); const output = n(r.actual_output) || ok + ng; const target = n(r.target_output) || n(r.standard_output) * n(r.actual_time); const productivity = target > 0 ? output / target * 100 : n(r.efficiency_percent); const achieved = output > 0 ? ok / output * 100 : 0; const pp = n(r.pp_percent ?? r.ppg_percent); const bg = index % 2 ? "#fbfdff" : "#fff"; const rowBg = activeEditRow === id ? "#eaf3ff" : bg;
                        const editText = (field: keyof ProductionReport, width = 110) => <input value={txt(r[field], "")} onFocus={() => setActiveEditRow(id)} onKeyDown={handleEnter} onChange={e => setDraft(id, field, e.target.value)} style={{ ...input, width }} />;
                        const editNum = (field: keyof ProductionReport, width = 78) => <input type="number" min="0" step="0.01" value={String(r[field] ?? 0)} onFocus={() => setActiveEditRow(id)} onKeyDown={handleEnter} onChange={e => setDraft(id, field, Number(e.target.value))} style={{ ...input, width }} />;
                        return <tr key={`${id}-${index}`} style={{ background: rowBg }} className={activeEditRow === id ? "excel-active-report-row" : undefined}>
                            <td style={{ ...cell, position: "sticky", left: 0, zIndex: 2, background: rowBg, textAlign: "center" }}><input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)} /></td>
                            <td style={cell}>{editing ? <input type="date" value={String(r.work_date || "").slice(0,10)} onFocus={() => setActiveEditRow(id)} onKeyDown={handleEnter} onChange={e => setDraft(id, "work_date", e.target.value)} style={{ ...input, width: 105 }} /> : dateText(r.work_date)}</td>
                            <td style={{ ...cell, fontWeight: 600 }}>{editing && id < 0 ? editText("worker_code", 72) : txt(r.worker_code, "---")}</td><td style={cell}>{editing && id < 0 ? editText("full_name", 145) : txt(r.full_name, "---")}</td>
                            <td style={cell}>{editing ? editText("shift", 52) : txt(r.shift, "---")}</td><td style={cell}>{editing ? editText("machine_no", 90) : txt(r.machine_no, "---")}</td><td style={{ ...cell, minWidth: 145 }}>{editing ? editText("product_name", 140) : txt(r.product_name, "---")}</td>
                            <td style={cell}>{fmt(r.training_percent)}%</td><td style={cell}>{editing ? editNum("actual_time", 70) : fmt(r.actual_time)}</td><td style={cell}>{editing ? editNum("deduction_time", 70) : fmt(r.deduction_time)}</td>
                            {allDeductionNames.map(name => <td key={`d-${name}`} style={cell}>{editing ? <input type="number" min="0" step="0.01" value={valueFor(r, name, "deduction")} onFocus={() => setActiveEditRow(id)} onKeyDown={handleEnter} onChange={e => setDetailValue(id, "deduction", name, Number(e.target.value))} style={{ ...input, width: 72 }} /> : fmt(valueFor(r, name, "deduction"))}</td>)}
                            <td style={{ ...cell, fontWeight: 700 }}>{fmt(n(r.actual_time) + n(r.deduction_time))}</td><td style={cell}>{fmt(r.standard_output)}</td><td style={cell}>{fmt(target)}</td><td style={cell}>{editing ? editNum("tt_ok", 78) : fmt(ok)}</td><td style={cell}>{editing ? editNum("tt_ng", 70) : fmt(ng)}</td><td style={{ ...cell, fontWeight: 700 }}>{fmt(productivity)}%</td><td style={{ ...cell, fontWeight: 700 }}>{fmt(achieved)}%</td><td style={cell}>{pp ? `${fmt(pp)}%` : "---"}</td>
                            {allDefectNames.map(name => <td key={`n-${name}`} style={cell}>{editing ? <input type="number" min="0" step="1" value={valueFor(r, name, "defect")} onFocus={() => setActiveEditRow(id)} onKeyDown={handleEnter} onChange={e => setDetailValue(id, "defect", name, Number(e.target.value))} style={{ ...input, width: 68 }} /> : fmt(valueFor(r, name, "defect"))}</td>)}
                            {defectFields.map(x => <td key={x.key} style={cell}>{fmt(r[x.key])}</td>)}
                            <td style={{ ...cell, minWidth: 220 }}>{editing ? editText("note", 210) : txt(r.note, "")}</td>
                        </tr>;
                    })}</tbody>
                </table>
            </div>
            <div className="pending-table-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span>Hiển thị {rows.length ? (page - 1) * 20 + 1 : 0} đến {(page - 1) * 20 + rows.length} của {total}</span><div className="management-pagination" style={{ margin: 0 }}><button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹</button><button className="active" disabled>{page} / {pages}</button><button disabled={page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))}>›</button></div></div>
        </section>
    </div>;
}
