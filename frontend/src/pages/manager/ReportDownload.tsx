import { useState } from "react";
import AppIcon from "../../components/common/AppIcon";
import DesktopExcelNotice, { isDesktopApp } from "../../components/system/DesktopExcelNotice";

/**
 * "Xuất Excel" page for every role that holds REPORT_EXPORT (lead, manager, admin).
 * Excel is produced by the Desktop app only; this page says so plainly and, inside
 * the Desktop app, offers the export folder.
 */
function ReportDownload() {
    const desktop = isDesktopApp();
    const [message, setMessage] = useState("");

    const openFolder = async () => {
        try {
            await window.ktcDesktop?.openExportFolder?.();
            setMessage("");
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
                            {desktop && (
                                <p>
                                    <button type="button" className="primary" onClick={() => void openFolder()}>Mở thư mục xuất Excel</button>
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
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}

export default ReportDownload;
