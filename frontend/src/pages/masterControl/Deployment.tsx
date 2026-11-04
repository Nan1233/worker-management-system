import { Rocket, GitCommit, Server, Globe, RefreshCw } from "lucide-react";
import { masterControlApi } from "../../services/masterControlService";
import { Badge, ControlDenied, ControlError, ControlLoading, PageHeader } from "./ControlStates";
import { formatDateTime } from "./controlFormat";
import { useControlQuery } from "./useControlQuery";

export default function MasterControlDeployment() {
    const health = useControlQuery(() => masterControlApi.health(), "deployment-health");
    const config = useControlQuery(() => masterControlApi.configuration(), "deployment-config");
    const environment = health.data?.runtime.environment || "Chưa xác định";
    return <div>
        <PageHeader title="Deployment Center" description="Thông tin build đang được API runtime công bố. Trang chưa có quyền điều khiển deploy/rollback Cloudflare hoặc xác minh phiên bản frontend." actions={<button type="button" className="mcc-btn" onClick={() => { health.reload(); config.reload(); }} disabled={health.loading || config.loading}><RefreshCw size={14}/> Làm mới</button>} />
        {(health.loading && !health.data) || (config.loading && !config.data) ? <ControlLoading /> : null}
        {health.forbidden || config.forbidden ? <ControlDenied /> : health.error ? <ControlError message={health.error} onRetry={health.reload} /> : config.error ? <ControlError message={config.error} onRetry={config.reload} /> : null}
        {health.data ? <>
            <div className="mcc-grid mcc-grid-3">
                <div className="mcc-card mcc-kpi"><div className="mcc-kpi-label"><Server size={14}/> API runtime</div><div className="mcc-kpi-value" style={{fontSize:18}}>{health.data.api.status}</div><div className="mcc-kpi-sub">{environment}</div></div>
                <div className="mcc-card mcc-kpi"><div className="mcc-kpi-label"><GitCommit size={14}/> Backend version</div><div className="mcc-kpi-value" style={{fontSize:18}}>{health.data.api.version}</div><div className="mcc-kpi-sub mcc-mono">{health.data.api.commit || "Commit chưa công bố"}</div></div>
                <div className="mcc-card mcc-kpi"><div className="mcc-kpi-label"><Globe size={14}/> Database readiness</div><div className="mcc-kpi-value" style={{fontSize:18}}>{health.data.readiness.ready === true ? "Ready" : health.data.readiness.ready === false ? "Not ready" : "Unknown"}</div><div className="mcc-kpi-sub">{health.data.database.status === "ok" ? `DB ${health.data.database.latencyMs} ms` : "DB unavailable"}</div></div>
            </div>
            <div className="mcc-card mcc-section"><div className="mcc-card-head"><h2>Backend deployment đang phục vụ request này</h2><Badge tone="success">Runtime response</Badge></div><div className="mcc-card-body"><dl className="mcc-dl">
                <dt>API version</dt><dd>{health.data.api.version}</dd>
                <dt>Commit SHA</dt><dd className="mcc-mono">{health.data.api.commit || "—"}</dd>
                <dt>API version contract</dt><dd>{health.data.api.apiVersion}</dd>
                <dt>Environment</dt><dd>{environment}</dd>
                <dt>Readiness</dt><dd>{health.data.readiness.schemaStatus || "Chưa có thông tin"}</dd>
                <dt>Thời điểm kiểm tra</dt><dd>{formatDateTime(health.data.generatedAt)}</dd>
            </dl></div></div>
        </> : null}
        {config.data ? <div className="mcc-card mcc-section"><div className="mcc-card-head"><h2>Deployment configuration snapshot</h2><Badge>Chỉ xem</Badge></div><div className="mcc-card-body"><p>Nguồn cấu hình: {config.data.source}. {config.data.items.length} mục cấu hình được runtime công bố (secret được ẩn).</p></div></div> : null}
        <div className="mcc-notice mcc-notice-warning mcc-section"><Rocket size={16}/><span>Cloudflare deployment ID, traffic percentage, frontend version, deploy history và rollback chưa được nối API. Không hiển thị trạng thái thành công giả và không cho phép deploy/rollback từ trang này.</span></div>
    </div>;
}
