import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { approveSelectedTempReports, getDeductionOptionsByProcess, getDefectOptionsByProcess, getPendingReports, getTempReportDetail, rejectSelectedTempReports, updateReport } from "../../services/productionService";
import api from "../../services/api";
import type { ProductionDeduction, ProductionDefect, ProductionReport } from "../../types/production";
import { useToast } from "../../components/feedback/toastContext";
import { usePermissions } from "../../hooks/usePermissions";
import { getToday } from "./managerReportDateLogic";
import { getValidReportIds, reconcileSelectedReportIds, toggleCurrentPageIds, toggleReportId } from "./managerReportSelection";
import { getStoredUser } from "../../utils/authStorage";
import "./ReportsSplitReference.css";

const REJECT_REASONS = ["Báo cáo trùng", "Sai sản lượng", "Sai thời gian", "Sai máy hoặc sản phẩm", "Thiếu dữ liệu", "Lý do khác"];
const text = (v: unknown, fallback = "---") => v === undefined || v === null || v === "" ? fallback : String(v);
const num = (v: unknown) => Number(v || 0);
const number = (v: unknown) => num(v).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const qty = (v: unknown) => Math.round(num(v)).toLocaleString("vi-VN");
const minutesOf = (hours: unknown) => Math.round(num(hours) * 60);
const reportCode = (r: ProductionReport, index = 0) => `PR${String(r.work_date || "REPORT").slice(0, 10).replace(/-/g, "")}-${r.worker_code || String(r.id || index + 1).padStart(4, "0")}`;
const formatDate = (v?: string | null) => { if (!v) return "---"; const [y, m, d] = String(v).slice(0, 10).split("-"); return y && m && d ? `${d}/${m}/${y}` : String(v); };
const timeRange = (r: ProductionReport) => { const e = r.extra_data || {}; return e.start_time && e.end_time ? `${e.start_time} - ${e.end_time}` : "07:30 - 15:30"; };
const dateOf = (v: string) => new Date(`${v}T00:00:00`);
const dateString = (v: Date) => `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
const rangeFor = (value: string, type: "year" | "month" | "week" | "day") => { const start = dateOf(value); const end = new Date(start); if (type === "year") { start.setMonth(0, 1); end.setMonth(11, 31); } else if (type === "month") { start.setDate(1); end.setMonth(end.getMonth() + 1, 0); } else if (type === "week") { const offset = (start.getDay() + 6) % 7; start.setDate(start.getDate() - offset); end.setTime(start.getTime()); end.setDate(start.getDate() + 6); } return { dateFrom: dateString(start), dateTo: dateString(end) }; };

// Chỉ đưa các lỗi đã thực sự được chọn trong báo cáo vào form sửa.
// Các lỗi còn lại chỉ xuất hiện trong danh sách "+ Thêm loại lỗi NG".
const mergeDefects = (options: ProductionDefect[], saved: ProductionDefect[]) => saved
    .filter(item => num(item.quantity) > 0)
    .map(item => {
        const id = Number(item.defect_type_id || item.id);
        const option = options.find(candidate => Number(candidate.defect_type_id || candidate.id) === id || String(candidate.defect_name || "").trim().toLowerCase() === String(item.defect_name || "").trim().toLowerCase());
        return { ...(option || {}), ...item, defect_type_id: id, quantity: num(item.quantity) };
    });

// Chỉ đưa các khoản trừ đã thực sự được chọn trong báo cáo vào form sửa.
// Các khoản trừ còn lại chỉ xuất hiện trong danh sách "+ Thêm khoản thời gian trừ".
const mergeDeductions = (options: ProductionDeduction[], saved: ProductionDeduction[]) => saved
    .filter(item => num(item.hours) > 0)
    .map(item => {
        const id = Number(item.deduction_type_id || item.id);
        const option = options.find(candidate => Number(candidate.deduction_type_id || candidate.id) === id || String(candidate.deduction_name || "").trim().toLowerCase() === String(item.deduction_name || "").trim().toLowerCase());
        return { ...(option || {}), ...item, deduction_type_id: id, hours: num(item.hours) };
    });

export default function Reports() {
    const { can } = usePermissions();
    const { showToast } = useToast();
    const isLead = String(getStoredUser()?.role || "").toLowerCase() === "lead";
    const canReview = can("REPORT_APPROVE");
    const canDirectEdit = !isLead && can("REPORT_PENDING_EDIT");
    const [date, setDate] = useState(getToday());
    const [dateRange, setDateRange] = useState<{dateFrom:string;dateTo:string}|null>(null);
    const [searchKeyword, setSearchKeyword] = useState(""); const [searchQuery, setSearchQuery] = useState("");
    const [selectedProcess, setSelectedProcess] = useState(""); const [selectedShift, setSelectedShift] = useState("");
    const [reports, setReports] = useState<ProductionReport[]>([]); const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [selectedDetail, setSelectedDetail] = useState<ProductionReport|null>(null); const [editDraft, setEditDraft] = useState<ProductionReport|null>(null);
    const [editHours, setEditHours] = useState(""); const [editMinutes, setEditMinutes] = useState(""); const [editingDetail, setEditingDetail] = useState(false);
    const [defectOptions, setDefectOptions] = useState<ProductionDefect[]>([]); const [deductionOptions, setDeductionOptions] = useState<ProductionDeduction[]>([]);
    const [loading, setLoading] = useState(true); const [detailLoading, setDetailLoading] = useState(false); const [editSaving, setEditSaving] = useState(false); const [actionLoading, setActionLoading] = useState(false); const [error, setError] = useState("");
    const [rejectOpen, setRejectOpen] = useState(false); const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]); const [rejectDetail, setRejectDetail] = useState("");
    const [currentPage, setCurrentPage] = useState(1); const [totalCount, setTotalCount] = useState(0); const [totalPages, setTotalPages] = useState(1);
    const [dayCount, setDayCount] = useState(0); const [weekCount, setWeekCount] = useState(0); const [monthCount, setMonthCount] = useState(0); const [yearCount, setYearCount] = useState(0);
    const seq = useRef(0); const lock = useRef(false);

    useEffect(() => { const t = window.setTimeout(() => setSearchQuery(searchKeyword.trim()), 250); return () => window.clearTimeout(t); }, [searchKeyword]);
    const loadReports = useCallback(async () => {
        const request = ++seq.current;
        try {
            setLoading(true); setError("");
            const filters = { processName: selectedProcess || undefined, shift: selectedShift || undefined, search: searchQuery || undefined };
            const range = dateRange || { dateFrom: date, dateTo: date };
            const result = await getPendingReports({ ...range, ...filters, page: currentPage, pageSize: 8 });
            if (request !== seq.current) return;
            setReports(result.data || []); setTotalCount(result.pagination?.total || 0); setTotalPages(result.pagination?.total_pages || 1);
            const ranges = ["day","week","month","year"].map(type => rangeFor(date, type as any));
            const [day,week,month,year] = await Promise.all(ranges.map(r => getPendingReports({ ...r, ...filters, page: 1, pageSize: 1 })));
            if (request !== seq.current) return;
            setDayCount(day.pagination?.total || 0); setWeekCount(week.pagination?.total || 0); setMonthCount(month.pagination?.total || 0); setYearCount(year.pagination?.total || 0);
            setSelectedIds(prev => reconcileSelectedReportIds(prev, result.data || []));
        } catch (err: unknown) { if (request !== seq.current) return; setError(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể tải báo cáo chờ duyệt" : "Không thể tải báo cáo chờ duyệt"); setReports([]); setTotalCount(0); setTotalPages(1); }
        finally { if (request === seq.current) setLoading(false); }
    }, [date,dateRange,selectedProcess,selectedShift,searchQuery,currentPage]);
    useEffect(() => { void loadReports(); }, [loadReports]);
    useEffect(() => { setCurrentPage(1); setSelectedIds([]); setSelectedDetail(null); setEditDraft(null); setEditingDetail(false); }, [date,dateRange,selectedProcess,selectedShift,searchQuery]);

    const processes = useMemo(() => Array.from(new Set(reports.map(r=>r.process_name).filter(Boolean) as string[])).sort(), [reports]);
    const shifts = useMemo(() => Array.from(new Set(reports.map(r=>r.shift).filter(Boolean))).sort(), [reports]);
    const pageIds = useMemo(() => getValidReportIds(reports), [reports]); const selectedSet = useMemo(()=>new Set(selectedIds),[selectedIds]);
    const targets = useMemo(()=>reports.filter(r=>selectedSet.has(Number(r.id))).map(r=>({id:Number(r.id),expected_updated_at:r.updated_at||null})),[reports,selectedSet]);
    const allSelected = pageIds.length>0 && pageIds.every(id=>selectedSet.has(id)); const someSelected = pageIds.some(id=>selectedSet.has(id)) && !allSelected;

    const openDetail = async (report: ProductionReport) => {
        const id = Number(report.id);
        if (!id) return;
        setSelectedDetail(report);
        setEditDraft(null);
        setEditingDetail(false);
        setDetailLoading(true);
        try {
            const detail = await getTempReportDetail(id);
            setSelectedDetail(detail);
        } catch (err) {
            const status = axios.isAxiosError(err) ? err.response?.status : undefined;
            if (status === 404) {
                setReports(current => current.filter(item => Number(item.id) !== id));
                setSelectedIds(current => current.filter(selectedId => selectedId !== id));
                setSelectedDetail(null);
                setEditDraft(null);
                setEditingDetail(false);
                showToast("Báo cáo không còn trong danh sách chờ duyệt. Danh sách đã được cập nhật.");
                void loadReports();
            } else {
                showToast(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể tải chi tiết báo cáo" : "Không thể tải chi tiết báo cáo");
            }
        } finally {
            setDetailLoading(false);
        }
    };
    const prepareEditDraft = async (report: ProductionReport) => {
        const actual=num(report.actual_time); const h=Math.floor(actual); setEditHours(String(h)); setEditMinutes(String(Math.min(59,Math.round((actual-h)*60))));
        const processId=Number(report.process_id);
        try { const [defs,deds]=await Promise.all([processId>0?getDefectOptionsByProcess(processId):Promise.resolve([]),processId>0?getDeductionOptionsByProcess(processId):Promise.resolve([])]); setDefectOptions(defs); setDeductionOptions(deds); setEditDraft({...report,defects:mergeDefects(defs,report.defects||[]),deductions:mergeDeductions(deds,report.deductions||[])}); }
        catch(err){console.error("LOAD EDIT OPTIONS ERROR",err); setDefectOptions([]);setDeductionOptions([]);setEditDraft({...report,defects:[...(report.defects||[])],deductions:[...(report.deductions||[])]});}
    };
    const startEdit = async () => { if(!selectedDetail || (!canDirectEdit && !isLead))return; await prepareEditDraft(selectedDetail); setEditingDetail(true); };
    const cancelEdit=()=>{setEditDraft(null);setEditingDetail(false);};
    const updateField=(field:keyof ProductionReport,value:string|number)=>setEditDraft(cur=>cur?{...cur,[field]:value}:cur);
    const updateDefect=(index:number,value:number)=>setEditDraft(cur=>{if(!cur)return cur;const defects=[...(cur.defects||[])];if(!defects[index])return cur;defects[index]={...defects[index],quantity:Math.max(0,Math.trunc(value||0))};const ng=defects.reduce((s,i)=>s+num(i.quantity),0);return {...cur,defects,tt_ng:ng,actual_output:num(cur.tt_ok)+ng};});
    const updateDeduction=(index:number,value:number)=>setEditDraft(cur=>{if(!cur)return cur;const deductions=[...(cur.deductions||[])];if(!deductions[index])return cur;deductions[index]={...deductions[index],hours:Math.max(0,Math.min(1440,value||0))/60};const dt=deductions.reduce((s,i)=>s+num(i.hours),0);const at=Math.max(0,Number(editHours)||0)+Math.min(59,Math.max(0,Number(editMinutes)||0))/60;return {...cur,deductions,deduction_time:dt,actual_time:at,total_time:at+dt};});
    const removeDefect=(i:number)=>setEditDraft(cur=>{if(!cur)return cur;const defects=(cur.defects||[]).filter((_,n)=>n!==i);const ng=defects.reduce((s,x)=>s+num(x.quantity),0);return {...cur,defects,tt_ng:ng,actual_output:num(cur.tt_ok)+ng};});
    const removeDeduction=(i:number)=>setEditDraft(cur=>{if(!cur)return cur;const deductions=(cur.deductions||[]).filter((_,n)=>n!==i);const dt=deductions.reduce((s,x)=>s+num(x.hours),0);const at=Math.max(0,Number(editHours)||0)+Math.min(59,Math.max(0,Number(editMinutes)||0))/60;return {...cur,deductions,deduction_time:dt,total_time:at+dt};});
    const addDefect=(id:number)=>setEditDraft(cur=>{if(!cur||!id)return cur;const o=defectOptions.find(x=>Number(x.defect_type_id||x.id)===id);if(!o||(cur.defects||[]).some(x=>Number(x.defect_type_id||x.id)===id))return cur;return {...cur,defects:[...(cur.defects||[]),{...o,defect_type_id:id,quantity:0}]};});
    const addDeduction=(id:number)=>setEditDraft(cur=>{if(!cur||!id)return cur;const o=deductionOptions.find(x=>Number(x.deduction_type_id||x.id)===id);if(!o||(cur.deductions||[]).some(x=>Number(x.deduction_type_id||x.id)===id))return cur;return {...cur,deductions:[...(cur.deductions||[]),{...o,deduction_type_id:id,hours:0}]};});

    const buildPayload=()=>{if(!editDraft)return null;const actual=Math.max(0,Number(editHours)||0)+Math.min(59,Math.max(0,Number(editMinutes)||0))/60;const defects=(editDraft.defects||[]).filter(x=>num(x.quantity)>0).map(x=>({defect_type_id:Number(x.defect_type_id||x.id),defect_code:x.defect_code,defect_name:x.defect_name,quantity:num(x.quantity)}));const deductions=(editDraft.deductions||[]).filter(x=>num(x.hours)>0).map(x=>({deduction_type_id:Number(x.deduction_type_id||x.id),deduction_code:x.deduction_code,deduction_name:x.deduction_name,hours:num(x.hours)}));const dt=deductions.reduce((s,x)=>s+x.hours,0);const ng=defects.reduce((s,x)=>s+x.quantity,0);const ok=num(editDraft.tt_ok);return {...editDraft,work_date:String(editDraft.work_date||"").slice(0,10),actual_time:actual,deduction_time:dt,total_time:actual+dt,tt_ok:ok,tt_ng:ng,actual_output:ok+ng,defects,deductions};};
    const approveTargets=async(ids:number[],items:{id:number;expected_updated_at:string|null}[])=>{if(lock.current||actionLoading||!ids.length||!canReview)return;if(!window.confirm(`Duyệt ${ids.length} báo cáo đã chọn?`))return;lock.current=true;setActionLoading(true);try{await approveSelectedTempReports(items);showToast(`Đã duyệt ${ids.length} báo cáo`,"success");setSelectedIds(p=>p.filter(id=>!ids.includes(id)));if(selectedDetail&&ids.includes(Number(selectedDetail.id)))setSelectedDetail(null);await loadReports();}catch(err){showToast(axios.isAxiosError(err)?err.response?.data?.message||"Duyệt báo cáo thất bại":"Duyệt báo cáo thất bại");}finally{lock.current=false;setActionLoading(false);}};
    const saveEdit=async(approveAfterSave=false)=>{if(!editDraft?.id||editSaving)return;const payload=buildPayload();if(!payload)return;try{setEditSaving(true);let result;if(isLead){result=await api.put(`/production-temp/${Number(editDraft.id)}`,{...payload,reason:String(payload.note||"").trim()||"Tổ trưởng đề xuất sửa báo cáo"});}else{result=await updateReport(Number(editDraft.id),payload,"pending");}const updated=result?.data?.data||result?.data?.report||result?.data||result;const merged={...payload,...(updated&&typeof updated==="object"?updated:{})} as ProductionReport;setSelectedDetail(merged);setReports(cur=>cur.map(x=>Number(x.id)===Number(merged.id)?{...x,...merged}:x));setEditDraft(null);setEditingDetail(false);showToast(approveAfterSave?"Đã sửa báo cáo và chuyển sang đã duyệt":isLead?"Đã đề xuất sửa báo cáo, báo cáo vẫn chờ duyệt":"Đã cập nhật báo cáo","success");if(approveAfterSave)await approveTargets([Number(merged.id)],[{id:Number(merged.id),expected_updated_at:merged.updated_at||null}]);else await loadReports();}catch(err){showToast(axios.isAxiosError(err)?err.response?.data?.message||"Không thể lưu báo cáo":"Không thể lưu báo cáo");}finally{setEditSaving(false);}};
    const rejectSelected=async()=>{if(lock.current||actionLoading||!selectedIds.length||!canReview)return;const reason=rejectReason==="Lý do khác"?rejectDetail.trim():[rejectReason,rejectDetail.trim()].filter(Boolean).join(": ");if(!reason)return showToast("Vui lòng nhập lý do từ chối");lock.current=true;setActionLoading(true);try{await rejectSelectedTempReports(targets,reason);showToast(`Đã từ chối ${selectedIds.length} báo cáo`,"success");setRejectOpen(false);setRejectDetail("");setSelectedIds([]);setSelectedDetail(null);await loadReports();}catch(err){showToast(axios.isAxiosError(err)?err.response?.data?.message||"Từ chối báo cáo thất bại":"Từ chối báo cáo thất bại");}finally{lock.current=false;setActionLoading(false);}};

    const detail=editingDetail&&editDraft?editDraft:selectedDetail; const detailTotal=num(detail?.actual_output); const detailOk=num(detail?.tt_ok); const detailNg=num(detail?.tt_ng); const detailRate=detailTotal?detailOk/detailTotal*100:0;
    const rangeActive=(type:any)=>{const r=rangeFor(date,type);const c=dateRange||{dateFrom:date,dateTo:date};return c.dateFrom===r.dateFrom&&c.dateTo===r.dateTo;};
    const selectRange=(type:any)=>type==="day"?(setDate(getToday()),setDateRange(null)):setDateRange(rangeFor(date,type));
    const availableDefs=defectOptions.filter(o=>!(editDraft?.defects||[]).some(x=>Number(x.defect_type_id||x.id)===Number(o.defect_type_id||o.id)));
    const availableDeds=deductionOptions.filter(o=>!(editDraft?.deductions||[]).some(x=>Number(x.deduction_type_id||x.id)===Number(o.deduction_type_id||o.id)));

    return <div className="management-report-page manager-page pending-reference-page">
        <header className="pending-page-title"><div><h1>Chờ duyệt báo cáo</h1><p>Xem chi tiết và duyệt các báo cáo sản xuất từ công nhân.</p></div></header>
        <section className="pending-filter-card"><div className="pending-search"><span>⌕</span><input value={searchKeyword} onChange={e=>setSearchKeyword(e.target.value)} placeholder="Tìm kiếm mã báo cáo, công nhân..."/></div><label><span>Ngày báo cáo</span><input type="date" value={date} onChange={e=>{setDate(e.target.value);setDateRange(null)}}/></label><div className="pending-quick-filters"><span>Chọn nhanh</span>{["day","week","month","year"].map((x)=><button key={x} type="button" className={rangeActive(x)?"active":""} onClick={()=>selectRange(x)}>{x==="day"?"Hôm nay":x==="week"?"Tuần này":x==="month"?"Tháng này":"Năm này"}</button>)}</div><label><span>Công đoạn</span><select value={selectedProcess} onChange={e=>setSelectedProcess(e.target.value)}><option value="">Tất cả</option>{processes.map(p=><option key={p}>{p}</option>)}</select></label><label><span>Ca làm việc</span><select value={selectedShift} onChange={e=>setSelectedShift(e.target.value)}><option value="">Tất cả</option>{shifts.map(s=><option key={s}>{s}</option>)}</select></label><button className="pending-refresh" type="button" onClick={()=>void loadReports()}>⟳ <span>Làm mới</span></button></section>
        <section className="pending-kpis"><div role="button" tabIndex={0} className={`pending-kpi kpi-orange ${rangeActive("day")?"is-active":""}`} onClick={()=>selectRange("day")}><span>Hôm nay</span><strong>{dayCount}</strong><small>Báo cáo chờ duyệt · Bấm để xem</small></div><div role="button" tabIndex={0} className={`pending-kpi kpi-slate ${rangeActive("week")?"is-active":""}`} onClick={()=>selectRange("week")}><span>Tuần này</span><strong>{weekCount}</strong><small>Báo cáo chờ duyệt · Bấm để xem</small></div><div role="button" tabIndex={0} className={`pending-kpi kpi-green ${rangeActive("month")?"is-active":""}`} onClick={()=>selectRange("month")}><span>Tháng này</span><strong>{monthCount}</strong><small>Báo cáo chờ duyệt · Bấm để xem</small></div><div role="button" tabIndex={0} className={`pending-kpi kpi-blue ${rangeActive("year")?"is-active":""}`} onClick={()=>selectRange("year")}><span>Năm này</span><strong>{yearCount}</strong><small>Báo cáo chờ duyệt · Bấm để xem</small></div></section>
        {error&&<div className="management-error">{error}</div>}
        <section className={`pending-workspace ${selectedDetail?"detail-open":"list-only"}`}>
            <div className="pending-list-card"><div className="pending-list-tabs"><button type="button" className="pending-list-tab active">Danh sách báo cáo ({totalCount})</button></div>
            {selectedIds.length>0&&<div className="management-selected-info"><strong>Đã chọn {selectedIds.length} báo cáo.</strong><div className="management-selected-actions"><button type="button" onClick={()=>setSelectedIds([])}>Bỏ chọn</button>{canReview&&<><button type="button" className="selected-reject-action" onClick={()=>setRejectOpen(true)} disabled={actionLoading}>Từ chối</button><button type="button" className="selected-approve-action" onClick={()=>void approveTargets(selectedIds,targets)} disabled={actionLoading}>Duyệt</button></>}</div></div>}
            {loading?<div className="management-empty">Đang tải...</div>:!reports.length?<div className="pending-overdue-empty">Không có báo cáo phù hợp</div>:<div className="pending-table-wrap"><table className="pending-reference-table"><thead><tr><th className="select-col"><input type="checkbox" checked={allSelected} ref={e=>{if(e)e.indeterminate=someSelected}} onChange={()=>setSelectedIds(p=>toggleCurrentPageIds(p,pageIds,allSelected))}/></th><th>STT</th><th>Mã báo cáo</th><th>Công nhân</th><th>Công đoạn</th><th>Ca</th><th>Thời gian</th><th>Trạng thái</th></tr></thead><tbody>{reports.map((r,i)=>{const id=Number(r.id),selected=selectedSet.has(id),active=Number(selectedDetail?.id)===id;return <tr key={r.id??i} className={`${selected?"is-selected":""} ${active?"pending-row-active":""}`} onClick={()=>void openDetail(r)}><td className="select-col" onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selected} disabled={!id||actionLoading} onChange={()=>setSelectedIds(p=>toggleReportId(p,id))}/></td><td>{(currentPage-1)*8+i+1}</td><td className="report-code">{reportCode(r,i)}</td><td><div className="worker-cell">{text(r.full_name)}<small>({text(r.worker_code)})</small></div></td><td>{text(r.process_name)}</td><td><span className="shift-chip">{text(r.shift)}</span></td><td><div className="date-cell"><strong>{formatDate(r.work_date)}</strong><small>{timeRange(r)}</small></div></td><td><span className="status-pill status-orange">Chờ duyệt</span></td></tr>})}</tbody></table></div>}
            <footer className="pending-table-footer"><span>Hiển thị {reports.length?(currentPage-1)*8+1:0} đến {Math.min(currentPage*8,totalCount)} của {totalCount} báo cáo</span><nav className="pending-pagination"><button disabled={currentPage===1} onClick={()=>setCurrentPage(p=>Math.max(1,p-1))}>‹</button>{Array.from({length:Math.min(totalPages,4)},(_,i)=>i+1).map(p=><button key={p} className={currentPage===p?"active":""} onClick={()=>setCurrentPage(p)}>{p}</button>)}{totalPages>4&&<button disabled>…</button>}<button disabled={currentPage===totalPages} onClick={()=>setCurrentPage(p=>Math.min(totalPages,p+1))}>›</button></nav></footer></div>

            {selectedDetail&&<aside className={`pending-detail-card ${editingDetail?"is-editing":""}`}>
                <header className="pending-detail-head"><div className="pending-detail-title"><h2>{editingDetail?"Đề xuất sửa báo cáo":"Chi tiết báo cáo"}</h2><span className="pending-detail-status">Chờ duyệt</span></div><span className="pending-detail-code">Mã báo cáo: {reportCode(selectedDetail)}</span><button type="button" className="pending-detail-close" onClick={()=>{if(!editSaving){setSelectedDetail(null);cancelEdit()}}}>×</button></header>
                {detailLoading?<div className="pending-detail-loading">Đang tải chi tiết...</div>:detail&&<>
                    <div className="pending-detail-body">
                        {editingDetail?<>
                            <section className="pending-detail-section"><h3>Thông tin báo cáo</h3><div className="pending-edit-grid"><label><span>Ngày báo cáo</span><input type="date" value={String(detail.work_date||"").slice(0,10)} onChange={e=>updateField("work_date",e.target.value)}/></label><label><span>Ca làm việc</span><select value={detail.shift||""} onChange={e=>updateField("shift",e.target.value)}><option>A</option><option>B</option><option>C</option><option>D</option></select></label><label><span>Máy móc</span><input value={detail.machine_no||""} onChange={e=>updateField("machine_no",e.target.value)}/></label><label><span>Sản phẩm</span><input value={detail.product_name||""} onChange={e=>updateField("product_name",e.target.value)}/></label><label><span>Giờ làm thực tế</span><input type="number" min="0" max="24" value={editHours} onChange={e=>setEditHours(e.target.value.replace(/\D/g,""))}/></label><label><span>Phút làm thực tế</span><input type="number" min="0" max="59" value={editMinutes} onChange={e=>setEditMinutes(e.target.value.replace(/\D/g,""))}/></label><label><span>Sản lượng OK</span><input type="number" min="0" value={num(detail.tt_ok)} onChange={e=>updateField("tt_ok",Math.max(0,num(e.target.value)))}/></label><label><span>Sản lượng NG</span><input type="number" value={num(detail.tt_ng)} readOnly/></label><label className="pending-edit-note"><span>Ghi chú</span><textarea value={detail.note||""} onChange={e=>updateField("note",e.target.value)} rows={3} placeholder="Ghi chú nếu có..."/></label></div></section>
                            <section className="pending-detail-section"><h3>Chi tiết thời gian trừ</h3><div className="pending-form-summary"><strong>Tổng thời gian trừ: {Math.round((detail.deductions||[]).reduce((s,x)=>s+num(x.hours),0)*60)} phút</strong></div>{(detail.deductions||[]).map((item,i)=><div className="pending-form-row" key={item.deduction_type_id||item.id||i}><label><span>{item.deduction_name||item.deduction_code||"Thời gian trừ"}</span><div className="pending-edit-number-with-unit"><input type="number" min="0" max="1440" value={minutesOf(item.hours)} onChange={e=>updateDeduction(i,num(e.target.value))}/><small>phút</small></div></label><button type="button" className="pending-detail-remove" onClick={()=>removeDeduction(i)}>Xóa</button></div>)}{availableDeds.length>0&&<div className="pending-detail-add-row"><select defaultValue="" onChange={e=>{addDeduction(num(e.target.value));e.currentTarget.value=""}}><option value="">+ Thêm khoản thời gian trừ</option>{availableDeds.map(x=><option key={Number(x.deduction_type_id||x.id)} value={Number(x.deduction_type_id||x.id)}>{x.deduction_name||x.deduction_code}</option>)}</select></div>}</section>
                            <section className="pending-detail-section"><h3>Chi tiết lỗi NG</h3><div className="pending-form-summary"><strong>Tổng NG: {qty((detail.defects||[]).reduce((s,x)=>s+num(x.quantity),0))}</strong></div>{(detail.defects||[]).map((item,i)=><div className="pending-form-row" key={item.defect_type_id||item.id||i}><label><span>{item.defect_name||item.defect_code||"Lỗi NG"}</span><div className="pending-edit-number-with-unit"><input type="number" min="0" value={num(item.quantity)} onChange={e=>updateDefect(i,num(e.target.value))}/><small>sp</small></div></label><button type="button" className="pending-detail-remove" onClick={()=>removeDefect(i)}>Xóa</button></div>)}{availableDefs.length>0&&<div className="pending-detail-add-row"><select defaultValue="" onChange={e=>{addDefect(num(e.target.value));e.currentTarget.value=""}}><option value="">+ Thêm loại lỗi NG</option>{availableDefs.map(x=><option key={Number(x.defect_type_id||x.id)} value={Number(x.defect_type_id||x.id)}>{x.defect_name||x.defect_code}</option>)}</div>}</section>
                        </>:<>
                            <section className="pending-detail-section"><h3>Thông tin chung</h3><div className="pending-detail-grid"><div className="pending-detail-field"><span>Công nhân</span><strong>{text(detail.full_name)} ({text(detail.worker_code)})</strong></div><div className="pending-detail-field"><span>Ngày báo cáo</span><strong>{formatDate(detail.work_date)}</strong></div><div className="pending-detail-field"><span>Công đoạn</span><strong>{text(detail.process_name)}</strong></div><div className="pending-detail-field"><span>Ca làm việc</span><strong>{text(detail.shift)}</strong></div><div className="pending-detail-field"><span>Máy móc</span><strong>{text(detail.machine_no)}</strong></div><div className="pending-detail-field"><span>Sản phẩm</span><strong>{text(detail.product_name)}</strong></div><div className="pending-detail-field"><span>Thời gian</span><strong>{timeRange(detail)} · {number(detail.total_time)} giờ</strong></div><div className="pending-detail-field"><span>Học việc</span><strong>{number(detail.training_percent??100)}%</strong></div></div></section>
                            <section className="pending-detail-section"><h3>Kết quả sản xuất</h3><div className="pending-result-grid"><div className="pending-result-item"><span>Sản lượng OK</span><strong>{qty(detailOk)}</strong></div><div className="pending-result-item ng"><span>Sản lượng NG</span><strong>{qty(detailNg)}</strong></div><div className="pending-result-item total"><span>Tổng sản lượng</span><strong>{qty(detailTotal)}</strong></div><div className="pending-result-item rate"><span>Tỷ lệ OK</span><strong>{detailRate.toLocaleString("vi-VN",{maximumFractionDigits:2})}%</strong></div></div></section>
                            <section className="pending-detail-section"><h3>Chi tiết thời gian trừ</h3><div className="pending-defect-list">{(detail.deductions||[]).filter(x=>num(x.hours)>0).map((x,i)=><span className="pending-defect" key={x.deduction_type_id||x.id||i}>{x.deduction_name||x.deduction_code}: {minutesOf(x.hours)} phút</span>)}{!(detail.deductions||[]).some(x=>num(x.hours)>0)&&<span>Không có thời gian trừ</span>}</div></section>
                            <section className="pending-detail-section"><h3>Chi tiết lỗi NG</h3><div className="pending-defect-list">{(detail.defects||[]).filter(x=>num(x.quantity)>0).map((x,i)=><span className="pending-defect" key={x.defect_type_id||x.id||i}>{x.defect_name||x.defect_code}: {qty(x.quantity)} sản phẩm</span>)}{!(detail.defects||[]).some(x=>num(x.quantity)>0)&&<span>Không có lỗi NG</span>}</div></section>
                            <section className="pending-detail-section"><h3>Ghi chú</h3><div className="pending-detail-note-box">{text(detail.note,"Không có ghi chú")}</div></section>
                        </>}
                    </div>
                    <footer className="pending-detail-actions" style={{gridTemplateColumns:editingDetail?(isLead?"1fr 1.2fr 1.2fr":"1fr 1.2fr"):isLead?"1.2fr 1fr 1fr":"1fr 1fr 1fr"}}>
                        {editingDetail?<>{<button type="button" className="pending-detail-cancel" onClick={cancelEdit} disabled={editSaving}>Hủy</button>}<button type="button" className="pending-detail-save" onClick={()=>void saveEdit(false)} disabled={editSaving}>{editSaving?"Đang lưu...":isLead?"Lưu, chờ duyệt":"Lưu thay đổi"}</button>{isLead&&<button type="button" className="pending-detail-approve" onClick={()=>void saveEdit(true)} disabled={editSaving}>{editSaving?"Đang xử lý...":"Lưu & duyệt"}</button>}</>:<>{(isLead||canDirectEdit)&&<button type="button" className="pending-detail-edit" onClick={()=>void startEdit()} disabled={editSaving}>{isLead?"Đề xuất sửa":"Sửa"}</button>}{canReview&&<><button type="button" className="pending-detail-reject" onClick={()=>{setSelectedIds([Number(selectedDetail.id)]);setRejectOpen(true)}} disabled={actionLoading}>Từ chối</button><button type="button" className="pending-detail-approve" onClick={()=>void approveTargets([Number(selectedDetail.id)],[{id:Number(selectedDetail.id),expected_updated_at:selectedDetail.updated_at||null}])} disabled={actionLoading}>Duyệt</button></>}</>}
                    </footer>
                </>}
            </aside>}
        </section>
        {rejectOpen&&<div className="selected-reject-backdrop" onMouseDown={()=>!actionLoading&&setRejectOpen(false)}><div className="selected-reject-modal" onMouseDown={e=>e.stopPropagation()}><h2>Từ chối báo cáo</h2><p>Báo cáo sẽ được trả lại cho công nhân kèm lý do.</p><label>Lý do<select value={rejectReason} onChange={e=>setRejectReason(e.target.value)}>{REJECT_REASONS.map(x=><option key={x}>{x}</option>)}</select></label><label>Chi tiết<textarea value={rejectDetail} onChange={e=>setRejectDetail(e.target.value)} placeholder="Nội dung cần sửa" rows={3}/></label><div className="selected-reject-actions"><button type="button" onClick={()=>setRejectOpen(false)}>Hủy</button><button type="button" className="selected-review-reject" onClick={()=>void rejectSelected()} disabled={actionLoading}>{actionLoading?"Đang xử lý...":"Xác nhận từ chối"}</button></div></div></div>}
    </div>;
}
