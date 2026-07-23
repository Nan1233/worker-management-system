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

const normalizeText = (value?: string) =>
    String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

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
    const basePath =
        currentUser?.role === "admin"
            ? "/admin"
            : currentUser?.role === "lead"
                ? "/lead"
                : "/manager";

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

    const isReportInScope = (report: ProductionReport) => {
        const reportId = Number(report.process_id || 0);
        const reportCode = normalizeText(report.process_code);
        const reportName = normalizeText(report.process_name);
        return processes.some(process =>
            Number(process.id) === reportId ||
            (reportCode && normalizeText(process.process_code) === reportCode) ||
            (reportName && normalizeText(process.process_name) === reportName)
        );
    };

    const scopedPendingReports = useMemo(
        () => pendingReports.filter(isReportInScope),
        [pendingReports, processes]
    );

    const scopedReports = useMemo(
        () => reports.filter(isReportInScope),
        [reports, processes]
    );

    const metrics = useMemo(() => {
        const totalOK = scopedReports.reduce((sum, item) => sum + Number(item.tt_ok || 0), 0);
        const totalNG = scopedReports.reduce((sum, item) => sum + Number(item.tt_ng || 0), 0);
        const total = totalOK + totalNG;
        const ngRate = total > 0 ? (totalNG / total) * 100 : 0;
        return { totalOK, totalNG, total, ngRate };
    }, [scopedReports]);

    const processData = useMemo(() => {
        const allowedById = new Map<number, ProcessOption>();
        const allowedByCode = new Map<string, ProcessOption>();
        const allowedByName = new Map<string, ProcessOption>();

        processes.forEach(process => {
            allowedById.set(Number(process.id), process);
            const code = normalizeText(process.process_code);
            const name = normalizeText(process.process_name);
            if (code) allowedByCode.set(code, process);
            if (name) allowedByName.set(name, process);
        });

        const data = new Map<number, {
            id: number;
            code?: string;
            name: string;
            ok: number;
            ng: number;
            count: number;
        }>();

        processes.forEach(process => {
            data.set(Number(process.id), {
                id: Number(process.id),
                code: process.process_code,
                name: process.process_name,
                ok: 0,
                ng: 0,
                count: 0
            });
        });

        scopedReports.forEach(report => {
            const reportId = Number(report.process_id || 0);
            const reportCode = normalizeText(report.process_code);
            const reportName = normalizeText(report.process_name);
            const allowedProcess =
                allowedById.get(reportId) ||
                allowedByCode.get(reportCode) ||
                allowedByName.get(reportName);

            // Chỉ tổng hợp các công đoạn mà API đã trả về theo quyền của tài khoản.
            if (!allowedProcess) return;

            const current = data.get(Number(allowedProcess.id));
            if (!current) return;
            current.ok += Number(report.tt_ok || 0);
            current.ng += Number(report.tt_ng || 0);
            current.count += 1;
        });

        return Array.from(data.values()).sort((a, b) =>
            a.name.localeCompare(b.name, "vi", { numeric: true })
        );
    }, [processes, scopedReports]);

    const shiftData = useMemo(() => {
        const shiftMap = new Map<string, { shift: string; ok: number; ng: number; count: number }>();
        scopedReports.forEach(report => {
            const shift = String(report.shift || "Chưa xác định").trim() || "Chưa xác định";
            const current = shiftMap.get(shift) || { shift, ok: 0, ng: 0, count: 0 };
            current.ok += Number(report.tt_ok || 0);
            current.ng += Number(report.tt_ng || 0);
            current.count += 1;
            shiftMap.set(shift, current);
        });
        return Array.from(shiftMap.values()).sort((a, b) =>
            a.shift.localeCompare(b.shift, "vi", { numeric: true })
        );
    }, [scopedReports]);

    const maxProcessOutput = Math.max(1, ...processData.map(item => item.ok + item.ng));
    const maxShiftOutput = Math.max(1, ...shiftData.map(item => item.ok + item.ng));

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
                    <h1>Tổng quan sản xuất</h1>
                </div>

                <div className="dashboard-header-actions">
                    <label className="dashboard-period-filter" aria-label="Khoảng thời gian">
                        <select value={period} onChange={(event) => setPeriod(event.target.value as PeriodKey)}>
                            {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </label>
                </div>
            </header>

            <section className="dashboard-kpi-grid">
                <article className="dashboard-kpi-card">
                    <div className="dashboard-kpi-icon"><AppIcon name="pending" size={24} /></div>
                    <div>
                        <span>Chờ duyệt</span>
                        <strong>{formatNumber(scopedPendingReports.length)}</strong>
                    </div>
                </article>

                <article className="dashboard-kpi-card success">
                    <div className="dashboard-kpi-icon"><AppIcon name="ok" size={24} /></div>
                    <div>
                        <span>Sản lượng OK</span>
                        <strong>{formatNumber(metrics.totalOK)}</strong>
                    </div>
                </article>

                <article className="dashboard-kpi-card danger">
                    <div className="dashboard-kpi-icon"><AppIcon name="warning" size={24} /></div>
                    <div>
                        <span>Tỷ lệ NG</span>
                        <strong>{metrics.ngRate.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%</strong>
                        <small>{formatNumber(metrics.totalNG)} sản phẩm NG</small>
                    </div>
                </article>

                <article className="dashboard-kpi-card info">
                    <div className="dashboard-kpi-icon"><AppIcon name="approved" size={24} /></div>
                    <div>
                        <span>Báo cáo đã duyệt</span>
                        <strong>{formatNumber(scopedReports.length)}</strong>
                        <small>{processData.filter(item => item.count > 0).length}/{processData.length} công đoạn có dữ liệu</small>
                    </div>
                </article>
            </section>

            <section className="dashboard-content-grid">
                <article className="dashboard-panel dashboard-chart-panel">
                    <div className="dashboard-panel-heading">
                        <div>
                            <h2>Sản lượng theo công đoạn</h2>
                        </div>
                    </div>

                    <div className="dashboard-process-chart">
                        {processData.length === 0 ? (
                            <div className="dashboard-empty">Chưa có dữ liệu công đoạn</div>
                        ) : processData.map(item => (
                            <div className="dashboard-chart-row" key={item.id}>
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
                            <h2>Sản lượng theo ca</h2>
                        </div>
                    </div>

                    <div className="dashboard-shift-chart">
                        {shiftData.length === 0 ? (
                            <div className="dashboard-empty">Chưa có dữ liệu theo ca</div>
                        ) : shiftData.map(item => {
                            const total = item.ok + item.ng;
                            return (
                                <div className="dashboard-shift-item" key={item.shift}>
                                    <div className="dashboard-shift-value">{formatNumber(total)}</div>
                                    <div className="dashboard-shift-track" title={`Tổng ${total} - OK ${item.ok} - NG ${item.ng}`}>
                                        <div
                                            className="dashboard-shift-stack"
                                            style={{ height: `${Math.max(8, (total / maxShiftOutput) * 100)}%` }}
                                        >
                                            <span
                                                className="dashboard-shift-ok"
                                                style={{ height: `${total > 0 ? (item.ok / total) * 100 : 0}%` }}
                                            />
                                            <span
                                                className="dashboard-shift-ng"
                                                style={{ height: `${total > 0 ? (item.ng / total) * 100 : 0}%` }}
                                            />
                                        </div>
                                    </div>
                                    <strong>Ca {item.shift}</strong>
                                    <small><i className="shift-dot ok" />OK {formatNumber(item.ok)}</small>
                                    <small><i className="shift-dot ng" />NG {formatNumber(item.ng)}</small>
                                </div>
                            );
                        })}
                    </div>
                </article>
            </section>

            <section className="dashboard-quick-actions">
                <button type="button" onClick={() => navigate(`${basePath}/reports`)}>
                    <span className="dashboard-quick-icon"><AppIcon name="pending" size={24} /></span>
                    <strong>Duyệt báo cáo</strong>
                </button>
                <button type="button" onClick={() => navigate(`${basePath}/approved`)}>
                    <span className="dashboard-quick-icon"><AppIcon name="approved" size={24} /></span>
                    <strong>Báo cáo đã duyệt</strong>
                </button>
                <button type="button" onClick={() => navigate(`${basePath}/master`)}>
                    <span className="dashboard-quick-icon"><AppIcon name="settings" size={24} /></span>
                    <strong>Trung tâm quản lý</strong>
                </button>
            </section>
        </main>
    );
}

export default Dashboard;
