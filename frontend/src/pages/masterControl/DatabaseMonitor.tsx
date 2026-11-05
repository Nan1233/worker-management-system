import { useMemo } from "react";
import { Database, Gauge, HardDrive, RefreshCw } from "lucide-react";
import { masterControlApi } from "../../services/masterControlService";
import { Badge, ControlDenied, ControlEmpty, ControlError, ControlLoading, PageHeader } from "./ControlStates";
import { formatNumber } from "./controlFormat";
import { useControlQuery } from "./useControlQuery";

const bytes = (value: number | null | undefined) => {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n <= 0) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let amount = n, unit = 0;
    while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit++; }
    return `${amount.toFixed(1)} ${units[unit]}`;
};

export default function MasterControlDatabaseMonitor() {
    const health = useControlQuery(() => masterControlApi.health(), "database-monitor-health");
    const tables = useControlQuery(() => masterControlApi.tables(), "database-monitor-tables");
    const stats = useMemo(() => {
        const list = tables.data?.tables || [];
        return {
            count: list.length,
            rows: list.reduce((sum, item) => sum + Number(item.estimated_rows || 0), 0),
            data: list.reduce((sum, item) => sum + Number(item.data_bytes || 0), 0),
            indexes: list.reduce((sum, item) => sum + Number(item.index_bytes || 0), 0),
            largest: [...list].sort((a, b) => Number(b.data_bytes || 0) - Number(a.data_bytes || 0)).slice(0, 10),
        };
    }, [tables.data]);

    return <div>
        <PageHeader title="Database Monitor" description="Giám sát chỉ số kết nối và metadata dung lượng từ information_schema. Không chạy truy vấn tùy ý, không đọc nội dung bản ghi." actions={<button type="button" className="mcc-btn" onClick={() => { health.reload(); tables.reload(); }} disabled={health.loading || tables.loading}><RefreshCw size={14}/> Làm mới</button>} />
        {(health.loading && !health.data) || (tables.loading && !tables.data) ? <ControlLoading /> : null}
        {health.forbidden || tables.forbidden ? <ControlDenied /> : health.error ? <ControlError message={health.error} onRetry={health.reload}/> : tables.error ? <ControlError message={tables.error} onRetry={tables.reload}/> : null}
        {health.data && tables.data ? <>
            <div className="mcc-grid mcc-grid-3">
                <div className="mcc-card mcc-kpi"><div className="mcc-kpi-label"><Database size={14}/> Kết nối database</div><div className="mcc-kpi-value" style={{fontSize:18}}>{health.data.database.status === "ok" ? "Connected" : "Unavailable"}</div><div className="mcc-kpi-sub">{health.data.database.status === "ok" ? `SELECT probe ${health.data.database.latencyMs} ms` : health.data.database.errorCode}</div></div>
                <div className="mcc-card mcc-kpi"><div className="mcc-kpi-label"><Gauge size={14}/> Số bảng</div><div className="mcc-kpi-value">{stats.count}</div><div className="mcc-kpi-sub">Metadata information_schema</div></div>
                <div className="mcc-card mcc-kpi"><div className="mcc-kpi-label"><HardDrive size={14}/> Dung lượng ước tính</div><div className="mcc-kpi-value" style={{fontSize:18}}>{bytes(stats.data + stats.indexes)}</div><div className="mcc-kpi-sub">Data {bytes(stats.data)} · Index {bytes(stats.indexes)}</div></div>
            </div>
            <div className="mcc-card mcc-section"><div className="mcc-card-head"><div><h2>Bảng có dung lượng lớn</h2><p>Tổng số dòng ước tính: {formatNumber(stats.rows)} · Không phải COUNT(*) chính xác</p></div><Badge tone="info">Metadata only</Badge></div>
                {stats.largest.length ? <div className="mcc-table-wrap"><table className="mcc-table"><thead><tr><th>Bảng</th><th>Dòng ước tính</th><th>Data</th><th>Index</th><th>Tổng</th></tr></thead><tbody>{stats.largest.map((item) => <tr key={item.name}><td className="mcc-mono">{item.name}</td><td className="mcc-mono">{formatNumber(item.estimated_rows)}</td><td className="mcc-mono">{bytes(item.data_bytes)}</td><td className="mcc-mono">{bytes(item.index_bytes)}</td><td className="mcc-mono">{bytes(Number(item.data_bytes || 0) + Number(item.index_bytes || 0))}</td></tr>)}</tbody></table></div> : <div className="mcc-card-body"><ControlEmpty title="Không có metadata bảng" /></div>}
            </div>
            <div className="mcc-card mcc-section"><div className="mcc-card-head"><h2>Readiness & giới hạn truy cập</h2></div><ul className="mcc-list">
                <li><span>Schema readiness</span>{health.data.readiness.ready === true ? <Badge tone="success">Ready</Badge> : health.data.readiness.ready === false ? <Badge tone="danger">Not ready</Badge> : <Badge>Unknown</Badge>}</li>
                <li><span>SQL console tùy ý</span><Badge tone={tables.data.sqlConsole.enabled ? "success" : "neutral"}>{tables.data.sqlConsole.enabled ? "Enabled" : "Disabled"}</Badge></li>
                <li><span>Lý do giới hạn</span><span className="mcc-mono">{tables.data.sqlConsole.reason}</span></li>
            </ul></div>
        </> : null}
    </div>;
}
