import { Link } from "react-router-dom";
import { Construction } from "lucide-react";
import { Badge, PageHeader } from "./ControlStates";
import { controlPath } from "./masterControlNav";

const CONTENT: Record<string, { title: string; reason: string; next: string[] }> = {
    "page-builder": {
        title: "Page Builder",
        reason: "Lưu bản nháp, xuất bản, lịch sử phiên bản và rollback cần bảng lưu định nghĩa trang (ví dụ ui_page_definitions + ui_page_versions). Thay đổi schema chưa được phê duyệt nên phần lưu trữ chưa bật.",
        next: ["Phê duyệt đề xuất schema lưu bố cục (JSON đã kiểm tra theo Component Registry).", "Kéo-thả và preview responsive dựa trên Component Registry hiện có.", "Draft → Preview → Publish có audit; Rollback theo phiên bản."],
    },
    organization: {
        title: "Organization",
        reason: "Cơ cấu tổ chức hiện được biểu diễn qua công đoạn và phân công (manager_processes / worker_processes). Chưa có mô hình phòng ban/tổ riêng trong database.",
        next: ["Xem phân công từng tài khoản tại Users & Accounts → chi tiết.", "Quản lý công đoạn tại Master Data → Công đoạn.", "Cần quyết định nghiệp vụ nếu muốn thêm cấp tổ chức."],
    },
};

export default function MasterControlComingSoon({ module }: { module: "page-builder" | "organization" }) {
    const content = CONTENT[module];
    return <div>
        <PageHeader title={content.title} description="Chưa triển khai — trang này không có chức năng giả." actions={<Badge tone="warning">Sắp có</Badge>} />
        <div className="mcc-card"><div className="mcc-card-body">
            <div className="mcc-notice"><Construction size={16} aria-hidden="true" /><span>{content.reason}</span></div>
            <h2 style={{ fontSize: 14, margin: "16px 0 8px" }}>Bước tiếp theo</h2>
            <ul>{content.next.map((item) => <li key={item} style={{ margin: "4px 0" }}>{item}</li>)}</ul>
            {module === "page-builder" ? <Link className="mcc-btn" to={controlPath("components")}>Xem Component Registry</Link> : <Link className="mcc-btn" to={controlPath("users")}>Mở Users & Accounts</Link>}
        </div></div>
    </div>;
}
