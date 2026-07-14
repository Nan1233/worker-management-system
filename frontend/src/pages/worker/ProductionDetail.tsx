import {
    useEffect,
    useState
} from "react";
import {
    useSearchParams
} from "react-router-dom";
import { useNavigate, useParams } from "react-router-dom";

import "./ProductionDetail.css";

import { getReportById } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";


function ProductionDetail() {

    const { id } = useParams();
const [searchParams] = useSearchParams();


const source =
searchParams.get("source");
    const navigate = useNavigate();

    const [report, setReport] = useState<ProductionReport | null>(null);

    const [loading, setLoading] = useState(true);


    useEffect(() => {

        const loadReport = async () => {

            try {

                if (!id) return;

                const data =
await getReportById(
    Number(id),
    source
);

                setReport(data);

            } catch (err) {

                console.error("Lỗi lấy chi tiết báo cáo:", err);

            } finally {

                setLoading(false);

            }

        };


        loadReport();

    }, [id]);



    if (loading) {

        return (
            <div className="detail-container">
                <h2>Đang tải...</h2>
            </div>
        );

    }



    if (!report) {

        return (
            <div className="detail-container">
                <h2>Không tìm thấy báo cáo.</h2>
            </div>
        );

    }



    return (

        <div className="detail-container">


            <div className="detail-header">

                <h2>📋 Chi tiết báo cáo</h2>


                <button
                    className="back-btn"
                    onClick={() => navigate(-1)}
                >
                    Quay lại
                </button>

            </div>



            <div className="detail-card">


                <div className="detail-item">

                    <span>👤 Người nhập</span>

                    <strong>
                        {report.full_name || "Không có dữ liệu"}
                    </strong>

                </div>



                <div className="detail-item">

                    <span>🆔 Mã công nhân</span>

                    <strong>
                        {report.worker_code || "Không có dữ liệu"}
                    </strong>

                </div>



                <div className="detail-item">

                    <span>⏰ Thời gian nhập</span>

                    <strong>

                        {
                            report.created_at
                                ? new Date(report.created_at)
                                    .toLocaleString("vi-VN")
                                : "Không có dữ liệu"
                        }

                    </strong>

                </div>



                <div className="detail-item">

                    <span>🔄 Cập nhật lần cuối</span>

                    <strong>

                        {
                            report.updated_at
                                ? new Date(report.updated_at)
                                    .toLocaleString("vi-VN")
                                : "Không có dữ liệu"
                        }

                    </strong>

                </div>



                <div className="detail-item">

                    <span>Ngày sản xuất</span>

                    <strong>
                        {new Date(report.work_date)
                            .toLocaleDateString("vi-VN")}
                    </strong>

                </div>



                <div className="detail-item">

                    <span>Công đoạn</span>

                    <strong>
                        {report.process_name}
                    </strong>

                </div>



                <div className="detail-item">

                    <span>Ca</span>

                    <strong>
                        {report.shift}
                    </strong>

                </div>



                <div className="detail-item">

                    <span>Máy</span>

                    <strong>
                        {report.machine_no}
                    </strong>

                </div>



                <div className="detail-item">

                    <span>Sản phẩm</span>

                    <strong>
                        {report.product_name}
                    </strong>

                </div>



                <div className="detail-item">

                    <span>Định mức</span>

                    <strong>
                        {report.standard_output}
                    </strong>

                </div>



                <div className="detail-item">

                    <span>Sản lượng thực tế</span>

                    <strong>
                        {report.actual_output}
                    </strong>

                </div>



                <div className="detail-item">

                    <span>OK</span>

                    <strong>
                        {report.tt_ok}
                    </strong>

                </div>



                <div className="detail-item">

                    <span>NG</span>

                    <strong>
                        {report.tt_ng}
                    </strong>

                </div>



                <div className="detail-item">

                    <span>Dập lại</span>

                    <strong>
                        {report.kqd_dap_lai}
                    </strong>

                </div>



                <div className="detail-item">

                    <span>Tuột</span>

                    <strong>
                        {report.kqd_tuot}
                    </strong>

                </div>



                <div className="detail-item">

                    <span>Vỡ đỗ lòng</span>

                    <strong>
                        {report.vo_do_long}
                    </strong>

                </div>



                <div className="detail-item">

                    <span>Xước đỗ lòng</span>

                    <strong>
                        {report.xuoc_do_long}
                    </strong>

                </div>



                <div className="detail-item">

                    <span>Cong gãy</span>

                    <strong>
                        {report.cong_gay}
                    </strong>

                </div>



                <div className="detail-item">

                    <span>Xoay</span>

                    <strong>
                        {report.xoay}
                    </strong>

                </div>



                <div className="detail-item">

                    <span>Không đứt</span>

                    <strong>
                        {report.khong_dut}
                    </strong>

                </div>



                <div className="detail-item">

                    <span>Bavia hút</span>

                    <strong>
                        {report.bavia_hut}
                    </strong>

                </div>



                <div className="detail-item">

                    <span>PPCM</span>

                    <strong>
                        {report.ppcm}
                    </strong>

                </div>



                <div className="detail-item">

                    <span>Lỗi cao su</span>

                    <strong>
                        {report.loi_cao_su}
                    </strong>

                </div>



                <div className="detail-item">

                    <span>NG kích thước</span>

                    <strong>
                        {report.ng_kich_thuoc}
                    </strong>

                </div>



                <div className="detail-item">

                    <span>Cắt lẹm</span>

                    <strong>
                        {report.cat_lem}
                    </strong>

                </div>



                <div className="detail-item">

                    <span>Ghi chú</span>

                    <strong>
                        {report.note || "Không có"}
                    </strong>

                </div>


            </div>


        </div>

    );

}


export default ProductionDetail;