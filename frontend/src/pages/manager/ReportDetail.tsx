import {
    useEffect,
    useState
} from "react";

import {
    useNavigate,
    useParams,
    useSearchParams
} from "react-router-dom";

import {
    getTempReportById,
    getReportById
} from "../../services/productionService";

import type {
    ProductionReport
} from "../../types/production";

import "./ReportDetail.css";


function ReportDetail() {

    const {
        id
    } = useParams();

    const navigate =
        useNavigate();

    const [
        searchParams
    ] = useSearchParams();

    const source =
        searchParams.get("source");

    const [
        report,
        setReport
    ] = useState<ProductionReport | null>(
        null
    );

    const [
        loading,
        setLoading
    ] = useState(true);

    const [
        error,
        setError
    ] = useState("");


    useEffect(() => {

        const loadReport = async () => {

            try {

                setLoading(true);
                setError("");
                setReport(null);

                if (!id) {

                    setError(
                        "Không tìm thấy ID báo cáo"
                    );

                    return;

                }

                const reportId =
                    Number(id);

                if (
                    !Number.isInteger(reportId) ||
                    reportId <= 0
                ) {

                    setError(
                        "ID báo cáo không hợp lệ"
                    );

                    return;

                }

                let data:
                    ProductionReport;


                // ======================================
                // BÁO CÁO CHƯA DUYỆT
                // production_reports_temp
                // URL: ?source=pending
                // ======================================

                if (source === "pending") {

                    data =
                        await getTempReportById(
                            reportId
                        );

                }


                // ======================================
                // BÁO CÁO ĐÃ DUYỆT
                // production_reports
                //
                // source=approved hoặc không có source
                // đều lấy báo cáo đã duyệt
                // ======================================

                else {

                    data =
                        await getReportById(
                            reportId
                        );

                }


                console.log(
                    "REPORT DETAIL DATA:",
                    data
                );


                if (!data) {

                    setError(
                        "API không trả về dữ liệu báo cáo"
                    );

                    return;

                }


                setReport(data);

            } catch (err: unknown) {

                console.error(
                    "LOAD REPORT DETAIL ERROR:",
                    err
                );

                let message =
                    "Không thể tải chi tiết báo cáo";

                if (
                    typeof err === "object" &&
                    err !== null &&
                    "response" in err
                ) {

                    const axiosError =
                        err as {
                            response?: {
                                status?: number;
                                data?: {
                                    message?: string;
                                };
                            };
                        };

                    if (
                        axiosError.response
                            ?.data?.message
                    ) {

                        message =
                            axiosError.response
                                .data.message;

                    } else if (
                        axiosError.response
                            ?.status === 403
                    ) {

                        message =
                            "Bạn không có quyền xem báo cáo này";

                    } else if (
                        axiosError.response
                            ?.status === 404
                    ) {

                        message =
                            "Không tìm thấy báo cáo";

                    }

                }

                setError(message);

            } finally {

                setLoading(false);

            }

        };


        loadReport();

    }, [
        id,
        source
    ]);


    const formatDate = (
        value?: string | null
    ) => {

        if (!value) {

            return "Không có";

        }

        const date =
            new Date(value);

        if (
            Number.isNaN(
                date.getTime()
            )
        ) {

            return value;

        }

        return date.toLocaleDateString(
            "vi-VN"
        );

    };


    const formatDateTime = (
        value?: string | null
    ) => {

        if (!value) {

            return "Không có";

        }

        const date =
            new Date(value);

        if (
            Number.isNaN(
                date.getTime()
            )
        ) {

            return value;

        }

        return date.toLocaleString(
            "vi-VN"
        );

    };


    const showValue = (
        value:
            string |
            number |
            null |
            undefined
    ) => {

        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {

            return 0;

        }

        return value;

    };


    if (loading) {

        return (

            <div className="report-detail">

                <h2>
                    Đang tải dữ liệu...
                </h2>

            </div>

        );

    }


    if (error) {

        return (

            <div className="report-detail">

                <div className="detail-header">

                    <h1>
                        📋 Chi tiết báo cáo
                    </h1>

                    <button
                        type="button"
                        onClick={() =>
                            navigate(-1)
                        }
                    >
                        Quay lại
                    </button>

                </div>


                <div className="detail-card">

                    <h2>
                        Không thể tải dữ liệu
                    </h2>

                    <p>
                        {error}
                    </p>

                    <p>
                        <b>ID báo cáo:</b>{" "}
                        {id || "Không có"}
                    </p>

                    <p>
                        <b>Nguồn dữ liệu:</b>{" "}
                        {
                            source === "pending"
                                ? "Báo cáo chờ duyệt"
                                : "Báo cáo đã duyệt"
                        }
                    </p>

                </div>

            </div>

        );

    }


    if (!report) {

        return (

            <div className="report-detail">

                <div className="detail-header">

                    <h1>
                        📋 Chi tiết báo cáo
                    </h1>

                    <button
                        type="button"
                        onClick={() =>
                            navigate(-1)
                        }
                    >
                        Quay lại
                    </button>

                </div>

                <div className="detail-card">

                    <h2>
                        Không tìm thấy báo cáo
                    </h2>

                </div>

            </div>

        );

    }    return (

        <div className="report-detail">

            <div className="detail-header">

                <h1>
                    📋 Chi tiết báo cáo
                </h1>

                <button
                    type="button"
                    onClick={() =>
                        navigate(-1)
                    }
                >
                    Quay lại
                </button>

            </div>


            {
                (
                    source !== "pending" ||
                    report.status === "approved"
                ) && (

                    <div className="detail-card">

                        <h2>
                            Trạng thái duyệt
                        </h2>

                        <p>

                            <b>
                                Trạng thái:
                            </b>

                            {" "}

                            ✅ Đã duyệt

                        </p>


                        {
                            report.approved_at && (

                                <p>

                                    <b>
                                        Thời gian duyệt:
                                    </b>

                                    {" "}

                                    {
                                        formatDateTime(
                                            report.approved_at
                                        )
                                    }

                                </p>

                            )
                        }

                    </div>

                )
            }


            <div className="detail-card">

                <h2>
                    Thông tin chung
                </h2>


                <p>

                    <b>
                        Nhân viên:
                    </b>

                    {" "}

                    {
                        report.full_name ||
                        "Không có tên"
                    }

                    {
                        report.worker_code
                            ? ` (${report.worker_code})`
                            : ""
                    }

                </p>


                <p>

                    <b>
                        Công đoạn:
                    </b>

                    {" "}

                    {
                        report.process_name ||
                        "Không có"
                    }

                </p>


                <p>

                    <b>
                        Ngày sản xuất:
                    </b>

                    {" "}

                    {
                        formatDate(
                            report.work_date
                        )
                    }

                </p>


                <p>

                    <b>
                        Ca:
                    </b>

                    {" "}

                    {
                        report.shift ||
                        "Không có"
                    }

                </p>


                <p>

                    <b>
                        Số máy:
                    </b>

                    {" "}

                    {
                        report.machine_no ||
                        "Không có"
                    }

                </p>


                <p>

                    <b>
                        Sản phẩm:
                    </b>

                    {" "}

                    {
                        report.product_name ||
                        "Không có"
                    }

                </p>


                {
                    report.created_at && (

                        <p>

                            <b>
                                Thời gian gửi:
                            </b>

                            {" "}

                            {
                                formatDateTime(
                                    report.created_at
                                )
                            }

                        </p>

                    )
                }

            </div>


            <div className="detail-card">

                <h2>
                    Sản xuất
                </h2>


                <p>

                    <b>
                        Định mức:
                    </b>

                    {" "}

                    {
                        showValue(
                            report.standard_output
                        )
                    }

                </p>


                <p>

                    <b>
                        Thực tế:
                    </b>

                    {" "}

                    {
                        showValue(
                            report.actual_output
                        )
                    }

                </p>


                <p>

                    <b>
                        OK:
                    </b>

                    {" "}

                    {
                        showValue(
                            report.tt_ok
                        )
                    }

                </p>


                <p>

                    <b>
                        NG:
                    </b>

                    {" "}

                    {
                        showValue(
                            report.tt_ng
                        )
                    }

                </p>

            </div>


            <div className="detail-card">
                <h2>Chi tiết lỗi NG</h2>

                {report.defects && report.defects.length > 0 ? (
                    report.defects.map((defect, index) => (
                        <p key={defect.id ?? `${defect.defect_type_id ?? "defect"}-${index}`}>
                            <b>{defect.defect_name || defect.defect_code || "Lỗi NG"}:</b>{" "}
                            {showValue(defect.quantity)}
                        </p>
                    ))
                ) : (
                    <p>Không có lỗi NG chi tiết</p>
                )}

                <p><b>Tổng NG:</b> {showValue(report.tt_ng)}</p>
            </div>

            <div className="detail-card">
                <h2>Chi tiết thời gian trừ</h2>

                {report.deductions && report.deductions.length > 0 ? (
                    report.deductions.map((deduction, index) => (
                        <p key={deduction.id ?? `${deduction.deduction_type_id ?? "deduction"}-${index}`}>
                            <b>{deduction.deduction_name || deduction.deduction_code || "Thời gian trừ"}:</b>{" "}
                            {showValue(deduction.hours)} giờ
                        </p>
                    ))
                ) : (
                    <p>Không có thời gian trừ chi tiết</p>
                )}

                <p><b>Tổng thời gian trừ:</b> {showValue(report.deduction_time)} giờ</p>
                <p><b>Thời gian thực tế:</b> {showValue(report.actual_time)} giờ</p>
            </div>


            <div className="detail-card">

                <h2>
                    Ghi chú
                </h2>

                <p>

                    {
                        report.note ||
                        "Không có"
                    }

                </p>

            </div>

        </div>

    );

}


export default ReportDetail;