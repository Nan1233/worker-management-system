import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Lock, Unlock } from "lucide-react";
import { masterControlApi, ROLE_LABELS } from "../../services/masterControlService";
import { getApiError } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";
import { Badge, ControlDenied, ControlEmpty, ControlError, ControlLoading, PageHeader } from "./ControlStates";
import { formatDateTime } from "./controlFormat";
import { controlPath } from "./masterControlNav";
import { useControlQuery } from "./useControlQuery";

export default function MasterControlUserDetail() {
    const { id } = useParams<{ id: string }>();
    const userId = Number(id);
    const validId = Number.isInteger(userId) && userId > 0;
    const { data, loading, error, forbidden, reload } = useControlQuery(() => (validId ? masterControlApi.user(userId) : Promise.reject(new Error("ID tài khoản không hợp lệ"))), String(userId));
    const [dialog, setDialog] = useState<"inactive" | "active" | null>(null);
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);
    const [actionError, setActionError] = useState("");
    const self = Number(getStoredUser()?.id) === userId;

    const submitStatus = async () => {
        if (!dialog) return;
        if (reason.trim().length < 3) { setActionError("Vui lòng nhập lý do (ít nhất 3 ký tự)."); return; }
        setSaving(true); setActionError("");
        try {
            await masterControlApi.setUserStatus(userId, dialog, reason.trim());
            setDialog(null); setReason(""); reload();
        } catch (err) {
            setActionError(getApiError(err, "Không đổi được trạng thái").message);
        } finally { setSaving(false); }
    };

    const user = data?.user;
    return <div>
        <Link to={controlPath("users")} className="mcc-btn" style={{ marginBottom: 14 }}><ArrowLeft size={14} aria-hidden="true" />Danh sách tài khoản</Link>
        {loading && !data ? <ControlLoading /> : null}
        {forbidden ? <ControlDenied /> : error ? <ControlError message={error} onRetry={validId ? reload : undefined} /> : null}
        {user && !error ? <>
            <PageHeader title={user.full_name} description={`${user.username} · ${ROLE_LABELS[user.role] || user.role}`} actions={
                user.status === "active"
                    ? <button type="button" className="mcc-btn mcc-btn-danger" disabled={self} title={self ? "Không thể tự khóa tài khoản đang đăng nhập" : undefined} onClick={() => { setDialog("inactive"); setActionError(""); }}><Lock size={14} aria-hidden="true" />Khóa tài khoản</button>
                    : <button type="button" className="mcc-btn" onClick={() => { setDialog("active"); setActionError(""); }}><Unlock size={14} aria-hidden="true" />Mở khóa</button>
            } />
            <div className="mcc-grid mcc-grid-2">
                <div className="mcc-card">
                    <div className="mcc-card-head"><h2>Thông tin tài khoản</h2>{user.status === "active" ? <Badge tone="success">Hoạt động</Badge> : <Badge tone="danger">Đã khóa</Badge>}</div>
                    <div className="mcc-card-body"><dl className="mcc-dl">
                        <dt>ID</dt><dd className="mcc-mono">{user.id}</dd>
                        <dt>Vai trò</dt><dd>{ROLE_LABELS[user.role] || user.role}</dd>
                        <dt>Mã công nhân</dt><dd className="mcc-mono">{user.worker_code || "—"}</dd>
                        <dt>Bộ phận / vị trí</dt><dd>{[user.department, user.position].filter(Boolean).join(" · ") || "—"}</dd>
                        <dt>% học việc</dt><dd>{user.training_percent ?? "—"}</dd>
                        <dt>Tạo lúc</dt><dd>{formatDateTime(user.created_at)}</dd>
                        <dt>Cập nhật</dt><dd>{formatDateTime(user.updated_at)}</dd>
                        <dt>Phiên đăng nhập</dt><dd>{data.sessions.active} đang hiệu lực / {data.sessions.total} tổng · gần nhất {formatDateTime(data.sessions.lastActivityAt)}</dd>
                    </dl></div>
                </div>
                <div className="mcc-card">
                    <div className="mcc-card-head"><div><h2>Phạm vi công đoạn</h2><p>Manager/Lead: manager_processes · Công nhân: worker_processes</p></div></div>
                    {data.processes.length ? <ul className="mcc-list">{data.processes.map((process) => <li key={`${process.source}-${process.id}`}><span><strong>{process.process_name}</strong> <span className="mcc-muted mcc-mono">{process.process_code}</span></span><Badge tone={process.source === "manager_scope" ? "info" : "neutral"}>{process.source === "manager_scope" ? "Phạm vi quản lý" : "Phân công"}</Badge></li>)}</ul>
                        : <div className="mcc-card-body"><ControlEmpty title={user.role === "admin" ? "Admin không giới hạn theo công đoạn" : "Chưa được phân công đoạn"} /></div>}
                </div>
            </div>
            <div className="mcc-grid mcc-grid-2 mcc-section">
                <div className="mcc-card">
                    <div className="mcc-card-head"><div><h2>Quyền hiệu lực</h2><p>Tính bởi permission service (mặc định role → override role → override user → bắt buộc)</p></div><Link className="mcc-btn" to={controlPath("permissions")}>Quản lý quyền</Link></div>
                    <div className="mcc-card-body"><div className="mcc-chips">{data.permissions.map((code) => <Badge key={code}>{code}</Badge>)}</div></div>
                </div>
                <div className="mcc-card">
                    <div className="mcc-card-head"><div><h2>Lịch sử tài khoản</h2><p>20 sự kiện gần nhất (do tài khoản thực hiện hoặc tác động lên tài khoản)</p></div></div>
                    {data.activity.length ? <ul className="mcc-list">{data.activity.map((item) => <li key={item.id}><span>{item.description || item.action}</span><span className="mcc-muted mcc-mono">{formatDateTime(item.created_at)}</span></li>)}</ul>
                        : <div className="mcc-card-body"><ControlEmpty title="Chưa có sự kiện" /></div>}
                </div>
            </div>
        </> : null}

        {dialog ? <div className="mcc-modal-backdrop" role="presentation" onMouseDown={() => !saving && setDialog(null)}>
            <div className="mcc-modal" role="dialog" aria-modal="true" aria-labelledby="mcc-status-title" onMouseDown={(event) => event.stopPropagation()}>
                <h2 id="mcc-status-title">{dialog === "inactive" ? "Khóa tài khoản" : "Mở khóa tài khoản"}</h2>
                <p>{dialog === "inactive"
                    ? "Tài khoản bị chặn đăng nhập và các phiên hiện có bị thu hồi. Không xóa dữ liệu; có thể mở khóa lại bất cứ lúc nào."
                    : "Tài khoản được phép đăng nhập lại. Phân quyền và phân công giữ nguyên."}</p>
                <label htmlFor="mcc-status-reason" className="mcc-muted">Lý do (ghi vào nhật ký)</label>
                <textarea id="mcc-status-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} autoFocus />
                {actionError ? <div className="mcc-field-error" role="alert">{actionError}</div> : null}
                <div className="mcc-modal-actions">
                    <button type="button" className="mcc-btn" onClick={() => setDialog(null)} disabled={saving}>Hủy</button>
                    <button type="button" className={`mcc-btn ${dialog === "inactive" ? "mcc-btn-danger" : "mcc-btn-primary"}`} onClick={() => void submitStatus()} disabled={saving}>{saving ? "Đang lưu..." : dialog === "inactive" ? "Khóa tài khoản" : "Mở khóa"}</button>
                </div>
            </div>
        </div> : null}
    </div>;
}
