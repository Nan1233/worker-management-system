import AppIcon from "../../components/common/AppIcon";
import "./ReportDownload.css";

function ReportDownload() {
    return (
        <div className="download-page poketto-manager-page">
            <div className="download-card">
                <div className="download-header">
                    <span className="download-header-icon"><AppIcon name="download" size={24} /></span>
                    <div>
                        <h1>Trung tâm xuất báo cáo</h1>
                        <p>Hướng dẫn nhanh cho xuất Excel, Google Sheet và quy trình duyệt dữ liệu.</p>
                    </div>
                </div>

                <div className="download-grid">
                    <section className="export-box">
                        <div className="export-box-icon success"><AppIcon name="approved" size={22} /></div>
                        <div>
                            <h3>Xuất báo cáo đã duyệt</h3>
                            <p>
                                Mở danh sách báo cáo đã duyệt, chọn các báo cáo bằng ô checkbox và nhấn nút xuất Excel.
                                File chỉ chứa những báo cáo được lựa chọn.
                            </p>
                        </div>
                    </section>

                    <section className="export-box">
                        <div className="export-box-icon"><AppIcon name="sheet" size={22} /></div>
                        <div>
                            <h3>Google Sheet</h3>
                            <p>
                                Google Sheet được đồng bộ tự động sau khi quản lý duyệt báo cáo. Không cần cập nhật thủ công ở trang này.
                            </p>
                        </div>
                    </section>

                    <section className="export-box">
                        <div className="export-box-icon warning"><AppIcon name="pending" size={22} /></div>
                        <div>
                            <h3>Báo cáo chờ duyệt</h3>
                            <p>
                                Dữ liệu cần được kiểm tra và phê duyệt trước khi trở thành số liệu chính thức để xuất báo cáo.
                            </p>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}

export default ReportDownload;
