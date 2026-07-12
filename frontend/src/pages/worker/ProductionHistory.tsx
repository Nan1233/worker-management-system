import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import "./ProductionHistory.css";

import { getReports } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";

function ProductionHistory() {
    const navigate = useNavigate();

    const [reports, setReports] = useState<ProductionReport[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadReports = async () => {
            try {
                const data = await getReports();
                setReports(data);
            } catch (err) {
                console.error("Lỗi khi lấy báo cáo:", err);
            } finally {
                setLoading(false);
            }
        };

        loadReports();
    }, []);

    if (loading) {
        return (
            <div className="worker-history">
                <h2>Đang tải dữ liệu...</h2>
            </div>
        );
    }

    return (
        <div className="worker-history">

            <div className="history-header">
                <h2>📋 Báo cáo của tôi</h2>
                <p>Danh sách các báo cáo đã gửi.</p>
            </div>

            {reports.length === 0 ? (
                <div className="empty-history">

                    <div className="empty-icon">
                        📄
                    </div>

                    <h3>Chưa có báo cáo</h3>

                    <p>
                        Sau khi gửi báo cáo gia công,
                        danh sách sẽ hiển thị tại đây.
                    </p>

                </div>
            ) : (
                <table className="history-table">

                    <thead>
                        <tr>
                            <th>Ngày</th>
                            <th>Công đoạn</th>
                            <th>Ca</th>
                            <th>Máy</th>
                            <th>Sản phẩm</th>
                            <th>OK</th>
                            <th>NG</th>
                            <th>Thao tác</th>
                        </tr>
                    </thead>

                    <tbody>

                        {reports.map((report) => (

                            <tr key={report.id}>

                                <td>
                                    {new Date(report.work_date).toLocaleDateString("vi-VN")}
                                </td>

                                <td>{report.process_type}</td>

                                <td>{report.shift}</td>

                                <td>{report.machine_no}</td>

                                <td>{report.product_name}</td>

                                <td>{report.tt_ok}</td>

                                <td>{report.tt_ng}</td>

                                <td>
                                    <button
                                        className="detail-btn"
                                        onClick={() =>
                                            navigate(`/worker/history/${report.id}`)
                                        }
                                    >
                                        Chi tiết
                                    </button>
                                </td>

                            </tr>

                        ))}

                    </tbody>

                </table>
            )}

        </div>
    );
}

export default ProductionHistory;