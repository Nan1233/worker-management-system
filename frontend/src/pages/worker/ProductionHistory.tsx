import {
    useEffect,
    useMemo,
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


// =====================================================
// SỐ BÁO CÁO TRÊN MỘT TRANG
// =====================================================

const ITEMS_PER_PAGE = 10;


// =====================================================
// FORMAT NGÀY DD/MM/YYYY
// =====================================================

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


// =====================================================
// FORMAT SỐ
// =====================================================

const formatNumber = (
    value?: number | null
): string => {

    return new Intl.NumberFormat(
        "vi-VN"
    ).format(
        Number(
            value
            ??
            0
        )
    );

};


// =====================================================
// CHUẨN HÓA CHUỖI TÌM KIẾM
// =====================================================

const normalizeText = (
    value?: string
): string => {

    return String(
        value
        ??
        ""
    )
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .replace(
            /đ/g,
            "d"
        );

};


// =====================================================
// THÔNG TIN TRẠNG THÁI
// =====================================================

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

            return {

                label:
                    "Chờ duyệt",

                className:
                    "pending"

            };


        default:

            return {

                label:
                    "Chờ duyệt",

                className:
                    "pending"

            };

    }

};


// =====================================================
// COMPONENT
// =====================================================

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


    const [
        searchKeyword,
        setSearchKeyword
    ] = useState("");


    const [
        selectedDate,
        setSelectedDate
    ] = useState("");


    const [
        selectedShift,
        setSelectedShift
    ] = useState("");


    const [
        selectedStatus,
        setSelectedStatus
    ] = useState("");


    const [
        currentPage,
        setCurrentPage
    ] = useState(1);


    // =================================================
    // LOAD DANH SÁCH BÁO CÁO
    // =================================================

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

                        Array.isArray(
                            data
                        )

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


    // =================================================
    // LỌC DANH SÁCH
    // =================================================

    const filteredReports =
        useMemo(() => {

            const keyword =
                normalizeText(
                    searchKeyword
                );


            return reports.filter(
                (item) => {

                    const itemDate =
                        item.work_date
                            ?.split("T")[0]

                        ||

                        "";


                    const searchableText =
                        normalizeText(
                            [

                                item.machine_no,

                                item.product_name,

                                item.process_name,

                                item.shift

                            ].join(" ")
                        );


                    const matchesSearch =
                        !keyword

                        ||

                        searchableText.includes(
                            keyword
                        );


                    const matchesDate =
                        !selectedDate

                        ||

                        itemDate === selectedDate;


                    const matchesShift =
                        !selectedShift

                        ||

                        item.shift === selectedShift;


                    const matchesStatus =
                        !selectedStatus

                        ||

                        item.status === selectedStatus;


                    return (
                        matchesSearch
                        &&
                        matchesDate
                        &&
                        matchesShift
                        &&
                        matchesStatus
                    );

                }
            );

        }, [

            reports,

            searchKeyword,

            selectedDate,

            selectedShift,

            selectedStatus

        ]);


    // =================================================
    // RESET TRANG KHI LỌC
    // =================================================

    useEffect(() => {

        // Trang lọc mới luôn bắt đầu từ trang đầu tiên.
        setCurrentPage(
            1
        );

    }, [

        searchKeyword,

        selectedDate,

        selectedShift,

        selectedStatus

    ]);


    // =================================================
    // PHÂN TRANG
    // =================================================

    const totalPages =
        Math.max(

            1,

            Math.ceil(

                filteredReports.length

                /

                ITEMS_PER_PAGE

            )

        );


    const paginatedReports =
        filteredReports.slice(

            (
                currentPage
                -
                1
            )
            *
            ITEMS_PER_PAGE,

            currentPage
            *
            ITEMS_PER_PAGE

        );


    const hasActiveFilter =
        Boolean(

            searchKeyword

            ||

            selectedDate

            ||

            selectedShift

            ||

            selectedStatus

        );


    // =================================================
    // XÓA BỘ LỌC
    // =================================================

    const clearFilters = () => {

        setSearchKeyword(
            ""
        );

        setSelectedDate(
            ""
        );

        setSelectedShift(
            ""
        );

        setSelectedStatus(
            ""
        );

        setCurrentPage(
            1
        );

    };


    // =================================================
    // MỞ CHI TIẾT
    // =================================================

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
                item.status
                ===
                "approved"

                    ? "approved"

                    : "pending"
            );


        navigate(
            `/worker/history/${item.id}?source=${source}`
        );

    };


    // =================================================
    // ĐANG TẢI
    // =================================================

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


                {/* =================================================
                    HEADER
                ================================================= */}

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

                                Theo dõi các báo cáo sản xuất đã gửi

                            </p>

                        </div>

                    </div>


                    <div className="history-count">

                        <strong>

                            {
                                filteredReports.length
                            }

                        </strong>


                        <span>

                            /
                            {" "}
                            {
                                reports.length
                            }
                            {" "}
                            báo cáo

                        </span>

                    </div>

                </header>


                {/* =================================================
                    BỘ LỌC
                ================================================= */}

                <section className="history-filter-card">

                    <div className="history-search-box">

                        <span>

                            ⌕

                        </span>


                        <input
                            type="search"
                            value={
                                searchKeyword
                            }
                            onChange={(event) =>
                                setSearchKeyword(
                                    event.target.value
                                )
                            }
                            placeholder="Tìm máy, sản phẩm, công đoạn..."
                            autoComplete="off"
                        />

                    </div>


                    <div className="history-filter-grid">

                        <label className="history-filter-field">

                            <span>

                                Ngày

                            </span>


                            <input
                                type="date"
                                value={
                                    selectedDate
                                }
                                onChange={(event) =>
                                    setSelectedDate(
                                        event.target.value
                                    )
                                }
                            />

                        </label>


                        <label className="history-filter-field">

                            <span>

                                Ca

                            </span>


                            <select
                                value={
                                    selectedShift
                                }
                                onChange={(event) =>
                                    setSelectedShift(
                                        event.target.value
                                    )
                                }
                            >

                                <option value="">

                                    Tất cả

                                </option>


                                <option value="A">

                                    A

                                </option>


                                <option value="B">

                                    B

                                </option>


                                <option value="C">

                                    C

                                </option>


                                <option value="D">

                                    D

                                </option>

                            </select>

                        </label>


                        <label className="history-filter-field">

                            <span>

                                Trạng thái

                            </span>


                            <select
                                value={
                                    selectedStatus
                                }
                                onChange={(event) =>
                                    setSelectedStatus(
                                        event.target.value
                                    )
                                }
                            >

                                <option value="">

                                    Tất cả

                                </option>


                                <option value="pending">

                                    Chờ duyệt

                                </option>


                                <option value="approved">

                                    Đã duyệt

                                </option>


                                <option value="need_fix">

                                    Cần sửa

                                </option>


                                <option value="rejected">

                                    Từ chối

                                </option>

                            </select>

                        </label>


                        <button
                            type="button"
                            className="history-clear-button"
                            onClick={
                                clearFilters
                            }
                            disabled={
                                !hasActiveFilter
                            }
                        >

                            Xóa lọc

                        </button>

                    </div>

                </section>


                {/* =================================================
                    LỖI
                ================================================= */}

                {
                    error
                    && (

                        <div className="history-error">

                            {error}

                        </div>

                    )
                }


                {/* =================================================
                    KHÔNG CÓ DỮ LIỆU
                ================================================= */}

                {
                    filteredReports.length
                    ===
                    0

                        ? (

                            <div className="history-empty">

                                <div className="history-empty-icon">



                                </div>


                                <strong>

                                    Không tìm thấy báo cáo

                                </strong>


                                <p>

                                    Thử thay đổi từ khóa hoặc bộ lọc.

                                </p>

                            </div>

                        )

                        : (

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

                                                    Máy

                                                </th>


                                                <th>

                                                    Sản phẩm

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

                                            {
                                                paginatedReports.map(
                                                    (
                                                        item,
                                                        index
                                                    ) => {

                                                        const statusInfo =
                                                            getStatusInfo(
                                                                item.status
                                                            );


                                                        const rowNumber =

                                                            (
                                                                currentPage
                                                                -
                                                                1
                                                            )

                                                            *

                                                            ITEMS_PER_PAGE

                                                            +

                                                            index

                                                            +

                                                            1;


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

                                                                    {
                                                                        rowNumber
                                                                    }

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
                                                                    className="shift-cell"
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
                                                                    data-label="Máy"
                                                                    className="machine-cell"
                                                                    title={
                                                                        item.machine_no
                                                                    }
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
                                                                    title={
                                                                        item.product_name
                                                                    }
                                                                >

                                                                    {
                                                                        item.product_name

                                                                        ||

                                                                        "---"
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
                                                                    className="status-cell"
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

                                                                        <span>

                                                                            ›

                                                                        </span>

                                                                    </button>

                                                                </td>

                                                            </tr>

                                                        );

                                                    }
                                                )
                                            }

                                        </tbody>

                                    </table>


                                    {/* =================================================
                                        PHÂN TRANG
                                    ================================================= */}

                                    {
                                        totalPages
                                        >
                                        1
                                        && (

                                            <div className="pagination">

                                                <button
                                                    type="button"
                                                    disabled={
                                                        currentPage
                                                        ===
                                                        1
                                                    }
                                                    onClick={() =>
                                                        setCurrentPage(
                                                            (prev) =>
                                                                Math.max(
                                                                    1,
                                                                    prev - 1
                                                                )
                                                        )
                                                    }
                                                >

                                                    ← Trước

                                                </button>


                                                {
                                                    Array.from(
                                                        {
                                                            length:
                                                                totalPages
                                                        }
                                                    ).map(
                                                        (
                                                            _,
                                                            index
                                                        ) => {

                                                            const page =
                                                                index + 1;


                                                            return (

                                                                <button
                                                                    key={
                                                                        page
                                                                    }
                                                                    type="button"
                                                                    className={
                                                                        currentPage
                                                                        ===
                                                                        page

                                                                            ? "active"

                                                                            : ""
                                                                    }
                                                                    onClick={() =>
                                                                        setCurrentPage(
                                                                            page
                                                                        )
                                                                    }
                                                                >

                                                                    {
                                                                        page
                                                                    }

                                                                </button>

                                                            );

                                                        }
                                                    )
                                                }


                                                <button
                                                    type="button"
                                                    disabled={
                                                        currentPage
                                                        ===
                                                        totalPages
                                                    }
                                                    onClick={() =>
                                                        setCurrentPage(
                                                            (prev) =>
                                                                Math.min(
                                                                    totalPages,
                                                                    prev + 1
                                                                )
                                                        )
                                                    }
                                                >

                                                    Sau →

                                                </button>

                                            </div>

                                        )
                                    }

                                </div>

                            </section>

                        )
                }

            </div>

        </main>

    );

}


export default ProductionHistory;
