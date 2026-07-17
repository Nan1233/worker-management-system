import "./ReportDownload.css";


function ReportDownload() {
    return (
        <div className="download-page">
            <div className="download-card">
                <h1>
                    📥 Xuất báo cáo
                </h1>

                <div className="export-box">
                    <h3>
                        ✅ Xuất báo cáo đã duyệt
                    </h3>

                    <p>
                        Để xuất Excel, hãy mở danh sách báo cáo
                        đã duyệt, chọn các báo cáo bằng ô checkbox
                        rồi nhấn nút xuất Excel.
                    </p>

                    <p>
                        File Excel chỉ chứa những báo cáo đã được
                        lựa chọn.
                    </p>
                </div>

                <div className="export-box">
                    <h3>
                        📊 Google Sheet
                    </h3>

                    <p>
                        Google Sheet được tự động đồng bộ sau khi
                        quản lý duyệt báo cáo.
                    </p>

                    <p>
                        Không cần tạo hoặc cập nhật Google Sheet
                        thủ công tại trang này.
                    </p>
                </div>

                <div className="export-box">
                    <h3>
                        ⏳ Báo cáo chờ duyệt
                    </h3>

                    <p>
                        Báo cáo chờ duyệt cần được kiểm tra và phê
                        duyệt trước khi xuất thành dữ liệu chính thức.
                    </p>
                </div>
            </div>
        </div>
    );
}


export default ReportDownload;