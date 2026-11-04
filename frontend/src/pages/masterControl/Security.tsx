import { useMemo } from "react";
import { ShieldAlert, ShieldCheck, Activity, LockKeyhole } from "lucide-react";
import { masterControlApi } from "../../services/masterControlService";
import { Badge, ControlDenied, ControlEmpty, ControlError, ControlLoading, PageHeader } from "./ControlStates";
import { formatDateTime } from "./controlFormat";
import { useControlQuery } from "./useControlQuery";

const SECURITY_EVENT = /(LOGIN|AUTH|TOKEN|PASSWORD|PERMISSION|DENIED|LOCKED|UNLOCKED|REVOK|SUSPICIOUS|SECURITY|SUPER_ADMIN)/i;

export default function MasterControlSecurity() {
    const query = useControlQuery(() => masterControlApi.audit({ page: 1, pageSize: 100 }), "security-events");
    const events = useMemo(() => (query.data?.items || []).filter((item) => SECURITY_EVENT.test(item.action) || SECURITY_EVENT.test(item.description || "")), [query.data]);
    const denied = events.filter((item) => /DENIED|FORBIDDEN|REJECT/i.test(item.action)).length;
    const accessChanges = events.filter((item) => /LOCK|UNLOCK|PERMISSION|ROLE/i.test(item.action)).length;
    const authEvents = events.filter((item) => /LOGIN|AUTH|TOKEN|PASSWORD/i.test(item.action)).length;

    return <div>
        <PageHeader title="Security Center" description="Tổng hợp sự kiện bảo mật từ activity_logs. Đây là dữ liệu audit đã được ghi nhận, không phải hệ thống phát hiện xâm nhập thời gian thực." actions={<Badge tone="info">Read-only</Badge>} />
        {query.loading && !query.data ? <ControlLoading /> : null}
        {query.forbidden ? <ControlDenied /> : query.error ? <ControlError message={query.error} onRetry={query.reload} /> : null}
        {query.data ? <>
            <div className="mcc-grid mcc-grid-3">
                <div className="mcc-card mcc-kpi"><div className="mcc-kpi-label"><ShieldAlert size={14} /> Sự kiện cần chú ý</div><div className="mcc-kpi-value">{events.length}</div><div className="mcc-kpi-sub">Trong tối đa 100 audit gần nhất</div></div>
                <div className="mcc-card mcc-kpi"><div className="mcc-kpi-label"><LockKeyhole size={14} /> Từ chối truy cập</div><div className="mcc-kpi-value">{denied}</div><div className="mcc-kpi-sub">Sự kiện DENIED / FORBIDDEN / REJECT</div></div>
                <div className="mcc-card mcc-kpi"><div className="mcc-kpi-label"><Activity size={14} /> Xác thực & phân quyền</div><div className="mcc-kpi-value">{authEvents + accessChanges}</div><div className="mcc-kpi-sub">{authEvents} xác thực · {accessChanges} thay đổi quyền/tài khoản</div></div>
            </div>
            <div className="mcc-card mcc-section">
                <div className="mcc-card-head"><div><h2>Sự kiện bảo mật gần đây</h2><p>Nguồn: audit log hiện có · tối đa 100 bản ghi mới nhất</p></div><button type="button" className="mcc-btn" onClick={query.reload} disabled={query.loading}>Làm mới</button></div>
                {events.length ? <div className="mcc-table-wrap"><table className="mcc-table"><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Sự kiện</th><th>Mô tả</th><th>Đối tượng</th></tr></thead><tbody>
                    {events.map((item) => <tr key={item.id}><td className="mcc-mono mcc-muted">{formatDateTime(item.created_at)}</td><td>{item.full_name || item.username || (item.user_id ? `#${item.user_id}` : "Hệ thống")}</td><td><Badge tone={/DENIED|FORBIDDEN|REJECT|LOCK/i.test(item.action) ? "warning" : "info"}>{item.action}</Badge></td><td>{item.description || "—"}</td><td className="mcc-mono">{item.entity_type || "—"}{item.entity_id ? `:${item.entity_id}` : ""}</td></tr>)}
                </tbody></table></div> : <div className="mcc-card-body"><ControlEmpty title="Chưa có sự kiện bảo mật trong 100 audit gần nhất" /></div>}
            </div>
            <div className="mcc-notice mcc-section"><ShieldCheck size={16} /><span>Khuyến nghị: rà soát các sự kiện bị từ chối, khóa tài khoản và thay đổi quyền tại Audit Center. Chưa bật cảnh báo realtime, IP reputation hoặc phát hiện brute-force vì runtime hiện chưa cung cấp nguồn telemetry tương ứng.</span></div>
        </> : null}
    </div>;
}
