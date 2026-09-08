import { useEffect, useMemo, useState } from "react";
import { BarChart3, CheckCircle2, ChevronLeft, Clock3, RefreshCw, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { getMyTempReports } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";

const num = (v: number) => new Intl.NumberFormat("vi-VN").format(Math.round(v));
const pct = (v: number) => `${v.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
const dateText = (v: string) => { const [y,m,d] = v.slice(0,10).split("-"); return `${d}/${m}/${y}`; };

export default function WorkerStatistics() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<ProductionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState<"7"|"30"|"all">("7");

  const load = async () => {
    try { setLoading(true); setError(""); const data = await getMyTempReports(); setReports(Array.isArray(data) ? data : []); }
    catch (e: unknown) { setError(axios.isAxiosError(e) ? (e.response?.data?.message || "Không thể tải thống kê") : "Không thể tải thống kê"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    if (range === "all") return reports;
    const limit = new Date(); limit.setHours(0,0,0,0); limit.setDate(limit.getDate() - Number(range) + 1);
    return reports.filter(r => { const d = new Date(String(r.work_date).slice(0,10)); return !Number.isNaN(d.getTime()) && d >= limit; });
  }, [reports, range]);

  const stats = useMemo(() => {
    const ok = filtered.reduce((s,r) => s + Number(r.tt_ok ?? 0), 0);
    const ng = filtered.reduce((s,r) => s + Number(r.tt_ng ?? 0), 0);
    const hours = filtered.reduce((s,r) => s + Number(r.total_time ?? 0), 0) / 60;
    const total = ok + ng;
    const approved = filtered.filter(r => r.status === "approved").length;
    return { ok, ng, hours, total, okRate: total ? ok / total * 100 : 0, approved };
  }, [filtered]);

  const byDay = useMemo(() => {
    const map = new Map<string,{ok:number;ng:number;reports:number}>();
    filtered.forEach(r => { const key = String(r.work_date || "").slice(0,10); if (!key) return; const x = map.get(key) || {ok:0,ng:0,reports:0}; x.ok += Number(r.tt_ok ?? 0); x.ng += Number(r.tt_ng ?? 0); x.reports++; map.set(key,x); });
    return [...map.entries()].sort((a,b) => b[0].localeCompare(a[0])).slice(0,7);
  }, [filtered]);

  return <main className="worker-statistics-page">
    <style>{`\
      .worker-statistics-page{min-height:100%;padding:14px 12px 90px;background:#f5f8fc;color:#152b52}.worker-statistics-shell{width:min(100%,760px);margin:auto}.ws-head{display:flex;align-items:center;gap:9px;margin-bottom:12px}.ws-back{width:34px;height:34px;display:grid;place-items:center;border:1px solid #dce6f1;border-radius:9px;background:#fff;color:#355779}.ws-head h1{margin:0;font-size:19px;line-height:1.2;font-weight:700;color:#132957}.ws-head p{margin:3px 0 0;font-size:10px;color:#71849b}.ws-filter{display:flex;gap:6px;margin-bottom:10px}.ws-filter button{height:34px;padding:0 11px;border:1px solid #dce6f1;border-radius:8px;background:#fff;color:#5b7089;font-size:10px;font-weight:650}.ws-filter button.active{border-color:#247de5;background:#edf5ff;color:#1769d2}.ws-refresh{margin-left:auto!important;padding:0 9px!important}.ws-card{border:1px solid #e1e9f2;border-radius:13px;background:#fff;box-shadow:0 4px 15px rgba(35,57,83,.045)}.ws-kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin-bottom:10px}.ws-kpi{padding:10px;border-radius:11px;border:1px solid #e6edf5}.ws-kpi-icon{width:27px;height:27px;display:grid;place-items:center;border-radius:7px;margin-bottom:6px}.ws-kpi-icon svg{width:15px;height:15px}.ws-kpi span{display:block;font-size:9px;color:#71849b}.ws-kpi strong{display:block;margin-top:2px;font-size:17px;line-height:1.1;color:#142b55}.ws-kpi small{font-size:8px;color:#91a0af}.ws-kpi.blue .ws-kpi-icon{background:#edf5ff;color:#176ed4}.ws-kpi.green .ws-kpi-icon{background:#edf9f3;color:#168451}.ws-kpi.red .ws-kpi-icon{background:#fff0f1;color:#d43b49}.ws-kpi.orange .ws-kpi-icon{background:#fff5e8;color:#b76a18}.ws-section{padding:11px;margin-bottom:10px}.ws-section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.ws-section-head h2{margin:0;font-size:12px;color:#19335c}.ws-section-head span{font-size:8.5px;color:#8293a7}.ws-progress{height:7px;border-radius:99px;background:#edf1f5;overflow:hidden}.ws-progress i{display:block;height:100%;border-radius:inherit;background:#247de5}.ws-rate{display:flex;justify-content:space-between;margin-top:5px;font-size:9px;color:#70849d}.ws-rate strong{color:#176ed4}.ws-table{width:100%;border-collapse:collapse;font-size:9px}.ws-table th{text-align:left;color:#8293a7;font-size:8px;font-weight:650;padding:6px 4px;border-bottom:1px solid #edf1f5}.ws-table td{padding:7px 4px;border-bottom:1px solid #f0f3f7;color:#435d7a}.ws-table tr:last-child td{border-bottom:0}.ws-table .ok{color:#168451;font-weight:700}.ws-table .ng{color:#d43d4b;font-weight:700}.ws-error{text-align:center;padding:22px 12px;font-size:10px;color:#b42318}.ws-empty{text-align:center;padding:28px 12px;color:#8293a7;font-size:10px}.ws-loading{padding:35px;text-align:center;color:#8293a7;font-size:10px}@media(max-width:380px){.worker-statistics-page{padding-inline:8px}.ws-head h1{font-size:18px}.ws-kpi strong{font-size:16px}.ws-filter button{padding:0 9px;font-size:9px}}\
    `}</style>
    <div className="worker-statistics-shell">
      <header className="ws-head"><button className="ws-back" onClick={() => navigate("/worker")} aria-label="Quay lại"><ChevronLeft size={17}/></button><div><h1>Thống kê của tôi</h1><p>Theo dõi hiệu suất và sản lượng cá nhân</p></div></header>
      <div className="ws-filter"><button className={range === "7" ? "active" : ""} onClick={() => setRange("7")}>7 ngày</button><button className={range === "30" ? "active" : ""} onClick={() => setRange("30")}>30 ngày</button><button className={range === "all" ? "active" : ""} onClick={() => setRange("all")}>Tất cả</button><button className="ws-refresh" onClick={() => void load()} aria-label="Làm mới"><RefreshCw size={13}/></button></div>
      {loading ? <div className="ws-card ws-loading">Đang tải dữ liệu...</div> : error ? <div className="ws-card ws-error">{error}</div> : <>
        <section className="ws-kpis"><article className="ws-kpi blue"><div className="ws-kpi-icon"><BarChart3/></div><span>Báo cáo</span><strong>{num(filtered.length)}</strong><small>{stats.approved} đã duyệt</small></article><article className="ws-kpi green"><div className="ws-kpi-icon"><CheckCircle2/></div><span>Sản lượng OK</span><strong>{num(stats.ok)}</strong><small>Tổng sản phẩm</small></article><article className="ws-kpi red"><div className="ws-kpi-icon"><XCircle/></div><span>Sản lượng NG</span><strong>{num(stats.ng)}</strong><small>Tổng sản phẩm</small></article><article className="ws-kpi orange"><div className="ws-kpi-icon"><Clock3/></div><span>Giờ làm</span><strong>{stats.hours.toLocaleString("vi-VN",{maximumFractionDigits:1})}</strong><small>Thời gian đã nhập</small></article></section>
        <section className="ws-card ws-section"><div className="ws-section-head"><h2>Tỷ lệ OK</h2><span>{num(stats.total)} sản phẩm</span></div><div className="ws-progress"><i style={{width:`${Math.min(100,stats.okRate)}%`}}/></div><div className="ws-rate"><span>OK {num(stats.ok)} · NG {num(stats.ng)}</span><strong>{pct(stats.okRate)}</strong></div></section>
        <section className="ws-card ws-section"><div className="ws-section-head"><h2>Sản lượng theo ngày</h2><span>{range === "all" ? "Toàn bộ dữ liệu" : `${range} ngày gần nhất`}</span></div>{byDay.length ? <table className="ws-table"><thead><tr><th>Ngày</th><th>Báo cáo</th><th>OK</th><th>NG</th><th>Tỷ lệ</th></tr></thead><tbody>{byDay.map(([day,v]) => <tr key={day}><td>{dateText(day)}</td><td>{v.reports}</td><td className="ok">{num(v.ok)}</td><td className="ng">{num(v.ng)}</td><td>{pct(v.ok+v.ng ? v.ok/(v.ok+v.ng)*100 : 0)}</td></tr>)}</tbody></table> : <div className="ws-empty">Chưa có dữ liệu trong khoảng thời gian này.</div>}</section>
      </>}
    </div>
  </main>;
}
