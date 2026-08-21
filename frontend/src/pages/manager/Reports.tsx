import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { approveSelectedTempReports, getPendingReports, rejectSelectedTempReports } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import { useToast } from "../../components/feedback/toastContext";
import { getStoredUser } from "../../utils/authStorage";
import { usePermissions } from "../../hooks/usePermissions";
import { getDateRangeForMode, getToday, type DateFilterMode } from "./managerReportDateLogic";
import { getManagerReportDuplicateKey as duplicateKey } from "./managerReportSearchLogic";
import { getManagerReportRowNumber } from "./managerReportPagination";
import { getValidReportIds, reconcileSelectedReportIds, toggleCurrentPageIds, toggleReportId } from "./managerReportSelection";

const REJECT_REASONS = ["Báo cáo trùng", "Sai sản lượng", "Sai thời gian", "Sai máy hoặc sản phẩm", "Thiếu dữ liệu", "Lý do khác"];
const text = (v: unknown, fallback = "---") => v === undefined || v === null || v === "" ? fallback : String(v);
const reportCode = (r: ProductionReport, i: number) => `PR${String(r.work_date || "REPORT").slice(0,10).replace(/-/g,"")}-${r.worker_code || String(r.id || i + 1).padStart(4,"0")}`;
const timeRange = (r: ProductionReport) => {
    const x = (r.extra_data || {}) as Record<string, unknown>;
    return x.start_time && x.end_time ? `${x.start_time} - ${x.end_time}` : "07:30 - 15:30";
};
const statusOf = (_r: ProductionReport) => "Chờ duyệt";

function Reports() {
    const { can } = usePermissions();
    const canReview = can("REPORT_APPROVE");
    const { showToast } = useToast();
    const navigate = useNavigate();
    const user = getStoredUser();
    const basePath = user?.role === "admin" ? "/admin" : user?.role === "lead" ? "/lead" : "/manager";
    const [dateMode,setDateMode] = useState<DateFilterMode>("today");
    const [dateFrom,setDateFrom] = useState(getToday());
    const [dateTo,setDateTo] = useState(getToday());
    const [reports,setReports] = useState<ProductionReport[]>([]);
    const [selectedIds,setSelectedIds] = useState<number[]>([]);
    const [loading,setLoading] = useState(true);
    const [actionLoading,setActionLoading] = useState(false);
    const [error,setError] = useState("");
    const [rejectOpen,setRejectOpen] = useState(false);
    const [rejectReason,setRejectReason] = useState(REJECT_REASONS[0]);
    const [rejectDetail,setRejectDetail] = useState("");
    const [searchKeyword,setSearchKeyword] = useState("");
    const [searchQuery,setSearchQuery] = useState("");
    const [selectedProcess,setSelectedProcess] = useState("");
    const [currentPage,setCurrentPage] = useState(1);
    const [totalCount,setTotalCount] = useState(0);
    const [totalPages,setTotalPages] = useState(1);
    const seq = useRef(0);
    const lock = useRef(false);

    useEffect(() => { const t=window.setTimeout(()=>setSearchQuery(searchKeyword.trim()),250); return ()=>window.clearTimeout(t); },[searchKeyword]);
    const range = useMemo(()=>getDateRangeForMode(dateMode,"",dateFrom,dateTo),[dateMode,dateFrom,dateTo]);
    const loadReports = useCallback(async()=>{
        const n=++seq.current; const current=()=>seq.current===n;
        try{
            setLoading(true); setError("");
            const result=await getPendingReports({dateFrom:range.dateFrom,dateTo:range.dateTo,processName:selectedProcess||undefined,search:searchQuery||undefined,page:currentPage,pageSize:8});
            if(!current()) return;
            setReports(result.data); setTotalCount(result.pagination.total); setTotalPages(result.pagination.total_pages); setSelectedIds(p=>reconcileSelectedReportIds(p,result.data));
        }catch(err:unknown){
            if(!current()) return;
            setError(axios.isAxiosError(err)?err.response?.data?.message||"Không thể tải báo cáo chờ duyệt":"Không thể tải báo cáo chờ duyệt"); setReports([]); setTotalCount(0); setTotalPages(1); setSelectedIds([]);
        }finally{if(current())setLoading(false);}
    },[range.dateFrom,range.dateTo,selectedProcess,searchQuery,currentPage]);
    useEffect(()=>{void loadReports();},[loadReports]);
    useEffect(()=>{setCurrentPage(1);setSelectedIds([]);},[selectedProcess,dateMode,dateFrom,dateTo,searchQuery]);

    const processes=useMemo(()=>Array.from(new Set(reports.map(r=>r.process_name).filter(Boolean) as string[])).sort(),[reports]);
    const duplicateCounts=useMemo(()=>{const m=new Map<string,number>();reports.forEach(r=>m.set(duplicateKey(r),(m.get(duplicateKey(r))??0)+1));return m;},[reports]);
    const visibleReports=reports;
    const pageIds=useMemo(()=>getValidReportIds(visibleReports),[visibleReports]);
    const selectedSet=useMemo(()=>new Set(selectedIds),[selectedIds]);
    const targets=useMemo(()=>reports.filter(r=>selectedSet.has(Number(r.id))).map(r=>({id:Number(r.id),expected_updated_at:r.updated_at||null})),[reports,selectedSet]);
    const allSelected=pageIds.length>0&&pageIds.every(id=>selectedSet.has(id));
    const someSelected=pageIds.some(id=>selectedSet.has(id))&&!allSelected;
    const overdueCount=reports.filter(r=>String(r.work_date||"").slice(0,10)<getToday()).length;

    const togglePage=()=>setSelectedIds(p=>toggleCurrentPageIds(p,pageIds,allSelected));
    const toggleOne=(id:number)=>setSelectedIds(p=>toggleReportId(p,id));
    const viewOne=(id:number)=>{sessionStorage.setItem("selectedPendingReportIds",JSON.stringify([id]));navigate(`${basePath}/reports/review`);};
    const viewSelected=()=>{if(!selectedIds.length){showToast("Vui lòng chọn ít nhất một báo cáo");return;}sessionStorage.setItem("selectedPendingReportIds",JSON.stringify(selectedIds));navigate(`${basePath}/reports/review`);};

    const approveTargets=async(ids:number[],items:{id:number;expected_updated_at:string|null}[])=>{
        if(lock.current||actionLoading)return; if(!ids.length)return showToast("Vui lòng chọn ít nhất một báo cáo");
        if(!window.confirm(`Duyệt ${ids.length} báo cáo đã chọn?`))return;
        lock.current=true;setActionLoading(true);
        try{await approveSelectedTempReports(items);showToast(`Đã duyệt ${ids.length} báo cáo`,"success");setSelectedIds(p=>p.filter(id=>!ids.includes(id)));await loadReports();}
        catch(err:unknown){showToast(axios.isAxiosError(err)?err.response?.data?.message||"Duyệt báo cáo thất bại":"Duyệt báo cáo thất bại");}
        finally{lock.current=false;setActionLoading(false);}
    };
    const approveSelected=()=>approveTargets(selectedIds,targets);
    const approveOne=(r:ProductionReport)=>approveTargets([Number(r.id)],[{id:Number(r.id),expected_updated_at:r.updated_at||null}]);
    const rejectSelected=async()=>{
        if(lock.current||actionLoading||!selectedIds.length)return;
        const reason=rejectReason==="Lý do khác"?rejectDetail.trim():[rejectReason,rejectDetail.trim()].filter(Boolean).join(": ");
        if(!reason)return showToast("Vui lòng nhập lý do từ chối");
        lock.current=true;setActionLoading(true);
        try{await rejectSelectedTempReports(targets,reason);showToast(`Đã từ chối ${selectedIds.length} báo cáo`,"success");setRejectOpen(false);setRejectDetail("");setSelectedIds([]);await loadReports();}
        catch(err:unknown){showToast(axios.isAxiosError(err)?err.response?.data?.message||"Từ chối báo cáo thất bại":"Từ chối báo cáo thất bại");}
        finally{lock.current=false;setActionLoading(false);}
    };

    return <div className="management-report-page manager-page pending-reference-page">
        <header className="pending-page-title"><div><h1>Chờ duyệt</h1><p>Danh sách báo cáo sản xuất chờ duyệt</p></div></header>
        <nav className="pending-tabs" aria-hidden="true"></nav>
        <section className="pending-filter-card">
            <div className="pending-search"><span>⌕</span><input value={searchKeyword} onChange={e=>setSearchKeyword(e.target.value)} placeholder="Tìm kiếm theo mã báo cáo, công nhân..."/></div>
            <label><span>Ngày báo cáo</span><input type="date" value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setDateTo(e.target.value);setDateMode("range");}}/></label>
            <label><span>Quy trình</span><select value={selectedProcess} onChange={e=>setSelectedProcess(e.target.value)}><option value="">Tất cả</option>{processes.map(p=><option key={p}>{p}</option>)}</select></label>
            <label><span>Trạng thái</span><select value="Chờ duyệt" aria-label="Trạng thái"><option value="Chờ duyệt">Chờ duyệt</option></select></label>
            <button className="pending-refresh" type="button" onClick={()=>void loadReports()}>⟳ <span>Làm mới</span></button>
        </section>
        <section className="pending-kpis">
            <div className="pending-kpi kpi-blue"><span>Tổng số báo cáo</span><strong>{totalCount}</strong><small>Báo cáo</small></div>
            <div className="pending-kpi kpi-slate"><span>Quá hạn duyệt</span><strong>{overdueCount}</strong><small>Báo cáo</small></div>
            <div className="pending-kpi kpi-green"><span>Đã duyệt hôm nay</span><strong>—</strong><small>Báo cáo</small></div>
        </section>
        {error&&<div className="management-error">{error}</div>}{selectedIds.length>0&&<div className="management-selected-info"><strong>Đã chọn {selectedIds.length} báo cáo.</strong><button type="button" onClick={()=>setSelectedIds([])}>Bỏ chọn</button></div>}
        <section className="pending-table-card">
            {loading?<div className="management-empty">Đang tải...</div>:!visibleReports.length?<div className="management-empty">Không có báo cáo phù hợp</div>:<div className="pending-table-wrap"><table className="pending-reference-table"><thead><tr><th className="select-col"><input type="checkbox" checked={allSelected} ref={el=>{if(el)el.indeterminate=someSelected;}} onChange={togglePage}/></th><th>STT</th><th>Mã báo cáo</th><th>Công nhân</th><th>Quy trình</th><th>Ngày báo cáo</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{visibleReports.map((r,i)=>{const id=Number(r.id);const selected=selectedSet.has(id);const duplicate=(duplicateCounts.get(duplicateKey(r))??0)>1;const status=statusOf(r);return <tr key={r.id??i} className={`${selected?"is-selected":""} ${duplicate?"is-duplicate":""}`}><td className="select-col"><input type="checkbox" checked={selected} disabled={!id||actionLoading} onChange={()=>toggleOne(id)}/></td><td>{getManagerReportRowNumber(currentPage,i)}</td><td className="report-code">{reportCode(r,i)}</td><td><div className="worker-cell">{text(r.full_name)}<small>({text(r.worker_code)})</small></div></td><td>{text(r.process_name)}</td><td><div className="date-cell">{String(r.work_date||"").slice(0,10)}<small>{timeRange(r)}</small></div></td><td><span className="status-pill status-orange">{status}</span></td><td className="actions-cell"><button type="button" className="icon-action view" title="Xem chi tiết" onClick={()=>viewOne(id)}>◉</button>{canReview&&<button type="button" className="icon-action approve" title="Duyệt" onClick={()=>void approveOne(r)}>✓</button>}</td></tr>;})}</tbody></table></div>}
            <footer className="pending-table-footer"><span>Hiển thị {visibleReports.length?((currentPage-1)*8+1):0} đến {Math.min(currentPage*8,totalCount)} của {totalCount} báo cáo</span><nav className="pending-pagination"><button disabled={currentPage===1} onClick={()=>setCurrentPage(p=>Math.max(1,p-1))}>‹</button>{Array.from({length:Math.min(totalPages,4)},(_,i)=>i+1).map(p=><button key={p} className={currentPage===p?"active":""} onClick={()=>setCurrentPage(p)}>{p}</button>)}{totalPages>4&&<button disabled>…</button>}<button disabled={currentPage===totalPages} onClick={()=>setCurrentPage(p=>Math.min(totalPages,p+1))}>›</button></nav></footer>
        </section>
        {selectedIds.length>0&&<div className="pending-bulk-actions"><button type="button" onClick={viewSelected}>Xem chi tiết</button>{canReview&&<><button type="button" className="reject" onClick={()=>setRejectOpen(true)}>Từ chối</button><button type="button" className="approve" onClick={()=>void approveSelected()}>{actionLoading?"Đang xử lý...":"Duyệt"}</button></>}</div>}
        {rejectOpen&&canReview&&<div className="management-modal-backdrop" onMouseDown={()=>!actionLoading&&setRejectOpen(false)}><div className="management-modal" onMouseDown={e=>e.stopPropagation()}><h2>Từ chối báo cáo</h2><p>{selectedIds.length} báo cáo sẽ rời danh sách chờ.</p><label>Lý do<select value={rejectReason} onChange={e=>setRejectReason(e.target.value)}>{REJECT_REASONS.map(reason=><option key={reason}>{reason}</option>)}</select></label><label>Chi tiết<textarea value={rejectDetail} onChange={e=>setRejectDetail(e.target.value)} rows={3}/></label><div className="management-modal-actions"><button type="button" onClick={()=>setRejectOpen(false)}>Hủy</button><button type="button" className="management-reject-button" onClick={()=>void rejectSelected()}>{actionLoading?"Đang xử lý...":"Xác nhận từ chối"}</button></div></div></div>}
    </div>;
}
export default Reports;
