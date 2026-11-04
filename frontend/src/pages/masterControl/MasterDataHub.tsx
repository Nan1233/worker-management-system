import { Link } from "react-router-dom";
import { Boxes, Cog, Factory, FileWarning, Timer, Users } from "lucide-react";
import { PageHeader } from "./ControlStates";

const LINKS = [
    { to: "/admin/master/machines", title: "Máy móc", text: "Máy theo công đoạn, máy dùng chung, số người tối đa", icon: Cog },
    { to: "/admin/master/standards", title: "Sản phẩm & định mức", text: "Mã sản phẩm, định mức, phiên bản định mức", icon: Boxes },
    { to: "/admin/master/defects", title: "Loại lỗi NG", text: "Danh mục lỗi theo công đoạn (KQD là NG thông thường)", icon: FileWarning },
    { to: "/admin/master/deductions", title: "Trừ giờ", text: "Lý do trừ giờ và thứ tự hiển thị", icon: Timer },
    { to: "/admin/master/processes", title: "Công đoạn", text: "Tạo / sửa / ngừng công đoạn (chỉ Admin)", icon: Factory },
    { to: "/admin/workers", title: "Nhân sự (màn hình hiện có)", text: "Hồ sơ công nhân, phân công công đoạn", icon: Users },
];

export default function MasterControlMasterData() {
    return <div>
        <PageHeader title="Master Data" description="Dữ liệu chuẩn tiếp tục dùng các màn hình và API hiện có (process scope, kiểm tra và audit giữ nguyên). Master Control không tạo đường ghi thứ hai." />
        <div className="mcc-grid mcc-grid-3">{LINKS.map((item) => { const Icon = item.icon; return <Link key={item.to} to={item.to} className="mcc-card mcc-link-card"><span className="mcc-icon-tile"><Icon size={16} aria-hidden="true" /></span><span><strong>{item.title}</strong><small>{item.text}</small></span></Link>; })}</div>
    </div>;
}
