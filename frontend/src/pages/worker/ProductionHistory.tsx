import {
    useEffect,
    useState
} from "react";

import {
    useNavigate
} from "react-router-dom";

import axios from "axios";

import "./ProductionHistory.css";

import {
    getMyTempReports
} from "../../services/productionService";

import type {
    ProductionReport
} from "../../types/production";


const formatDate = (
    value?: string
): string => {

    if (!value) {

        return "---";

    }


    const datePart =
        value.split("T")[0];


    const [
        year,
        month,
        day
    ] = datePart.split("-");


    if (
        !year
        ||
        !month
        ||
        !day
    ) {

        return value;

    }


    return `${day}/${month}/${year}`;

};


const formatNumber = (
    value?: number | null
): string => {

    const numberValue =
        Number(value ?? 0);


    return new Intl.NumberFormat(
        "vi-VN"
    ).format(
        numberValue
    );

};


const formatHours = (
    value?: number | null
): string => {

    const numberValue =
        Number(value ?? 0);


    if (
        !Number.isFinite(
            numberValue
        )
    ) {

        return "0";

    }


    return numberValue.toLocaleString(
        "vi-VN",
        {
            maximumFractionDigits: 2
        }
    );

};


const getStatusInfo = (
    status?: string
) => {

    switch (status) {

        case "approved":

            return {
                label:
                    "Đã duyệt",

                className:
                    "approved"
            };


        case "need_fix":

            return {
                label:
                    "Cần sửa",

                className:
                    "need-fix"
            };


        case "rejected":

            return {
                label:
                    "Từ chối",

                className:
                    "rejected"
            };


        case "pending":

        default:

            return {
                label:
                    "Chờ duyệt",

                className:
                    "pending"
            };

    }

};


function ProductionHistory() {

    const navigate =
        useNavigate();


    const [
        reports,
        setReports
    ] = useState<ProductionReport[]>(
        []
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

        const loadReports =
            async () => {

                try {

                    setLoading(
                        true
                    );

                    setError(
                        ""
                    );


                    const data =
                        await getMyTempReports();


                    setReports(
                        Array.isArray(data)
                            ? data
                            : []
                    );

                }
                catch (err: unknown) {

                    console.error(
                        "Lỗi lấy lịch sử:",
                        err
                    );


                    const message =

                        axios.isAxiosError(
                            err
                        )

                            ? err.response
                                ?.data
                                ?.message

                                ||

                                "Không thể tải lịch sử báo cáo"

                            : "Không thể tải lịch sử báo cáo";


                    setError(
                        message
                    );

                }
                finally {

                    setLoading(
                        false
                    );

                }

            };


        void loadReports();

    }, []);


    const openDetail = (
        item: ProductionReport
    ) => {

        if (!item.id) {

            return;

        }


        const source =
            item.source
            ||
            (
                item.status ===
                "approved"

                    ? "approved"

                    : "pending"
            );


        navigate(
            `/worker/history/${item.id}?source=${source}`
        );

    };


    if (loading) {

        return (

            <main className="history-page">

                <div className="history-state-card">

                    <div className="history-loading-icon">
                        ◷
                    </div>

                    <strong>
                        Đang tải dữ liệu...
                    </strong>

                </div>

            </main>

        );

    }


    return (

        <main className="history-page">

            <div className="history-shell">

                <header className="history-header">

                    <div className="history-title-group">

                        <button
                            type="button"
                            className="history-back-button"
                            onClick={() =>
                                navigate(
                                    "/worker"
                                )
                            }
                            aria-label="Quay lại"
                        >
                            ←
                        </button>


                        <div>

                            <h1>
                                Báo cáo của tôi
                            </h1>

                            <p>
                                Theo dõi toàn bộ báo cáo sản xuất đã gửi
                            </p>

                        </div>

                    </div>


                    <div className="history-count">

                        <strong>
                            {reports.length}
                        </strong>

                        <span>
                            báo cáo
                        </span>

                    </div>

                </header>


                {error && (

                    <div className="history-error">

                        {error}

                    </div>

                )}


                {reports.length === 0 ? (

                    <div className="history-empty">

                        <div className="history-empty-icon">
                            📋
                        </div>

                        <strong>
                            Chưa có báo cáo
                        </strong>

                        <p>
                            Báo cáo sau khi gửi sẽ xuất hiện tại đây.
                        </p>

                    </div>

                ) : (

                    <section className="report-card">

                        <div className="table-container">

                            <table className="history-table">

                                <thead>

                                    <tr>

                                        <th className="column-index">
                                            STT
                                        </th>

                                        <th>
                                            Ngày
                                        </th>

                                        <th>
                                            Ca
                                        </th>

                                        <th>
                                            Công đoạn
                                        </th>

                                        <th>
                                            Máy
                                        </th>

                                        <th>
                                            Sản phẩm
                                        </th>

                                        <th className="numeric-column">
                                            Tổng giờ
                                        </th>

                                        <th className="numeric-column">
                                            Giờ trừ
                                        </th>

                                        <th className="numeric-column">
                                            Giờ thực tế
                                        </th>

                                        <th className="numeric-column">
                                            Định mức
                                        </th>

                                        <th className="numeric-column">
                                            Thực tế
                                        </th>

                                        <th className="numeric-column ok-column">
                                            OK
                                        </th>

                                        <th className="numeric-column ng-column">
                                            NG
                                        </th>

                                        <th>
                                            Trạng thái
                                        </th>

                                        <th className="action-column">
                                            Chi tiết
                                        </th>

                                    </tr>

                                </thead>


                                <tbody>

                                    {reports.map(
                                        (
                                            item,
                                            index
                                        ) => {

                                            const statusInfo =
                                                getStatusInfo(
                                                    item.status
                                                );


                                            return (

                                                <tr
                                                    key={
                                                        item.id
                                                        ??
                                                        `${item.work_date}-${index}`
                                                    }
                                                >

                                                    <td
                                                        data-label="STT"
                                                        className="column-index"
                                                    >
                                                        {index + 1}
                                                    </td>


                                                    <td
                                                        data-label="Ngày"
                                                        className="date-cell"
                                                    >
                                                        {
                                                            formatDate(
                                                                item.work_date
                                                            )
                                                        }
                                                    </td>


                                                    <td
                                                        data-label="Ca"
                                                    >
                                                        <span className="shift-badge">

                                                            {
                                                                item.shift
                                                                ||
                                                                "---"
                                                            }

                                                        </span>
                                                    </td>


                                                    <td
                                                        data-label="Công đoạn"
                                                    >
                                                        {
                                                            item.process_name
                                                            ||
                                                            "---"
                                                        }
                                                    </td>


                                                    <td
                                                        data-label="Máy"
                                                        className="machine-cell"
                                                    >
                                                        {
                                                            item.machine_no
                                                            ||
                                                            "---"
                                                        }
                                                    </td>


                                                    <td
                                                        data-label="Sản phẩm"
                                                        className="product-cell"
                                                    >
                                                        {
                                                            item.product_name
                                                            ||
                                                            "---"
                                                        }
                                                    </td>


                                                    <td
                                                        data-label="Tổng giờ"
                                                        className="numeric-column"
                                                    >
                                                        {
                                                            formatHours(
                                                                item.total_time
                                                            )
                                                        }
                                                    </td>


                                                    <td
                                                        data-label="Giờ trừ"
                                                        className="numeric-column"
                                                    >
                                                        {
                                                            formatHours(
                                                                item.deduction_time
                                                            )
                                                        }
                                                    </td>


                                                    <td
                                                        data-label="Giờ thực tế"
                                                        className="numeric-column"
                                                    >
                                                        {
                                                            formatHours(
                                                                item.actual_time
                                                            )
                                                        }
                                                    </td>


                                                    <td
                                                        data-label="Định mức"
                                                        className="numeric-column"
                                                    >
                                                        {
                                                            formatNumber(
                                                                item.standard_output
                                                            )
                                                        }
                                                    </td>


                                                    <td
                                                        data-label="Thực tế"
                                                        className="numeric-column actual-column"
                                                    >
                                                        {
                                                            formatNumber(
                                                                item.actual_output
                                                            )
                                                        }
                                                    </td>


                                                    <td
                                                        data-label="OK"
                                                        className="numeric-column ok-column"
                                                    >
                                                        {
                                                            formatNumber(
                                                                item.tt_ok
                                                            )
                                                        }
                                                    </td>


                                                    <td
                                                        data-label="NG"
                                                        className="numeric-column ng-column"
                                                    >
                                                        {
                                                            formatNumber(
                                                                item.tt_ng
                                                            )
                                                        }
                                                    </td>


                                                    <td
                                                        data-label="Trạng thái"
                                                    >

                                                        <span
                                                            className={
                                                                `history-status ${statusInfo.className}`
                                                            }
                                                        >

                                                            {
                                                                statusInfo.label
                                                            }

                                                        </span>

                                                    </td>


                                                    <td
                                                        data-label="Chi tiết"
                                                        className="action-column"
                                                    >

                                                        <button
                                                            type="button"
                                                            className="detail-btn"
                                                            onClick={() =>
                                                                openDetail(
                                                                    item
                                                                )
                                                            }
                                                        >
                                                            Xem
                                                        </button>

                                                    </td>

                                                </tr>

                                            );

                                        }
                                    )}

                                </tbody>

                            </table>

                        </div>

                    </section>

                )}

            </div>

        </main>

    );

}


export default ProductionHistory;