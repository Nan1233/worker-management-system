import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { masterControlApi, ROLE_LABELS } from "../../services/masterControlService";
import { Badge, ControlDenied, ControlEmpty, ControlError, ControlLoading, PageHeader } from "./ControlStates";
import { formatDateTime } from "./controlFormat";
import { controlPath } from "./masterControlNav";
import { useControlQuery } from "./useControlQuery";

const PAGE_SIZE = 25;

export default function MasterControlUsers() {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const search = params.get("search") || "";
    const role = params.get("role") || "";
    const status = params.get("status") || "";
    const page = Math.max(1, Number(params.get("page")) || 1);
    const [draft, setDraft] = useState(search);
    useEffect(() => setDraft(search), [search]);

    const { data, loading, error, forbidden, reload } = useControlQuery(
        () => masterControlApi.users({ search: search || undefined, role: role || undefined, status: status || undefined, page, pageSize: PAGE_SIZE }),
        JSON.stringify([search, role, status, page]),
    );

    const update = (next: Record<string, string>) => {
        const merged = new URLSearchParams(params);
        for (const [key, value] of Object.entries(next)) { if (value) merged.set(key, value); else merged.delete(key); }
        if (!("page" in next)) merged.delete("page");
        setParams(merged);
    };
    const submit = (event: FormEvent) => { event.preventDefault(); update({ search: draft.trim() }); };

    return <div>
        <PageHeader title="Users & Accounts" description="Tài khoản, vai trò, phạm vi công đoạn và trạng thái. Phân quyền dùng chung permission service của backend." />
        <div className="mcc-card">
            <form className="mcc-toolbar" onSubmit={submit} role="search">
                <input className="mcc-input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Tên, username, mã công nhân" aria-label="Tìm tài khoản" />
                <button type="submit" className="mcc-btn"><Search size={14} aria-hidden="true" />Tìm</button>
                <select className="mcc-select" value={role} onChange={(event) => update({ role: event.target.value })} aria-label="Lọc vai trò">
                    <option value="">Tất cả vai trò</option>
                    {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <select className="mcc-select" value={status} onChange={(event) => update({ status: event.target.value })} aria-label="Lọc trạng thái">
                    <option value="">Tất cả trạng thái</option>
                    <option value="active">Đang hoạt động</option>
                    <option value="inactive">Đã khóa</option>
                </select>
                {(search || role || status) ? <button type="button" className="mcc-btn" onClick={() => setParams(new URLSearchParams())}>Xóa lọc</button> : null}
                <span className="mcc-muted" style={{ marginLeft: "auto" }}>{data ? `${data.pagination.total.toLocaleString("vi-VN")} tài khoản` : ""}</span>
            </form>
            {loading && !data ? <div className="mcc-card-body"><ControlLoading /></div> : null}
            {forbidden ? <div className="mcc-card-body"><ControlDenied /></div> : error ? <div className="mcc-card-body"><ControlError message={error} onRetry={reload} /></div> : null}
            {data && !error ? (data.items.length ? <>
                <div className="mcc-table-wrap"><table className="mcc-table">
                    <thead><tr><th>Họ tên</th><th>Username</th><th>Vai trò</th><th>Mã CN</th><th>Công đoạn</th><th>Trạng thái</th><th>Hoạt động gần nhất</th></tr></thead>
                    <tbody>{data.items.map((user) => <tr key={user.id} className="mcc-row-link" tabIndex={0} onClick={() => navigate(controlPath(`users/${user.id}`))} onKeyDown={(event) => { if (event.key === "Enter") navigate(controlPath(`users/${user.id}`)); }}>
                        <td><strong>{user.full_name}</strong></td>
                        <td className="mcc-mono">{user.username}</td>
                        <td><Badge tone={user.role === "admin" ? "info" : "neutral"}>{ROLE_LABELS[user.role] || user.role}</Badge></td>
                        <td className="mcc-mono">{user.worker_code || "—"}</td>
                        <td className="mcc-muted">{user.process_names || "—"}</td>
                        <td>{user.status === "active" ? <Badge tone="success">Hoạt động</Badge> : <Badge tone="danger">Đã khóa</Badge>}</td>
                        <td className="mcc-muted mcc-mono">{formatDateTime(user.last_activity_at)}</td>
                    </tr>)}</tbody>
                </table></div>
                <div className="mcc-pagination">
                    <span>Trang {data.pagination.page}/{data.pagination.totalPages}</span>
                    <div>
                        <button type="button" className="mcc-btn" disabled={page <= 1 || loading} onClick={() => update({ page: String(page - 1) })}>Trước</button>
                        <button type="button" className="mcc-btn" disabled={page >= data.pagination.totalPages || loading} onClick={() => update({ page: String(page + 1) })}>Sau</button>
                    </div>
                </div>
            </> : <div className="mcc-card-body"><ControlEmpty title="Không có tài khoản phù hợp">Thử bỏ bớt bộ lọc.</ControlEmpty></div>) : null}
        </div>
    </div>;
}
