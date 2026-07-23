import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../../api/axios";
import AppIcon from "../../components/common/AppIcon";
import { useToast } from "../../components/feedback/toastContext";
import { getApiError } from "../../utils/apiError";
import "./Dashboard.css";

const formatNumber = (value: number) =>
    Number(value || 0).toLocaleString("vi-VN", { maximumFractionDigits: 0 });

const formatPercent = (value: number) =>
    Number(value || 0).toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const toLocalDate = (date: Date): string => {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60_000).toISOString().split("T")[0];
};

type PeriodKey = "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth";

type ProcessOption = { id: number; process_code?: string; process_name: string };
type ProcessSummary = { process_id: number; process_code?: string; process_name: string; report_count: number; ok: number; ng: number };
type ShiftSummary = { shift: string; report_count: number; ok: number; ng: number };
type DailySummary = { work_date: string; report_count: number; ok: number; ng: number };

type DashboardSummary = {
    pending_count: number;
    approved_count: number;
    total_ok: number;
    total_ng: number;
    ng_rate: number;
    processes: ProcessOption[];
    process_summary: ProcessSummary[];
    shift_summary: ShiftSummary[];
    daily_summary: DailySummary[];
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

    if (period === "yesterday") {
        start.setDate(start.getDate() - 1);
        end.setDate(end.getDate() - 1);
    } else if (period === "last7") {
        start.setDate(start.getDate() - 6);
    } else if (period === "thisMonth") {
        start.setDate(1);
    } else if (period === "lastMonth") {
        start.setMonth(start.getMonth() - 1, 1);
        end.setDate(0);
    }

    return { from: toLocalDate(start), to: toLocalDate(end) };
};

const EMPTY_SUMMARY: DashboardSummary = {
    pending_count: 0,
    approved_count: 0,
    total_ok: 0,
    total_ng: 0,
    ng_rate: 0,
    processes: [],
    process_summary: [],
    shift_summary: [],
    daily_summary: []
};

function ProductionTrend({ data }: { data: DailySummary[] }) {
    const points = useMemo(() => {
        if (!data.length) return [];
        const width = 920;
        const height = 220;
        const paddingX = 36;
        const paddingTop = 24;
        const paddingBottom = 36;
        const max = Math.max(1, ...data.map(item => Number(item.ok || 0) + Number(item.ng || 0)));
        return data.map((item, index) => {
            const total = Number(item.ok || 0) + Number(item.ng || 0);
            const x = data.length === 1
                ? width / 2
                : paddingX + (index / (data.length - 1)) * (width - paddingX * 2);
            const y = paddingTop + (1 - total / max) * (height - paddingTop - paddingBottom);
            return { ...item, total, x, y };
        });
    }, [data]);

    if (!points.length) return <div className="executive-empty">Chưa có dữ liệu xu hướng trong khoảng thời gian này.</div>;

    const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
    const areaPath = `${linePath} L ${points[points.length - 1].x} 184 L ${points[0].x} 184 Z`;
    const maxValue = Math.max(1, ...points.map(point => point.total));

    return (
        <div className="executive-trend-chart">
            <div className="executive-chart-scale">
                <span>{formatNumber(maxValue)}</span>
                <span>{formatNumber(maxValue / 2)}</span>
                <span>0</span>
            </div>
            <svg viewBox="0 0 920 220" role="img" aria-label="Xu hướng tổng sản lượng theo ngày">
                <defs>
                    <linearGradient id="productionArea" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#2f6ea5" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="#2f6ea5" stopOpacity="0.02" />
                    </linearGradient>
                </defs>
                <line x1="36" y1="24" x2="884" y2="24" className="chart-grid-line" />
                <line x1="36" y1="104" x2="884" y2="104" className="chart-grid-line" />
                <line x1="36" y1="184" x2="884" y2="184" className="chart-grid-line" />
                <path d={areaPath} fill="url(#productionArea)" />
                <path d={linePath} className="executive-trend-line" />
                {points.map(point => (
                    <g key={point.work_date} className="executive-trend-point">
                        <circle cx={point.x} cy={point.y} r="4.5" />
                        <title>{`${new Date(`${point.work_date}T00:00:00`).toLocaleDateString("vi-VN")}: ${formatNumber(point.total)} sản phẩm`}</title>
                    </g>
                ))}
                {points.map((point, index) => {
                    const show = points.length <= 8 || index === 0 || index === points.length - 1 || index % Math.ceil(points.length / 6) === 0;
                    return show ? (
                        <text key={`label-${point.work_date}`} x={point.x} y="210" textAnchor="middle" className="executive-chart-label">
                            {new Date(`${point.work_date}T00:00:00`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}
                        </text>
                    ) : null;
                })}
            </svg>
        </div>
    );
}

function Dashboard() {
    const navigate = useNavigate();
    const toast = useToast();
    const [summary, setSummary] = useState<DashboardSummary>(EMPTY_SUMMARY);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [period, setPeriod] = useState<PeriodKey>("thisMonth");
    const [refreshKey, setRefreshKey] = useState(0);

    const currentUser = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem("user") || "null") as { role?: string } | null;
        } catch {
            return null;
        }
    }, []);

    const basePath = currentUser?.role === "admin" ? "/admin" : currentUser?.role === "lead" ? "/lead" : "/manager";

    useEffect(() => {
        const controller = new AbortController();
        const load = async () => {
            refreshKey === 0 ? setLoading(true) : setRefreshing(true);
            try {
                const range = getPeriodRange(period);
                const response = await api.get("/dashboard/summary", { params: range, signal: controller.signal });
                setSummary({ ...EMPTY_SUMMARY, ...(response.data?.data || {}) });
            } catch (error) {
                if (controller.signal.aborted) return;
                toast.showToast(getApiError(error, "Không thể tải dữ liệu tổng quan").message, "error");
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        };
        void load();
        return () => controller.abort();
    }, [period, refreshKey, toast]);

    const processData = useMemo(() => {
        const byId = new Map(summary.process_summary.map(item => [Number(item.process_id), item]));
        return summary.processes.map(process => {
            const value = byId.get(Number(process.id));
            const ok = Number(value?.ok || 0);
            const ng = Number(value?.ng || 0);
            const total = ok + ng;
            return {
                id: Number(process.id),
                name: process.process_name,
                ok,
                ng,
                total,
                count: Number(value?.report_count || 0),
                ngRate: total > 0 ? (ng / total) * 100 : 0
            };
        }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "vi"));
    }, [summary]);

    const processWithData = processData.filter(item => item.count > 0 || item.total > 0);
    const processWithoutData = processData.filter(item => item.count === 0 && item.total === 0);
    const maxProcessOutput = Math.max(1, ...processWithData.map(item => item.total));

    const shiftData = useMemo(() => summary.shift_summary.map(item => {
        const ok = Number(item.ok || 0);
        const ng = Number(item.ng || 0);
        const total = ok + ng;
        return { ...item, ok, ng, total, ngRate: total > 0 ? (ng / total) * 100 : 0 };
    }).sort((a, b) => b.total - a.total), [summary.shift_summary]);
    const maxShiftOutput = Math.max(1, ...shiftData.map(item => item.total));

    const totalOutput = summary.total_ok + summary.total_ng;
    const topProcess = processWithData[0];
    const topShift = shiftData[0];
    const highestNgShift = [...shiftData].sort((a, b) => b.ngRate - a.ngRate)[0];

    if (loading) {
        return (
            <main className="executive-dashboard">
                <div className="executive-skeleton executive-skeleton-heading" />
                <div className="executive-skeleton executive-skeleton-kpis" />
                <div className="executive-skeleton executive-skeleton-chart" />
            </main>
        );
    }

    return (
        <main className="executive-dashboard">
            <header className="executive-page-header">
                <div>
                    <span className="executive-eyebrow">KTC PRODUCTION INTELLIGENCE</span>
                    <h1>Tổng quan sản xuất</h1>
                    <p>Dữ liệu điều hành tập trung theo công đoạn và ca sản xuất.</p>
                </div>
                <div className="executive-header-actions">
                    <label className="executive-period-select">
                        <AppIcon name="clock" size={17} />
                        <select value={period} onChange={event => setPeriod(event.target.value as PeriodKey)}>
                            {Object.entries(PERIOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                    </label>
                    <button type="button" className="executive-refresh" onClick={() => setRefreshKey(value => value + 1)} disabled={refreshing}>
                        <AppIcon name="history" size={17} />
                        {refreshing ? "Đang cập nhật" : "Làm mới"}
                    </button>
                </div>
            </header>

            <section className="executive-kpi-strip">
                <article>
                    <span>Chờ duyệt</span>
                    <strong>{formatNumber(summary.pending_count)}</strong>
                    <small>{summary.pending_count > 0 ? "Cần xử lý" : "Đã xử lý hết"}</small>
                </article>
                <article>
                    <span>Sản lượng OK</span>
                    <strong>{formatNumber(summary.total_ok)}</strong>
                    <small>{PERIOD_LABELS[period]}</small>
                </article>
                <article>
                    <span>Tỷ lệ NG</span>
                    <strong>{formatPercent(summary.ng_rate)}%</strong>
                    <small>{formatNumber(summary.total_ng)} sản phẩm NG</small>
                </article>
                <article>
                    <span>Báo cáo đã duyệt</span>
                    <strong>{formatNumber(summary.approved_count)}</strong>
                    <small>{processWithData.length}/{processData.length} công đoạn có dữ liệu</small>
                </article>
            </section>

            <section className="executive-panel executive-trend-panel">
                <div className="executive-panel-heading">
                    <div>
                        <span className="executive-section-kicker">XU HƯỚNG VẬN HÀNH</span>
                        <h2>Sản lượng theo ngày</h2>
                    </div>
                    <div className="executive-total-output">
                        <span>Tổng sản lượng</span>
                        <strong>{formatNumber(totalOutput)}</strong>
                    </div>
                </div>
                <ProductionTrend data={summary.daily_summary || []} />
            </section>

            <section className="executive-analysis-grid">
                <article className="executive-panel">
                    <div className="executive-panel-heading compact">
                        <div>
                            <span className="executive-section-kicker">CÔNG ĐOẠN</span>
                            <h2>Hiệu suất sản xuất</h2>
                        </div>
                        <span className="executive-panel-count">{processWithData.length} đang có dữ liệu</span>
                    </div>

                    {processWithData.length === 0 ? <div className="executive-empty">Chưa có dữ liệu công đoạn.</div> : (
                        <div className="executive-process-list">
                            <div className="executive-list-header process">
                                <span>Công đoạn</span><span>Báo cáo</span><span>Sản lượng</span><span>NG</span>
                            </div>
                            {processWithData.map((item, index) => (
                                <div className="executive-process-row" key={item.id}>
                                    <div className="executive-process-name">
                                        <span>{String(index + 1).padStart(2, "0")}</span>
                                        <strong>{item.name}</strong>
                                    </div>
                                    <span>{formatNumber(item.count)}</span>
                                    <div className="executive-mini-metric">
                                        <strong>{formatNumber(item.total)}</strong>
                                        <div><i style={{ width: `${Math.max(3, (item.total / maxProcessOutput) * 100)}%` }} /></div>
                                    </div>
                                    <strong className="executive-ng-value">{formatPercent(item.ngRate)}%</strong>
                                </div>
                            ))}
                        </div>
                    )}

                    {processWithoutData.length > 0 && (
                        <div className="executive-muted-note">Chưa phát sinh: {processWithoutData.map(item => item.name).join(", ")}</div>
                    )}
                </article>

                <article className="executive-panel">
                    <div className="executive-panel-heading compact">
                        <div>
                            <span className="executive-section-kicker">CA SẢN XUẤT</span>
                            <h2>So sánh hiệu suất</h2>
                        </div>
                        <span className="executive-panel-count">{shiftData.length} ca</span>
                    </div>

                    {shiftData.length === 0 ? <div className="executive-empty">Chưa có dữ liệu theo ca.</div> : (
                        <div className="executive-shift-list">
                            <div className="executive-list-header shift">
                                <span>Ca</span><span>Sản lượng</span><span>Báo cáo</span><span>NG</span>
                            </div>
                            {shiftData.map(item => (
                                <div className="executive-shift-row" key={item.shift}>
                                    <strong className="executive-shift-name">{item.shift}</strong>
                                    <div className="executive-mini-metric">
                                        <strong>{formatNumber(item.total)}</strong>
                                        <div><i style={{ width: `${Math.max(3, (item.total / maxShiftOutput) * 100)}%` }} /></div>
                                    </div>
                                    <span>{formatNumber(item.report_count)}</span>
                                    <strong className="executive-ng-value">{formatPercent(item.ngRate)}%</strong>
                                </div>
                            ))}
                        </div>
                    )}
                </article>
            </section>

            <section className="executive-bottom-grid">
                <article className="executive-panel executive-insights">
                    <div className="executive-panel-heading compact">
                        <div>
                            <span className="executive-section-kicker">ĐIỂM NỔI BẬT</span>
                            <h2>Thông tin điều hành</h2>
                        </div>
                    </div>
                    <div className="executive-insight-list">
                        <div><span>01</span><p><strong>{formatNumber(summary.pending_count)}</strong> báo cáo đang chờ phê duyệt.</p></div>
                        <div><span>02</span><p>{topProcess ? <><strong>{topProcess.name}</strong> dẫn đầu với {formatNumber(topProcess.total)} sản phẩm.</> : "Chưa có công đoạn phát sinh sản lượng."}</p></div>
                        <div><span>03</span><p>{topShift ? <><strong>Ca {topShift.shift}</strong> có sản lượng cao nhất: {formatNumber(topShift.total)}.</> : "Chưa có dữ liệu theo ca."}</p></div>
                        <div><span>04</span><p>{highestNgShift ? <>Tỷ lệ NG cao nhất thuộc <strong>ca {highestNgShift.shift}</strong>: {formatPercent(highestNgShift.ngRate)}%.</> : "Chưa có dữ liệu chất lượng theo ca."}</p></div>
                    </div>
                </article>

                <article className="executive-panel executive-actions-panel">
                    <div className="executive-panel-heading compact">
                        <div>
                            <span className="executive-section-kicker">TÁC VỤ</span>
                            <h2>Điều hành nhanh</h2>
                        </div>
                    </div>
                    <div className="executive-action-list">
                        <button type="button" onClick={() => navigate(`${basePath}/reports`)}><AppIcon name="pending" size={19} /><span><strong>Duyệt báo cáo</strong><small>Xử lý dữ liệu đang chờ</small></span><b>→</b></button>
                        <button type="button" onClick={() => navigate(`${basePath}/approved`)}><AppIcon name="approved" size={19} /><span><strong>Báo cáo đã duyệt</strong><small>Tra cứu dữ liệu chính thức</small></span><b>→</b></button>
                        <button type="button" onClick={() => navigate(`${basePath}/master`)}><AppIcon name="settings" size={19} /><span><strong>Trung tâm quản lý</strong><small>Quản trị dữ liệu sản xuất</small></span><b>→</b></button>
                    </div>
                </article>
            </section>
        </main>
    );
}

export default Dashboard;
