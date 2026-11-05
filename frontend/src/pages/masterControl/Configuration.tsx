import { ShieldAlert } from "lucide-react";
import { masterControlApi } from "../../services/masterControlService";
import { Badge, ControlDenied, ControlError, ControlLoading, PageHeader } from "./ControlStates";
import { useControlQuery } from "./useControlQuery";

export default function MasterControlConfiguration() {
    const { data, loading, error, forbidden, reload } = useControlQuery(() => masterControlApi.configuration(), "configuration");
    return <div>
        <PageHeader title="System Configuration" description="Cấu hình runtime đang chạy (không chứa secret). Thay đổi phải qua cấu hình wrangler/Render đã review và deploy lại — trang này không ghi cấu hình." />
        {loading && !data ? <ControlLoading /> : null}
        {forbidden ? <ControlDenied /> : error ? <ControlError message={error} onRetry={reload} /> : null}
        {data ? <div className="mcc-card">
            <div className="mcc-card-head"><div><h2>Cấu hình hiện hành</h2><p>Nguồn: {data.source}</p></div><Badge>Chỉ xem</Badge></div>
            <div className="mcc-table-wrap"><table className="mcc-table">
                <thead><tr><th>Nhóm</th><th>Khóa</th><th>Giá trị hiện tại</th><th>Mô tả</th><th>Mức ảnh hưởng</th></tr></thead>
                <tbody>{data.items.map((item) => <tr key={item.key}>
                    <td>{item.group}</td>
                    <td className="mcc-mono">{item.key}</td>
                    <td className="mcc-mono">{item.isSet ? (item.value === "" ? "(rỗng)" : item.value) : <span className="mcc-muted">chưa đặt</span>}</td>
                    <td className="mcc-muted">{item.description}</td>
                    <td>{item.dangerous ? <Badge tone="warning"><ShieldAlert size={12} aria-hidden="true" style={{ marginRight: 4 }} />Ảnh hưởng nghiệp vụ</Badge> : <Badge>Thấp</Badge>}</td>
                </tr>)}</tbody>
            </table></div>
            <div className="mcc-card-body"><div className="mcc-notice">Người cập nhật / thời gian cập nhật / lịch sử thay đổi: Not available — biến môi trường không lưu metadata này. Chỉnh sửa có kiểm soát cần bảng cấu hình + lịch sử (chờ phê duyệt schema).</div></div>
        </div> : null}
    </div>;
}
