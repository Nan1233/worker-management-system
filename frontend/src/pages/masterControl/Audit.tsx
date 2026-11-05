import { Fragment, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { masterControlApi, ROLE_LABELS } from "../../services/masterControlService";
import { Badge, ControlDenied, ControlEmpty, ControlError, ControlLoading, PageHeader } from "./ControlStates";
import { formatDateTime } from "./controlFormat";
import { useControlQuery } from "./useControlQuery";

const FIELDS = ["search", "action", "entity_type", "user_id", "from", "to"] as const;

export default function MasterControlAudit() {
    const [params, setParams] = useSearchParams();
    const page = Math.max(1, Number(params.get("page")) || 1);
    const filters = Object.fromEntries(FIELDS.map((key) => [key, params.get(key) || ""])) as Record<(typeof FIELDS)[number], string>;
    const [draft, setDraft] = useState(filters);
    const [expanded, setExpanded] = useState<number | null>(null);
    const filterKey = FIELDS.map((key) => filters[key]).join("|");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => setDraft(filters), [filterKey]);
    const { data, loading, error, forbidden, reload } = useControlQuery(
        () => masterControlApi.audit({ ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)), page, pageSize: 50 }),
        `${filterKey}|${page}`,
    );
    const apply = (event: FormEvent) => {
        event.preventDefault();
        const next = new URLSearchParams();
        for (const key of FIELDS) if (draft[key].trim()) next.set(key, draft[key].trim());
        setParams(next);
    };
    const goto = (target: number) => { const next = new URLSearchParams(params); next.set("page", String(target)); setParams(next); };

    return <div>
        <PageHeader title="Audit Center" description="activity_logs: đăng nhập, thay đổi người dùng, phân quyền, dữ liệu chuẩn, báo cáo và thao tác Master Control." />
        <div className="mcc-card">
            <form className="mcc-toolbar" onSubmit={apply}>
                <input className="mcc-input" placeholder="Tìm trong mô tả" value={draft.search} onChange={(e) => setDraft({ ...draft, search: e.target.value })} aria-label="Tìm trong mô tả" />
                <input className="mcc-input" style={{ minWidth: 170 }} placeholder="Action (vd PERMISSION_OVERRIDE_GRANTED)" value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} aria-label="Action" />
                <input className="mcc-input" style={{ minWidth: 130 }} placeholder="Entity type" value={draft.entity_type} onChange={(e) => setDraft({ ...draft, entity_type: e.target.value })} aria-label="Entity type" />
                <input className="mcc-input" style={{ minWidth: 90, width: 90 }} placeholder="User ID" inputMode="numeric" value={draft.user_id} onChange={(e) => setDraft({ ...draft, user_id: e.target.value.replace(/\D/g, "") })} aria-label="User ID" />
                <input className="mcc-input" style={{ minWidth: 0 }} type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} aria-label="Từ ngày" />
                <input className="mcc-input" style={{ minWidth: 0 }} type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} aria-label="Đến ngày" />
                <button type="submit" className="mcc-btn mcc-btn-primary">Lọc</button>
                <button type="button" className="mcc-btn" onClick={() => setParams(new URLSearchParams())}>Xóa lọc</button>
            </form>
            {loading && !data ? <div className="mcc-card-body"><ControlLoading /></div> : null}
            {forbidden ? <div className="mcc-card-body"><ControlDenied /></div> : error ? <div className="mcc-card-body"><ControlError message={error} onRetry={reload} /></div> : null}
            {data && !error ? (data.items.length ? <>
                <div className="mcc-table-wrap"><table className="mcc-table">
                    <thead><tr><th>Thời gian</th><th>Actor</th><th>Action</th><th>Resource</th><th>Mô tả</th><th>IP</th><th /></tr></thead>
                    <tbody>{data.items.map((item) => <Fragment key={item.id}>
                        <tr>
                            <td className="mcc-mono mcc-muted">{formatDateTime(item.created_at)}</td>
                            <td>{item.full_name || item.username || (item.user_id ? `#${item.user_id}` : "Hệ thống")}{item.role ? <div className="mcc-muted">{ROLE_LABELS[item.role] || item.role}</div> : null}</td>
                            <td><Badge tone={/LOCK|DELETE|REVOK/.test(item.action) ? "warning" : "neutral"}>{item.action}</Badge></td>
                            <td className="mcc-mono">{item.entity_type || "—"}{item.entity_id ? `:${item.entity_id}` : ""}</td>
                            <td>{item.description || "—"}</td>
                            <td className="mcc-mono mcc-muted">{item.ip_address || "—"}</td>
                            <td><button type="button" className="mcc-btn" aria-expanded={expanded === item.id} onClick={() => setExpanded(expanded === item.id ? null : item.id)}>{expanded === item.id ? "Ẩn" : "Chi tiết"}</button></td>
                        </tr>
                        {expanded === item.id ? <tr><td colSpan={7}><pre className="mcc-pre">{JSON.stringify(item.metadata, null, 2)}</pre></td></tr> : null}
                    </Fragment>)}</tbody>
                </table></div>
                <div className="mcc-pagination"><span>{data.pagination.total.toLocaleString("vi-VN")} sự kiện · trang {data.pagination.page}/{data.pagination.totalPages}</span><div>
                    <button type="button" className="mcc-btn" disabled={page <= 1 || loading} onClick={() => goto(page - 1)}>Trước</button>
                    <button type="button" className="mcc-btn" disabled={page >= data.pagination.totalPages || loading} onClick={() => goto(page + 1)}>Sau</button>
                </div></div>
            </> : <div className="mcc-card-body"><ControlEmpty title="Không có sự kiện phù hợp" /></div>) : null}
        </div>
    </div>;
}
