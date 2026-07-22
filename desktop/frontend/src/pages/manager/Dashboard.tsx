import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getApprovedReportsByDate, getTempReportsByDate } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import { getApiError } from "../../utils/apiError";
import { useToast } from "../../components/feedback/toastContext";
import api from "../../api/axios";

import AppIcon from "../../components/common/AppIcon";
import "./Dashboard.css";

const formatNumber = (value: number) =>
    value.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

type ProcessOption = { id: number; process_code?: string; process_name: string };

const DEFAULT_PROCESS_CATALOG: ProcessOption[] = [
    { id: -1, process_code: "GC", process_name: "Gia công" },
    { id: -2, process_code: "MAI", process_name: "Mài" },
    { id: -3, process_code: "K1", process_name: "Kiểm 1" },
    { id: -4, process_code: "K2", process_name: "Kiểm 2" }
];

const normalizeText = (value?: string) =>
    String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

const getCanonicalProcess = (process?: Partial<ProcessOption> & { process_id?: number }) => {
    const code = normalizeText(process?.process_code).replace(/\s+/g, "_");
    const name = normalizeText(process?.process_name);

    const isGiaCong =
        ["gc", "cat_long", "catlong", "gia_cong", "giacong"].includes(code) ||
        name === "gia cong" ||
        name.includes("gia cong") ||
        (name.includes("cat") && name.includes("long"));

    if (isGiaCong) {
        return { key: "GC", name: "Gia công", order: 0 };
    }
    if (["mai"].includes(code) || name === "mai") {
        return { key: "MAI", name: "Mài", order: 1 };
    }
    if (["k1", "kiem_1", "kiem1"].includes(code) || ["kiem 1", "kiem lan 1"].includes(name)) {
        return { key: "K1", name: "Kiểm 1", order: 2 };
    }
    if (["k2", "kiem_2", "kiem2"].includes(code) || ["kiem 2", "kiem lan 2"].includes(name)) {
        return { key: "K2", name: "Kiểm 2", order: 3 };
    }

    const fallback = code || name || `PROCESS_${process?.process_id || process?.id || "UNKNOWN"}`;
    return { key: fallback.toUpperCase(), name: process?.process_name || "Chưa xác định", order: 100 };
};

const toLocalDate = (date: Date): string => {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60_000).toISOString().split("T")[0];
};

type PeriodKey = "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth";

const getPeriodDates = (period: PeriodKey): string[] => {
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

    const dates: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
        dates.push(toLocalDate(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
};

const PERIOD_LABELS: Record<PeriodKey, string> = {
    today: "Hôm nay",
    yesterday: "Hôm qua",
    last7: "7 ngày gần nhất",
    thisMonth: "Tháng này",
    lastMonth: "Tháng trước"
};

function Dashboard() {
    const navigate = useNavigate();
    const toast = useToast();

    const [pendingReports, setPendingReports] = useState<ProductionReport[]>([]);
    const [reports, setReports] = useState<ProductionReport[]>([]);
    const [processes, setProcesses] = useState<ProcessOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState<PeriodKey>("today");

    const savedUser = localStorage.getItem("user");
    const currentUser = savedUser ? JSON.parse(savedUser) : null;
    const basePath = currentUser?.role === "lead" ? "/lead" : "/manager";

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                const dates = getPeriodDates(period);
                const [pendingResults, approvedResults, processResponse] = await Promise.all([
                    Promise.all(dates.map(date => getTempReportsByDate(date))),
                    Promise.all(dates.map(date => getApprovedReportsByDate(date))),
                    api.get("/users/options/processes")
                ]);
                setPendingReports(pendingResults.flat().filter(Boolean));
                setReports(approvedResults.flat().filter(Boolean));
                setProcesses(Array.isArray(processResponse.data?.data) ? processResponse.data.data : []);
            } catch (error) {
                toast.showToast(getApiError(error, "Không thể tải dữ liệu dashboard").message, "error");
            } finally {
                setLoading(false);
            }
        };

        void loadData();
    }, [period, toast]);

    const metrics = useMemo(() => {
        const totalOK = reports.reduce((sum, item) => sum + Number(item.tt_ok || 0), 0);
        const totalNG = reports.reduce((sum, item) => sum + Number(item.tt_ng || 0), 0);
        const total = totalOK + totalNG;
        const ngRate = total > 0 ? (totalNG / total) * 100 : 0;
        const workers = new Set(pendingReports.map(item => item.worker_code).filter(Boolean)).size;

        return { totalOK, totalNG, total, ngRate, workers };
    }, [reports, pendingReports]);

    const processData = useMemo(() => {
        const map = new Map<string, {
            id?: number;
            code?: string;
            name: string;
            order: number;
            ok: number;
            ng: number;
            count: number;
        }>();

        // Luôn giữ đủ 4 công đoạn demo, sau đó ghép với danh mục thật từ DB.
        [...DEFAULT_PROCESS_CATALOG, ...processes].forEach(process => {
            const canonical = getCanonicalProcess(process);
            // Dashboard demo chỉ có 4 công đoạn chuẩn. Bỏ các bản ghi cũ/không xác định
            // để không tạo thêm dòng trùng hoặc công đoạn ngoài phạm vi demo.
            if (canonical.order > 3) return;
            const current = map.get(canonical.key);
            map.set(canonical.key, {
                id: current?.id && current.id > 0 ? current.id : process.id,
                code: canonical.key,
                name: canonical.name,
                order: canonical.order,
                ok: current?.ok || 0,
                ng: current?.ng || 0,
                count: current?.count || 0
            });
        });

        reports.forEach(report => {
            const canonical = getCanonicalProcess({
                process_id: Number(report.process_id || 0),
                process_code: report.process_code,
                process_name: report.process_name
            });
            if (canonical.order > 3) return;
            const current = map.get(canonical.key) || {
                code: canonical.key,
                name: canonical.name,
                order: canonical.order,
                ok: 0,
                ng: 0,
                count: 0
            };
            current.ok += Number(report.tt_ok || 0);
            current.ng += Number(report.tt_ng || 0);
            current.count += 1;
            map.set(canonical.key, current);
        });

        return Array.from(map.values()).sort((a, b) => {
            if (a.order !== b.order) return a.order - b.order;
            return a.name.localeCompare(b.name, "vi");
        });
    }, [processes, reports]);

    const activeProcessCount = useMemo(
        () => processData.filter(item => item.count > 0).length,
        [processData]
    );

    const shiftData = useMemo(() => {
        const shifts = ["A", "B", "C", "D"];
        return shifts.map(shift => ({
            shift,
            count: pendingReports.filter(report => report.shift === shift).length
        }));
    }, [pendingReports]);

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
                    <p>Theo dõi sản lượng, chất lượng và báo cáo trong {PERIOD_LABELS[period].toLowerCase()}.</p>
                </div>

                <div className="dashboard-header-actions">
                    <label className="dashboard-period-filter">
                        <span>Thời gian</span>
                        <select value={period} onChange={(event) => setPeriod(event.target.value as PeriodKey)}>
                            {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </label>
                    <button type="button" onClick={() => navigate(`${basePath}/reports`)}>
                        <AppIcon name="pending" size={18} />
                        <span>Xem báo cáo chờ duyệt</span>
                    </button>
                    <button type="button" className="secondary" onClick={() => navigate(`${basePath}/approved`)}>
                        <AppIcon name="approved" size={18} />
                        <span>Báo cáo đã duyệt</span>
                    </button>
                </div>
            </header>

            <section className="dashboard-kpi-grid">
                <article className="dashboard-kpi-card">
                    <div className="dashboard-kpi-icon"><AppIcon name="pending" size={24} /></div>
                    <div>
                        <span>Chờ duyệt</span>
                        <strong>{formatNumber(pendingReports.length)}</strong>
                        <small>{metrics.workers} công nhân có báo cáo</small>
                    </div>
                </article>

                <article className="dashboard-kpi-card success">
                    <div className="dashboard-kpi-icon"><AppIcon name="ok" size={24} /></div>
                    <div>
                        <span>Sản lượng OK</span>
                        <strong>{formatNumber(metrics.totalOK)}</strong>
                        <small>{formatNumber(metrics.total)} tổng sản lượng</small>
                    </div>
                </article>

                <article className="dashboard-kpi-card danger">
                    <div className="dashboard-kpi-icon"><AppIcon name="warning" size={24} /></div>
                    <div>
                        <span>Sản lượng NG</span>
                        <strong>{formatNumber(metrics.totalNG)}</strong>
                        <small>Tỷ lệ NG {metrics.ngRate.toFixed(2)}%</small>
                    </div>
                </article>

                <article className="dashboard-kpi-card info">
                    <div className="dashboard-kpi-icon"><AppIcon name="settings" size={24} /></div>
                    <div>
                        <span>Tổng công đoạn</span>
                        <strong>{processData.length}</strong>
                        <small>{activeProcessCount} công đoạn có dữ liệu trong {PERIOD_LABELS[period].toLowerCase()}</small>
                    </div>
                </article>
            </section>

            <section className="dashboard-content-grid">
                <article className="dashboard-panel dashboard-chart-panel">
                    <div className="dashboard-panel-heading">
                        <div>
                            <h2>Sản lượng theo công đoạn</h2>
                            <p>So sánh TT OK và TT NG của từng công đoạn trong {PERIOD_LABELS[period].toLowerCase()}.</p>
                        </div>
                    </div>

                    <div className="dashboard-process-chart">
                        {processData.length === 0 ? (
                            <div className="dashboard-empty">Chưa có dữ liệu công đoạn</div>
                        ) : processData.map(item => (
                            <div className="dashboard-chart-row" key={item.code || item.name}>
                                <div className="dashboard-chart-label">
                                    <strong>{item.name}</strong>
                                    <span>{item.count > 0 ? `${item.count} báo cáo` : "Chưa có báo cáo"}</span>
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
                            <p>Số báo cáo đang chờ duyệt trong {PERIOD_LABELS[period].toLowerCase()}.</p>
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
                    <span className="dashboard-quick-icon"><AppIcon name="pending" size={24} /></span>
                    <div><strong>Duyệt báo cáo</strong><small>Kiểm tra và xử lý báo cáo chờ</small></div>
                </button>
                <button type="button" onClick={() => navigate(`${basePath}/workers`)}>
                    <span className="dashboard-quick-icon"><AppIcon name="workers" size={24} /></span>
                    <div><strong>Danh sách công nhân</strong><small>Theo dõi nhân sự và công đoạn</small></div>
                </button>
                <button type="button" onClick={() => navigate(`${basePath}/statistics`)}>
                    <span className="dashboard-quick-icon"><AppIcon name="statistics" size={24} /></span>
                    <div><strong>Thống kê</strong><small>Xem xu hướng sản lượng và chất lượng</small></div>
                </button>
            </section>
        </main>
    );
}

export default Dashboard;
