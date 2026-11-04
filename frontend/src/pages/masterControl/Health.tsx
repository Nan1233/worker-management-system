import { RefreshCw } from "lucide-react";
import { masterControlApi } from "../../services/masterControlService";
import { Badge, ControlDenied, ControlEmpty, ControlError, ControlLoading, PageHeader } from "./ControlStates";
import { formatDateTime, formatNumber } from "./controlFormat";
import { useControlQuery } from "./useControlQuery";

export default function MasterControlHealth() {
    const { data, loading, error, forbidden, reload } = useControlQuery(() => masterControlApi.health(), "health");
    return <div>
        <PageHeader title="System Health" description="Đo trực tiếp khi tải trang. Chỉ số HTTP/bộ nhớ thuộc tiến trình hoặc Worker isolate đang phục vụ, không phải toàn cụm." actions={<button type="button" className="mcc-btn" onClick={reload} disabled={loading}><RefreshCw size={14} aria-hidden="true" />Đo lại</button>} />
        {loading && !data ? <ControlLoading /> : null}
        {forbidden ? <ControlDenied /> : error ? <ControlError message={error} onRetry={reload} /> : null}
        {data && !error ? <>
            <div className="mcc-grid mcc-grid-3">
                <div className="mcc-card mcc-kpi"><div className="mcc-kpi-label">API</div><div className="mcc-kpi-value" style={{ fontSize: 18 }}>v{data.api.version}</div><div className="mcc-kpi-sub">commit {data.api.commit} · API v{data.api.apiVersion}</div></div>
                <div className="mcc-card mcc-kpi"><div className="mcc-kpi-label">Database</div><div className="mcc-kpi-value" style={{ fontSize: 18 }}>{data.database.status === "ok" ? `${data.database.latencyMs} ms` : "Unavailable"}</div><div className="mcc-kpi-sub">{data.database.status === "ok" ? <Badge tone="success">SELECT 1 OK</Badge> : <Badge tone="danger">{data.database.errorCode}</Badge>}</div></div>
                <div className="mcc-card mcc-kpi"><div className="mcc-kpi-label">Readiness</div><div className="mcc-kpi-value" style={{ fontSize: 18 }}>{data.readiness.schemaStatus || "—"}</div><div className="mcc-kpi-sub">{data.readiness.ready ? <Badge tone="success">Ready</Badge> : data.readiness.ready === false ? <Badge tone="danger">Not ready</Badge> : <Badge>Chưa xác minh</Badge>} · schema contract v{data.schema.contractVersion}</div></div>
            </div>
            <div className="mcc-grid mcc-grid-2 mcc-section">
                <div className="mcc-card"><div className="mcc-card-head"><h2>Runtime</h2></div><div className="mcc-card-body"><dl className="mcc-dl">
                    <dt>Nền tảng</dt><dd>{data.runtime.platform}</dd>
                    <dt>Node</dt><dd className="mcc-mono">{data.runtime.node}</dd>
                    <dt>Môi trường</dt><dd>{data.runtime.environment || "—"}</dd>
                    <dt>Maintenance</dt><dd>{data.runtime.maintenanceMode || "Tắt"}</dd>
                    <dt>Khởi động</dt><dd>{formatDateTime(data.metrics.startedAt)} ({formatNumber(data.metrics.uptimeSeconds)} giây)</dd>
                    <dt>Bộ nhớ</dt><dd className="mcc-mono">RSS {data.metrics.memory.rssMb} MB · heap {data.metrics.memory.heapUsedMb}/{data.metrics.memory.heapTotalMb} MB</dd>
                    <dt>Phạm vi chỉ số</dt><dd>{data.runtime.metricsScope}</dd>
                    <dt>Deployment</dt><dd className="mcc-muted">Trạng thái build/deploy Cloudflare không truy cập được từ runtime — Not available.</dd>
                </dl></div></div>
                <div className="mcc-card"><div className="mcc-card-head"><h2>HTTP</h2></div><div className="mcc-card-body"><dl className="mcc-dl">
                    <dt>Requests</dt><dd className="mcc-mono">{formatNumber(data.metrics.http.requests)}</dd>
                    <dt>4xx / 5xx</dt><dd className="mcc-mono">{formatNumber(data.metrics.http.errors4xx)} / {formatNumber(data.metrics.http.errors5xx)}</dd>
                    <dt>Chậm (≥1s)</dt><dd className="mcc-mono">{formatNumber(data.metrics.http.slowRequests)}</dd>
                    <dt>p50 / p95 / max</dt><dd className="mcc-mono">{data.metrics.http.p50DurationMs} / {data.metrics.http.p95DurationMs} / {data.metrics.http.maxDurationMs} ms</dd>
                </dl></div></div>
            </div>
            <div className="mcc-card mcc-section"><div className="mcc-card-head"><div><h2>Lỗi gần đây</h2><p>Tối đa 20 lỗi gần nhất của tiến trình/isolate này</p></div></div>
                {data.metrics.recentErrors.length ? <div className="mcc-card-body"><pre className="mcc-pre">{JSON.stringify(data.metrics.recentErrors, null, 2)}</pre></div> : <div className="mcc-card-body"><ControlEmpty title="Không có lỗi được ghi nhận trong tiến trình này" /></div>}
            </div>
        </> : null}
    </div>;
}
