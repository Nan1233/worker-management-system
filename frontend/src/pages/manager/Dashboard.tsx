import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../../services/api";
import AppIcon from "../../components/common/AppIcon";
import { useToast } from "../../components/feedback/toastContext";
import { getApiError } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";
import { usePermissions } from "../../hooks/usePermissions";

const formatNumber = (value: number) =>
    Number(value || 0).toLocaleString("vi-VN", { maximumFractionDigits: 1 });

const toLocalDate = (date: Date): string => {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60_000).toISOString().split("T")[0];
};

type PeriodKey = "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth";
type ProcessOption = { id: number; process_code?: string; process_name: string };
type ProcessSummary = { process_id: number; process_code?: string; process_name: string; report_count: number; ok: number; ng: number };
type ShiftSummary = { shift: string; report_count: number; ok: number; ng: number };
type ProductSummary = { product_code: string; quantity: number; ok: number; ng: number; report_count: number };

type DashboardSummary = {
    pending_count: number;
    approved_count: number;
    total_ok: number;
    total_ng: number;
    ng_rate: number;
    processes: ProcessOption[];
    process_summary: ProcessSummary[];
    shift_summary: ShiftSummary[];
    product_summary: ProductSummary[];
};

const PERIOD_LABELS: Record<PeriodKey, string> = {
    today: "Hôm nay",
    yesterday: "Hôm qua",
    last7: "7 ngày gần nhất",
    thisMonth: "Tháng này",
    lastMonth: "Tháng trước"
};

const getPeriodRange = (period: PeriodKey) => {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);
    if (period === "yesterday") { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); }
    else if (period === "last7") start.setDate(start.getDate() - 6);
    else if (period === "thisMonth") start.setDate(1);
    else if (period === "lastMonth") { start.setMonth(start.getMonth() - 1, 1); end.setDate(0); }
    return { from: toLocalDate(start), to: toLocalDate(end) };
};

const EMPTY_SUMMARY: DashboardSummary = {
    pending_count: 0, approved_count: 0, total_ok: 0, total_ng: 0, ng_rate: 0,
    processes: [], process_summary: [], shift_summary: [], product_summary: []
};

function Dashboard() {
    const navigate = useNavigate();
    const toast = useToast();
    const [summary, setSummary] = useState<DashboardSummary>(EMPTY_SUMMARY);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState<PeriodKey>("today");
    const currentUser = useMemo(() => getStoredUser(), []);
    const { can } = usePermissions();
    const basePath = currentUser?.role === "admin" ? "/admin" : currentUser?.role === "lead" ? "/lead" : "/manager";

    useEffect(() => {
        const controller = new AbortController();
        const range = getPeriodRange(period);
        const cacheKey = `ktc:dashboard:${range.from}:${range.to}`;
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (Date.now() - Number(parsed?.savedAt || 0) < 15_000 && parsed?.data) {
                    setSummary({ ...EMPTY_SUMMARY, ...parsed.data, product_summary: parsed.data.product_summary || [] });
                    setLoading(false);
                    return () => controller.abort();
                }
            } catch { sessionStorage.removeItem(cacheKey); }
        }
        const load = async () => {
            setLoading(true);
            try {
                const response = await api.get("/dashboard/summary", { params: range, signal: controller.signal });
                const data = { ...EMPTY_SUMMARY, ...(response.data?.data || {}), product_summary: response.data?.data?.product_summary || [] };
                setSummary(data);
                sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data }));
            } catch (error) {
                if (!controller.signal.aborted) toast.showToast(getApiError(error, "Không thể tải dữ liệu tổng quan").message, "error");
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        void load();
        return () => controller.abort();
    }, [period, toast]);

    const processData = useMemo(() => {
        const byId = new Map(summary.process_summary.map(item => [Number(item.process_id), item]));
        return summary.processes.map(process => {
            const value = byId.get(Number(process.id));
            return { id: Number(process.id), name: process.process_name, code: process.process_code,
                ok: Number(value?.ok || 0), ng: Number(value?.ng || 0), count: Number(value?.report_count || 0) };
        }).sort((a, b) => (b.ok + b.ng) - (a.ok + a.ng) || a.name.localeCompare(b.name, "vi"));
    }, [summary]);

    const processWithData = processData.filter(item => item.count > 0 || item.ok + item.ng > 0);
    const maxProcessOutput = Math.max(1, ...processWithData.map(item => item.ok + item.ng));
    const shiftData = summary.shift_summary.map(item => {
        const ok = Number(item.ok || 0), ng = Number(item.ng || 0), total = ok + ng;
        return { ...item, ok, ng, total, ngRate: total ? (ng / total) * 100 : 0 };
    });
    const productData = summary.product_summary
        .map(item => ({ ...item, quantity: Number(item.quantity || 0), ok: Number(item.ok || 0), ng: Number(item.ng || 0), report_count: Number(item.report_count || 0) }))
        .filter(item => item.product_code && item.quantity > 0)
        .sort((a, b) => b.quantity - a.quantity || a.product_code.localeCompare(b.product_code, "vi"));
    const maxProductQuantity = Math.max(1, ...productData.map(item => item.quantity));
    const totalOutput = Number(summary.total_ok || 0) + Number(summary.total_ng || 0);
    const okRate = totalOutput ? (Number(summary.total_ok || 0) / totalOutput) * 100 : 0;
    const maxDaily = Math.max(1, ...shiftData.map(item => item.total));
    const chartPoints = shiftData.map((item, index) => `${shiftData.length === 1 ? 50 : 8 + (index * 84) / Math.max(1, shiftData.length - 1)},${92 - (item.total / maxDaily) * 72}`).join(" ");

    if (loading) return (
        <main className="manager-dashboard">
            <div className="dashboard-loading-title" />
            <div className="dashboard-kpi-grid">{[1,2,3,4,5,6].map(item => <div key={item} className="dashboard-loading-card" />)}</div>
        </main>
    );

    return (
        <main className="manager-dashboard">
            <header className="manager-dashboard-header">
                <div>
                    <span className="dashboard-eyebrow">KTC (HANOI) CO., LTD.</span>
                    <h1>KTC Production Dashboard</h1>
                </div>
                <label className="dashboard-period-filter">
                    <span>Khoảng thời gian</span>
                    <select value={period} onChange={event => setPeriod(event.target.value as PeriodKey)}>
                        {Object.entries(PERIOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                </label>
            </header>

            {summary.pending_count > 0 && can("REPORT_PENDING_VIEW") && (
                <section className="dashboard-attention">
                    <div className="dashboard-attention-icon"><AppIcon name="pending" size={20} /></div>
                    <div className="dashboard-attention-copy"><strong>{formatNumber(summary.pending_count)} báo cáo đang chờ duyệt</strong><span>Ưu tiên xử lý các báo cáo mới trước khi xem thống kê.</span></div>
                    <button type="button" onClick={() => navigate(`${basePath}/reports`)}>Duyệt báo cáo</button>
                </section>
            )}

            <section className="dashboard-kpi-grid">
                <article className="dashboard-kpi-card primary"><span>Tổng sản lượng</span><strong>{formatNumber(totalOutput)}</strong><small>Trong khoảng đã chọn</small></article>
                <article className="dashboard-kpi-card success"><span>OK</span><strong>{formatNumber(summary.total_ok)}</strong><small>{okRate.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% tổng sản lượng</small></article>
                <article className="dashboard-kpi-card danger"><span>NG</span><strong>{formatNumber(summary.total_ng)}</strong><small>{Number(summary.ng_rate || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}% tổng sản lượng</small></article>
                <article className="dashboard-kpi-card info"><span>Tỷ lệ OK</span><strong>{okRate.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</strong><small>Chất lượng sản xuất</small></article>
                <article className="dashboard-kpi-card neutral"><span>Công đoạn</span><strong>{processData.length}</strong><small>{processWithData.length} công đoạn có dữ liệu</small></article>
                <article className="dashboard-kpi-card warning"><span>Chờ phê duyệt</span><strong>{formatNumber(summary.pending_count)}</strong><small>{formatNumber(summary.approved_count)} báo cáo đã duyệt</small></article>
            </section>

            <section className="dashboard-main-grid">
                <article className="dashboard-panel dashboard-daily-panel">
                    <div className="dashboard-panel-heading"><div><span>PHÂN TÍCH SẢN XUẤT</span><h2>Sản lượng theo ca</h2></div></div>
                    {shiftData.length === 0 ? <div className="dashboard-empty">Chưa có dữ liệu trong khoảng thời gian này</div> : (
                        <div className="dashboard-line-chart">
                            <div className="dashboard-line-grid"><i/><i/><i/><i/></div>
                            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points={chartPoints} /></svg>
                            <div className="dashboard-line-bars">
                                {shiftData.map(item => <div className="dashboard-line-item" key={item.shift}><b>{formatNumber(item.total)}</b><span style={{height:`${Math.max(6,(item.total/maxDaily)*70)}%`}}/><strong>Ca {item.shift}</strong><small>{item.report_count} BC</small></div>)}
                            </div>
                        </div>
                    )}
                    <div className="dashboard-legend"><span><i className="legend-blue"/>Sản lượng</span><span><i className="legend-green"/>OK</span><span><i className="legend-red"/>NG</span></div>
                </article>

                <article className="dashboard-panel dashboard-quality-panel">
                    <div className="dashboard-panel-heading"><div><span>CHẤT LƯỢNG</span><h2>Tỷ lệ OK / NG</h2></div></div>
                    <div className="dashboard-donut-wrap"><div className="dashboard-donut" style={{background:`conic-gradient(#2c9b68 0 ${okRate}%, #e05b63 ${okRate}% 100%)`}}><div><strong>{okRate.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</strong><span>OK</span></div></div></div>
                    <div className="dashboard-quality-stats"><div><i className="legend-green"/><span>OK</span><b>{formatNumber(summary.total_ok)}</b></div><div><i className="legend-red"/><span>NG</span><b>{formatNumber(summary.total_ng)}</b></div></div>
                </article>

                <article className="dashboard-panel dashboard-process-panel">
                    <div className="dashboard-panel-heading"><div><span>HIỆU SUẤT CÔNG ĐOẠN</span><h2>Sản lượng theo công đoạn</h2></div><button type="button" onClick={() => navigate(`${basePath}/reports`)}>Xem báo cáo</button></div>
                    {processWithData.length === 0 ? <div className="dashboard-empty">Chưa có dữ liệu</div> : <div className="dashboard-process-list">{processWithData.slice(0, 6).map((item, index) => { const total = item.ok + item.ng; const width = Math.max(8, (total / maxProcessOutput) * 100); return <div className="dashboard-process-row" key={item.id}><span className="dashboard-process-index">{index + 1}</span><div className="dashboard-process-name"><strong>{item.name}</strong><small>{item.count} báo cáo</small></div><div className="dashboard-process-bar"><span style={{width:`${width}%`}}/></div><b>{formatNumber(total)}</b><em>NG {item.ng > 0 ? ((item.ng / total) * 100).toLocaleString("vi-VN", {maximumFractionDigits:1}) : "0"}%</em></div>; })}</div>}
                </article>

                <article className="dashboard-panel dashboard-product-panel">
                    <div className="dashboard-panel-heading"><div><span>PRODUCTION</span><h2>Sản lượng theo mã SP</h2></div></div>
                    {productData.length === 0 ? (
                        <div className="dashboard-empty">Chưa có dữ liệu mã sản phẩm</div>
                    ) : (
                        <div className="dashboard-product-list">
                            {productData.slice(0, 6).map(item => {
                                const width = Math.max(8, (item.quantity / maxProductQuantity) * 100);
                                return (
                                    <div className="dashboard-product-row" key={item.product_code}>
                                        <div className="dashboard-product-code"><strong>{item.product_code}</strong><small>{item.report_count} báo cáo</small></div>
                                        <div className="dashboard-product-bar"><span style={{width:`${width}%`}}/></div>
                                        <b>{formatNumber(item.quantity)}</b>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div className="dashboard-product-total"><span>{productData.length} mã SP có dữ liệu</span><strong>{formatNumber(productData.reduce((sum, item) => sum + item.quantity, 0))}</strong><small>SL ghi nhận</small></div>
                </article>
            </section>

            <section className="dashboard-panel dashboard-activity-panel">
                <div className="dashboard-panel-heading"><div><span>ACTIVITY</span><h2>Hoạt động gần đây</h2></div><button type="button" onClick={() => navigate(`${basePath}/reports`)}>Xem tất cả</button></div>
                <div className="dashboard-activity-list">
                    {processWithData.slice(0, 5).map((item, index) => <div className="dashboard-activity-row" key={item.id}><span className="dashboard-activity-dot"/><div><strong>{item.name}</strong><small>{item.count} báo cáo · OK {formatNumber(item.ok)} · NG {formatNumber(item.ng)}</small></div><b>{index === 0 ? "Mới" : "Đã ghi nhận"}</b></div>)}
                    {processWithData.length === 0 && <div className="dashboard-empty">Chưa có hoạt động gần đây</div>}
                </div>
            </section>
        </main>
    );
}

export default Dashboard;
