import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getStoredUser } from "../../utils/authStorage";
import "./ReportDownload.css";
import AppIcon from "../../components/common/AppIcon";
import DesktopExcelNotice from "../../components/system/DesktopExcelNotice";
import { isDesktopApp } from "../../utils/desktopApp";

/**
 * "Xuất Excel" page for every role that holds REPORT_EXPORT (lead, manager, admin).
 * Excel is produced by the Desktop app only; this page says so plainly and, inside
 * the Desktop app, offers the export folder.
 */
function ReportDownload() {
    const desktop = isDesktopApp();
    const navigate = useNavigate();
    const role = String(getStoredUser()?.role || "manager").toLowerCase();
    const basePath = role === "lead" ? "/lead" : role === "admin" ? "/admin" : role === "admin_ops" ? "/admin-ops" : "/manager";
    const canOpenFolder = desktop && typeof window.ktcDesktop?.openExportFolder === "function";
    const [message, setMessage] = useState("");

    const openFolder = async () => {
        try {
            if (!canOpenFolder) { setMessage("Ứng dụng Desktop chưa hỗ trợ mở thư mục xuất. Hãy kiểm tra cài đặt Desktop."); return; }
            await window.ktcDesktop.openExportFolder!();
            setMessage("Đã gửi yêu cầu mở thư mục xuất Excel.");
        } catch {
            setMessage("Không mở được thư mục xuất Excel.");
        }
    };

    return (
        <div className="download-page manager-page">
            <div className="download-card">
                <div className="download-header">
                    <span className="download-header-icon"><AppIcon name="download" size={24} /></span>
                    <div>
                        <h1>Xuất Excel</h1>
                        <p>Báo cáo Excel được tạo từ dữ liệu đã duyệt bằng ứng dụng KTC Desktop.</p>
                    </div>
                </div>

                <DesktopExcelNotice />

                <div className="download-grid">
                    <section className="export-box">
                        <div className="export-box-icon success"><AppIcon name="approved" size={22} /></div>
                        <div>
                            <h3>Cách cập nhật Excel</h3>
                            <p>
                                1. Mở KTC Desktop và đăng nhập.<br />
                                2. Vào “Đã duyệt”, chọn ngày cần xuất.<br />
                                3. Bấm “Cập nhật Excel”. File được ghi vào thư mục xuất trên máy.
                            </p>
                            <div className="download-actions"><button type="button" className="primary" onClick={() => navigate(`${basePath}/approved`)}>Đến báo cáo đã duyệt</button></div>
                            {desktop && (
                                <p>
                                    <button type="button" className="primary" onClick={() => void openFolder()} disabled={!canOpenFolder}>Mở thư mục xuất Excel</button>
                                    {message && <span role="alert"> {message}</span>}
                                </p>
                            )}
                        </div>
                    </section>

                    <section className="export-box">
                        <div className="export-box-icon warning"><AppIcon name="pending" size={22} /></div>
                        <div>
                            <h3>Báo cáo chờ duyệt</h3>
                            <p>
                                Chỉ báo cáo đã được duyệt mới vào Excel. Hãy duyệt hoặc từ chối báo cáo chờ duyệt trước khi cập nhật Excel.
                            </p>
                            <div className="download-actions"><button type="button" onClick={() => navigate(`${basePath}/reports`)}>Xem báo cáo chờ duyệt</button></div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}

export default ReportDownload;
