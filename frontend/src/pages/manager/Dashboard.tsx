import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getReports } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import { getApiError } from "../../utils/apiError";
import { useToast } from "../../components/feedback/toastContext";

import "./Dashboard.css";

const formatNumber = (value: number) =>
    value.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

function Dashboard() {
    const navigate = useNavigate();
    const toast = useToast();

    const [reports, setReports] = useState<ProductionReport[]>([]);
    const [loading, setLoading] = useState(true);

    const savedUser = localStorage.getItem("user");
    const currentUser = savedUser ? JSON.parse(savedUser) : null;
    const basePath = currentUser?.role === "lead" ? "/lead" : "/manager";

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                const data = await getReports();
                setReports(Array.isArray(data) ? data : []);
            } catch (error) {
                toast.showToast(getApiError(error, "Không thể tải dữ liệu dashboard").message, "error");
            } finally {
                setLoading(false);
            }
        };

        void loadData();
    }, [toast]);

    const metrics = useMemo(() => {
        const totalOK = reports.reduce((sum, item) => sum + Number(item.tt_ok || 0), 0);
        const totalNG = reports.reduce((sum, item) => sum + Number(item.tt_ng || 0), 0);
        const total = totalOK + totalNG;
        const ngRate = total > 0 ? (totalNG / total) * 100 : 0;
        const workers = new Set(reports.map(item => item.worker_code).filter(Boolean)).size;

        return { totalOK, totalNG, total, ngRate, workers };
    }, [reports]);

    const processData = useMemo(() => {
        const map = new Map<string, { ok: number; ng: number; count: number }>();

        reports.forEach(report => {
            const name = report.process_name || "Chưa xác định";
            const current = map.get(name) || { ok: 0, ng: 0, count: 0 };
            current.ok += Number(report.tt_ok || 0);
            current.ng += Number(report.tt_ng || 0);
            current.count += 1;
            map.set(name, current);
        });

        return Array.from(map.entries())
            .map(([name, value]) => ({ name, ...value }))
            .sort((a, b) => b.ok - a.ok);
    }, [reports]);

    const shiftData = useMemo(() => {
        const shifts = ["A", "B", "C", "D"];
        return shifts.map(shift => ({
            shift,
            count: reports.filter(report => report.shift === shift).length
        }));
    }, [reports]);

    const maxProcessOutput = Math.max(1, ...processData.map(item => item.ok + item.ng));
    const maxShiftCount = Math.max(1, ...shiftData.map(item => item.count));

    if (loading) {
        return (
            <div className="manager-dashboard">
                <div className="dashboard-skeleton dashboard-skeleton-title" />
                <div className="dashboard-kpi-grid">
                    {[1, 2, 3, 4].map(item => (
                        <div key={item} className="dashboard-skeleton dashboard-skeleton-card" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <main className="manager-dashboard">
            <header className="manager-dashboard-header">
                <div>
                    <span className="dashboard-eyebrow">TRUNG TÂM ĐIỀU HÀNH SẢN XUẤT</span>
                    <h1>Tổng quan sản xuất</h1>
                    <p>Theo dõi nhanh sản lượng, chất lượng và báo cáo đang chờ xử lý.</p>
                </div>

                <div className="dashboard-header-actions">
                    <button type="button" onClick={() => navigate(`${basePath}/reports`)}>
                        Xem báo cáo chờ duyệt
                    </button>
                    <button type="button" className="secondary" onClick={() => navigate(`${basePath}/approved`)}>
                        Báo cáo đã duyệt
                    </button>
                </div>
            </header>

            <section className="dashboard-kpi-grid">
                <article className="dashboard-kpi-card">
                    <div className="dashboard-kpi-icon">📋</div>
                    <div>
                        <span>Chờ duyệt</span>
                        <strong>{formatNumber(reports.length)}</strong>
                        <small>{metrics.workers} công nhân có báo cáo</small>
                    </div>
                </article>

                <article className="dashboard-kpi-card success">
                    <div className="dashboard-kpi-icon">✓</div>
                    <div>
                        <span>Sản lượng OK</span>
                        <strong>{formatNumber(metrics.totalOK)}</strong>
                        <small>{formatNumber(metrics.total)} tổng sản lượng</small>
                    </div>
                </article>

                <article className="dashboard-kpi-card danger">
                    <div className="dashboard-kpi-icon">!</div>
                    <div>
                        <span>Sản lượng NG</span>
                        <strong>{formatNumber(metrics.totalNG)}</strong>
                        <small>Tỷ lệ NG {metrics.ngRate.toFixed(2)}%</small>
                    </div>
                </article>

                <article className="dashboard-kpi-card info">
                    <div className="dashboard-kpi-icon">⚙</div>
                    <div>
                        <span>Công đoạn hoạt động</span>
                        <strong>{processData.length}</strong>
                        <small>Dữ liệu từ báo cáo hiện tại</small>
                    </div>
                </article>
            </section>

            <section className="dashboard-content-grid">
                <article className="dashboard-panel dashboard-chart-panel">
                    <div className="dashboard-panel-heading">
                        <div>
                            <h2>Sản lượng theo công đoạn</h2>
                            <p>So sánh TT OK và TT NG của từng công đoạn.</p>
                        </div>
                    </div>

                    <div className="dashboard-process-chart">
                        {processData.length === 0 ? (
                            <div className="dashboard-empty">Chưa có dữ liệu công đoạn</div>
                        ) : processData.map(item => (
                            <div className="dashboard-chart-row" key={item.name}>
                                <div className="dashboard-chart-label">
                                    <strong>{item.name}</strong>
                                    <span>{item.count} báo cáo</span>
                                </div>
                                <div className="dashboard-stacked-track" title={`OK ${item.ok} - NG ${item.ng}`}>
                                    <span
                                        className="dashboard-bar-ok"
                                        style={{ width: `${(item.ok / maxProcessOutput) * 100}%` }}
                                    />
                                    <span
                                        className="dashboard-bar-ng"
                                        style={{ width: `${(item.ng / maxProcessOutput) * 100}%` }}
                                    />
                                </div>
                                <div className="dashboard-chart-value">
                                    <strong>{formatNumber(item.ok)}</strong>
                                    <span>NG {formatNumber(item.ng)}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="dashboard-legend">
                        <span><i className="legend-ok" />TT OK</span>
                        <span><i className="legend-ng" />TT NG</span>
                    </div>
                </article>

                <article className="dashboard-panel">
                    <div className="dashboard-panel-heading">
                        <div>
                            <h2>Báo cáo theo ca</h2>
                            <p>Số báo cáo đang chờ duyệt.</p>
                        </div>
                    </div>

                    <div className="dashboard-shift-chart">
                        {shiftData.map(item => (
                            <div className="dashboard-shift-item" key={item.shift}>
                                <div className="dashboard-shift-value">{item.count}</div>
                                <div className="dashboard-shift-track">
                                    <span style={{ height: `${Math.max(8, (item.count / maxShiftCount) * 100)}%` }} />
                                </div>
                                <strong>Ca {item.shift}</strong>
                            </div>
                        ))}
                    </div>
                </article>
            </section>

            <section className="dashboard-quick-actions">
                <button type="button" onClick={() => navigate(`${basePath}/reports`)}>
                    <span>📋</span>
                    <div><strong>Duyệt báo cáo</strong><small>Kiểm tra và xử lý báo cáo chờ</small></div>
                </button>
                <button type="button" onClick={() => navigate(`${basePath}/workers`)}>
                    <span>👥</span>
                    <div><strong>Danh sách công nhân</strong><small>Theo dõi nhân sự và công đoạn</small></div>
                </button>
                <button type="button" onClick={() => navigate(`${basePath}/statistics`)}>
                    <span>📈</span>
                    <div><strong>Thống kê</strong><small>Xem xu hướng sản lượng và chất lượng</small></div>
                </button>
            </section>
        </main>
    );
}

export default Dashboard;
