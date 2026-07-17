import {
    useEffect,
    useMemo,
    useState
} from "react";

import {
    useNavigate
} from "react-router-dom";

import axios from "axios";

import {
    approveSelectedTempReports,
    getTempReportDetail,
    rejectSelectedTempReports
} from "../../services/productionService";

import type {
    ProductionReport
} from "../../types/production";

import "./SelectedReportsReview.css";


const formatDate = (
    value?: string
): string => {
    if (!value) {
        return "---";
    }

    const [year, month, day] = value
        .split("T")[0]
        .split("-");

    return year && month && day
        ? `${day}/${month}/${year}`
        : value;
};


const formatNumber = (
    value?: number | string | null
): string => {
    return Number(
        value ?? 0
    ).toLocaleString("vi-VN");
};


function SelectedReportsReview() {
    const navigate = useNavigate();

    const savedUser = localStorage.getItem("user");

    const currentUser = savedUser
        ? JSON.parse(savedUser)
        : null;

    const basePath =
        currentUser?.role === "lead"
            ? "/lead"
            : "/manager";


    const [
        reports,
        setReports
    ] = useState<ProductionReport[]>([]);

    const [
        loading,
        setLoading
    ] = useState(true);

    const [
        actionLoading,
        setActionLoading
    ] = useState(false);

    const [
        error,
        setError
    ] = useState("");


    const loadReports = async (
        ids: number[]
    ) => {
        try {
            setLoading(true);
            setError("");

            const results = await Promise.all(
                ids.map(async id => {
                    const response =
                        await getTempReportDetail(id);

                    return response?.data ?? response;
                })
            );

            const validReports =
                results.filter(
                    (
                        report
                    ): report is ProductionReport =>
                        Boolean(report)
                );

            setReports(validReports);
        } catch (err: unknown) {
            console.error(
                "GET SELECTED REPORT DETAILS ERROR:",
                err
            );

            const message =
                axios.isAxiosError(err)
                    ? err.response?.data?.message ||
                        "Không thể tải chi tiết báo cáo"
                    : "Không thể tải chi tiết báo cáo";

            setError(message);
            setReports([]);
        } finally {
            setLoading(false);
        }
    };


    useEffect(() => {
        const savedIds =
            sessionStorage.getItem(
                "selectedPendingReportIds"
            );

        if (!savedIds) {
            setError(
                "Không tìm thấy báo cáo đã chọn"
            );

            setLoading(false);

            return;
        }

        try {
            const parsedIds: unknown =
                JSON.parse(savedIds);

            if (
                !Array.isArray(parsedIds) ||
                parsedIds.length === 0
            ) {
                setError(
                    "Không có báo cáo nào được chọn"
                );

                setLoading(false);

                return;
            }

            const normalizedIds =
                parsedIds
                    .map(Number)
                    .filter(
                        id =>
                            Number.isInteger(id) &&
                            id > 0
                    );

            if (normalizedIds.length === 0) {
                setError(
                    "Danh sách báo cáo đã chọn không hợp lệ"
                );

                setLoading(false);

                return;
            }

            void loadReports(normalizedIds);
        } catch (err) {
            console.error(
                "PARSE SELECTED REPORT IDS ERROR:",
                err
            );

            setError(
                "Danh sách báo cáo đã chọn không hợp lệ"
            );

            setLoading(false);
        }
    }, []);


    const visibleIds = useMemo(
        () =>
            reports
                .map(report => Number(report.id))
                .filter(
                    id =>
                        Number.isInteger(id) &&
                        id > 0
                ),
        [reports]
    );


    const handleBack = () => {
        navigate(
            `${basePath}/reports`
        );
    };


    const handleApprove = async () => {
        if (visibleIds.length === 0) {
            alert(
                "Không có báo cáo để duyệt"
            );

            return;
        }

        const confirmed = window.confirm(
            `Duyệt ${visibleIds.length} báo cáo đang xem?`
        );

        if (!confirmed) {
            return;
        }

        try {
            setActionLoading(true);

            await approveSelectedTempReports(
                visibleIds
            );

            alert(
                `Đã duyệt ${visibleIds.length} báo cáo`
            );

            sessionStorage.removeItem(
                "selectedPendingReportIds"
            );

            navigate(
                `${basePath}/reports`
            );
        } catch (err: unknown) {
            console.error(
                "APPROVE REPORTS ERROR:",
                err
            );

            const message =
                axios.isAxiosError(err)
                    ? err.response?.data?.message ||
                        "Duyệt báo cáo thất bại"
                    : "Duyệt báo cáo thất bại";

            alert(message);
        } finally {
            setActionLoading(false);
        }
    };


    const handleReject = async () => {
        if (visibleIds.length === 0) {
            alert(
                "Không có báo cáo để từ chối"
            );

            return;
        }

        const reason = window.prompt(
            `Nhập lý do từ chối ${visibleIds.length} báo cáo:`
        );

        if (reason === null) {
            return;
        }

        const trimmedReason =
            reason.trim();

        if (!trimmedReason) {
            alert(
                "Vui lòng nhập lý do từ chối"
            );

            return;
        }

        const confirmed = window.confirm(
            `Từ chối ${visibleIds.length} báo cáo đang xem?`
        );

        if (!confirmed) {
            return;
        }

        try {
            setActionLoading(true);

            await rejectSelectedTempReports(
                visibleIds,
                trimmedReason
            );

            alert(
                `Đã từ chối ${visibleIds.length} báo cáo`
            );

            sessionStorage.removeItem(
                "selectedPendingReportIds"
            );

            navigate(
                `${basePath}/reports`
            );
        } catch (err: unknown) {
            console.error(
                "REJECT REPORTS ERROR:",
                err
            );

            const message =
                axios.isAxiosError(err)
                    ? err.response?.data?.message ||
                        "Từ chối báo cáo thất bại"
                    : "Từ chối báo cáo thất bại";

            alert(message);
        } finally {
            setActionLoading(false);
        }
    };


    return (
        <div className="selected-review-page">

            <div className="selected-review-header">

                <div>

                    <button
                        type="button"
                        className="selected-review-back"
                        onClick={handleBack}
                    >
                        ← Quay lại
                    </button>

                    <h1>
                        Chi tiết báo cáo đã chọn
                    </h1>

                    <p>
                        Đang xem{" "}
                        <strong>
                            {reports.length}
                        </strong>
                        {" "}báo cáo
                    </p>

                </div>


                <div className="selected-review-actions">

                    <button
                        type="button"
                        className="selected-review-reject"
                        onClick={handleReject}
                        disabled={
                            loading ||
                            actionLoading ||
                            reports.length === 0
                        }
                    >
                        ✕ Từ chối ({reports.length})
                    </button>

                    <button
                        type="button"
                        className="selected-review-approve"
                        onClick={handleApprove}
                        disabled={
                            loading ||
                            actionLoading ||
                            reports.length === 0
                        }
                    >
                        {
                            actionLoading
                                ? "Đang xử lý..."
                                : `✓ Duyệt (${reports.length})`
                        }
                    </button>

                </div>

            </div>


            {error && (

                <div className="selected-review-error">
                    {error}
                </div>

            )}


            {loading ? (

                <div className="selected-review-empty">
                    Đang tải chi tiết...
                </div>

            ) : reports.length === 0 ? (

                <div className="selected-review-empty">
                    Không có báo cáo để hiển thị
                </div>

            ) : (

                <div className="selected-review-table-wrapper">

                    <table className="selected-review-table">

                        <thead>

                            <tr>
                                <th>STT</th>
                                <th>Mã NV</th>
                                <th>Họ tên</th>
                                <th>Ngày</th>
                                <th>Công đoạn</th>
                                <th>Ca</th>
                                <th>Máy</th>
                                <th>Sản phẩm</th>
                                <th>Tổng giờ</th>
                                <th>Giờ trừ</th>
                                <th>Giờ thực tế</th>
                                <th>Định mức</th>
                                <th>Thực tế</th>
                                <th>TT OK</th>
                                <th>TT NG</th>
                                <th>Ghi chú</th>
                            </tr>

                        </thead>


                        <tbody>

                            {reports.map(
                                (
                                    report,
                                    index
                                ) => (

                                    <tr key={report.id}>

                                        <td>
                                            {index + 1}
                                        </td>

                                        <td>
                                            <strong>
                                                {
                                                    report.worker_code ||
                                                    "---"
                                                }
                                            </strong>
                                        </td>

                                        <td>
                                            {
                                                report.full_name ||
                                                "---"
                                            }
                                        </td>

                                        <td>
                                            {
                                                formatDate(
                                                    report.work_date
                                                )
                                            }
                                        </td>

                                        <td>
                                            {
                                                report.process_name ||
                                                "---"
                                            }
                                        </td>

                                        <td>
                                            {
                                                report.shift ||
                                                "---"
                                            }
                                        </td>

                                        <td>
                                            {
                                                report.machine_no ||
                                                "---"
                                            }
                                        </td>

                                        <td>
                                            {
                                                report.product_name ||
                                                "---"
                                            }
                                        </td>

                                        <td>
                                            {
                                                formatNumber(
                                                    report.total_time
                                                )
                                            }
                                        </td>

                                        <td>
                                            {
                                                formatNumber(
                                                    report.deduction_time
                                                )
                                            }
                                        </td>

                                        <td>
                                            {
                                                formatNumber(
                                                    report.actual_time
                                                )
                                            }
                                        </td>

                                        <td>
                                            {
                                                formatNumber(
                                                    report.standard_output
                                                )
                                            }
                                        </td>

                                        <td>
                                            {
                                                formatNumber(
                                                    report.actual_output
                                                )
                                            }
                                        </td>

                                        <td>
                                            {
                                                formatNumber(
                                                    report.tt_ok
                                                )
                                            }
                                        </td>

                                        <td>
                                            {
                                                formatNumber(
                                                    report.tt_ng
                                                )
                                            }
                                        </td>

                                        <td className="selected-review-note">
                                            {
                                                report.note ||
                                                "---"
                                            }
                                        </td>

                                    </tr>

                                )
                            )}

                        </tbody>

                    </table>

                </div>

            )}

        </div>
    );
}


export default SelectedReportsReview;