import { useState } from "react";
import { Database as DatabaseIcon } from "lucide-react";
import { masterControlApi } from "../../services/masterControlService";
import { Badge, ControlDenied, ControlEmpty, ControlError, ControlLoading, PageHeader } from "./ControlStates";
import { formatNumber } from "./controlFormat";
import { useControlQuery } from "./useControlQuery";

export default function MasterControlDatabase() {
    const tables = useControlQuery(() => masterControlApi.tables(), "tables");
    const [selected, setSelected] = useState("");
    const [filter, setFilter] = useState("");
    const detail = useControlQuery(() => (selected ? masterControlApi.table(selected) : Promise.resolve(null)), selected);
    const list = (tables.data?.tables || []).filter((table) => table.name.toLowerCase().includes(filter.trim().toLowerCase()));

    return <div>
        <PageHeader title="Database Explorer" description="Chỉ đọc metadata từ information_schema (bảng, cột, kiểu dữ liệu, index, khóa ngoại). Không đọc hay sửa dữ liệu dòng." />
        <div className="mcc-notice mcc-notice-warning" style={{ marginBottom: 14 }}>
            <DatabaseIcon size={16} aria-hidden="true" />
            <span>SQL console đang <strong>tắt</strong>: hệ thống chưa có DB credential chỉ đọc ({tables.data?.sqlConsole.reason || "READ_ONLY_CREDENTIAL_NOT_CONFIGURED"}). Credential ghi không bao giờ được dùng cho truy vấn tùy ý.</span>
        </div>
        {tables.loading && !tables.data ? <ControlLoading /> : null}
        {tables.forbidden ? <ControlDenied /> : tables.error ? <ControlError message={tables.error} onRetry={tables.reload} /> : null}
        {tables.data ? <div className="mcc-grid" style={{ gridTemplateColumns: "minmax(240px, 320px) minmax(0, 1fr)" }}>
            <div className="mcc-card">
                <div className="mcc-toolbar"><input className="mcc-input" style={{ minWidth: 0, width: "100%" }} placeholder="Lọc tên bảng" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Lọc tên bảng" /></div>
                <div className="mcc-table-wrap" style={{ maxHeight: "70dvh" }}><table className="mcc-table">
                    <thead><tr><th>Bảng ({list.length})</th><th>Ước tính dòng</th></tr></thead>
                    <tbody>{list.map((table) => <tr key={table.name} className="mcc-row-link" tabIndex={0} aria-selected={selected === table.name} style={selected === table.name ? { background: "var(--ktc-primary-soft)" } : undefined} onClick={() => setSelected(table.name)} onKeyDown={(e) => { if (e.key === "Enter") setSelected(table.name); }}>
                        <td className="mcc-mono">{table.name}</td><td className="mcc-mono mcc-muted">{formatNumber(table.estimated_rows)}</td>
                    </tr>)}</tbody>
                </table></div>
            </div>
            <div className="mcc-card">
                {!selected ? <div className="mcc-card-body"><ControlEmpty title="Chọn một bảng để xem schema" /></div> : null}
                {selected && detail.loading ? <div className="mcc-card-body"><ControlLoading /></div> : null}
                {selected && detail.error ? <div className="mcc-card-body"><ControlError message={detail.error} onRetry={detail.reload} /></div> : null}
                {selected && detail.data && !detail.loading ? <>
                    <div className="mcc-card-head"><div><h2 className="mcc-mono">{detail.data.name}</h2><p>{detail.data.columns.length} cột · {detail.data.indexes.length} index · {detail.data.references.length} khóa ngoại</p></div></div>
                    <div className="mcc-table-wrap"><table className="mcc-table">
                        <thead><tr><th>Cột</th><th>Kiểu</th><th>Null</th><th>Mặc định</th><th>Key</th><th>Extra</th></tr></thead>
                        <tbody>{detail.data.columns.map((column) => <tr key={column.name}><td className="mcc-mono">{column.name}</td><td className="mcc-mono">{column.type}</td><td>{column.nullable}</td><td className="mcc-mono mcc-muted">{column.default_value ?? "—"}</td><td>{column.key_type ? <Badge tone="info">{column.key_type}</Badge> : ""}</td><td className="mcc-muted">{column.extra}</td></tr>)}</tbody>
                    </table></div>
                    <div className="mcc-card-head"><h2>Index</h2></div>
                    {detail.data.indexes.length ? <ul className="mcc-list">{detail.data.indexes.map((index) => <li key={index.name}><span className="mcc-mono">{index.name}</span><span className="mcc-mono mcc-muted">{index.columns} {Number(index.non_unique) === 0 ? <Badge tone="info">UNIQUE</Badge> : null}</span></li>)}</ul> : <div className="mcc-card-body mcc-muted">Không có index.</div>}
                    {detail.data.references.length ? <><div className="mcc-card-head"><h2>Quan hệ</h2></div><ul className="mcc-list">{detail.data.references.map((ref) => <li key={`${ref.column_name}-${ref.referenced_table}`}><span className="mcc-mono">{ref.column_name}</span><span className="mcc-mono">→ {ref.referenced_table}.{ref.referenced_column}</span></li>)}</ul></> : null}
                </> : null}
            </div>
        </div> : null}
    </div>;
}
