import { Badge, PageHeader } from "./ControlStates";
import { OVERVIEW_LAYOUT, WIDGET_REGISTRY } from "./widgetRegistry";

export default function MasterControlComponentRegistry() {
    const used = new Set([...OVERVIEW_LAYOUT.kpis, ...OVERVIEW_LAYOUT.columns.flat()]);
    return <div>
        <PageHeader title="Component Registry" description="Widget đã đăng ký trong mã nguồn. Bố cục chỉ tham chiếu id widget — không chứa mã thực thi, SQL hay quy tắc nghiệp vụ." />
        <div className="mcc-card"><div className="mcc-table-wrap"><table className="mcc-table">
            <thead><tr><th>ID</th><th>Tên</th><th>Loại</th><th>Nguồn dữ liệu</th><th>Mô tả</th><th>Dùng trong Overview</th></tr></thead>
            <tbody>{WIDGET_REGISTRY.map((widget) => <tr key={widget.id}>
                <td className="mcc-mono">{widget.id}</td><td>{widget.title}</td><td><Badge>{widget.kind}</Badge></td>
                <td className="mcc-mono mcc-muted">{widget.dataSource}</td><td className="mcc-muted">{widget.description}</td>
                <td>{used.has(widget.id) ? <Badge tone="success">Có</Badge> : <Badge>Không</Badge>}</td>
            </tr>)}</tbody>
        </table></div></div>
    </div>;
}
