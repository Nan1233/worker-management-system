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
    updateTempReport
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

    const [
        year,
        month,
        day
    ] = value
        .split("T")[0]
        .split("-");

    if (
        !year ||
        !month ||
        !day
    ) {
        return value;
    }

    return `${day}/${month}/${year}`;
};


const formatNumber = (
    value?: number | string | null
): string => {
    return Number(
        value ?? 0
    ).toLocaleString(
        "vi-VN",
        {
            maximumFractionDigits: 2
        }
    );
};


function SelectedReportsReview() {
    const navigate =
        useNavigate();


    // =====================================================
    // USER VÀ QUYỀN
    // =====================================================

    const savedUser =
        localStorage.getItem("user");

    let currentUser: {
        role?: string;
    } | null = null;

    try {
        currentUser =
            savedUser
                ? JSON.parse(savedUser)
                : null;
    } catch (err) {
        console.error(
            "PARSE USER ERROR:",
            err
        );
    }


    const isLead =
        currentUser?.role === "lead";


    const canEdit =
        currentUser?.role === "lead" ||
        currentUser?.role === "manager" ||
        currentUser?.role === "admin";


    const basePath =
        isLead
            ? "/lead"
            : "/manager";


    // =====================================================
    // STATE
    // =====================================================

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


    // =====================================================
    // INLINE EDIT
    // =====================================================

    const [
        editingId,
        setEditingId
    ] = useState<number | null>(null);


    const [
        saving,
        setSaving
    ] = useState(false);


    const [
        editForm,
        setEditForm
    ] = useState<ProductionReport | null>(
        null
    );


    // =====================================================
    // BẮT ĐẦU SỬA
    // =====================================================

    const handleStartEdit = (
        report: ProductionReport
    ) => {
        const reportId =
            Number(report.id);

        if (
            !Number.isInteger(reportId) ||
            reportId <= 0
        ) {
            alert(
                "ID báo cáo không hợp lệ."
            );

            return;
        }

        setEditingId(reportId);

        setEditForm({
            ...report
        });
    };


    // =====================================================
    // HỦY SỬA
    // =====================================================

    const handleCancelEdit = () => {
        if (
            saving
        ) {
            return;
        }

        setEditingId(null);

        setEditForm(null);
    };


    // =====================================================
    // THAY ĐỔI FIELD
    // =====================================================

    const handleFieldChange = (
        field: keyof ProductionReport,
        value: unknown
    ) => {
        setEditForm(previousForm => {
            if (!previousForm) {
                return previousForm;
            }

            return {
                ...previousForm,
                [field]: value
            };
        });
    };


    // =====================================================
    // LƯU BÁO CÁO
    // =====================================================

    const handleSaveEdit = async () => {
        if (
            !editForm ||
            editingId === null
        ) {
            return;
        }


        if (!editForm.work_date) {
            alert(
                "Vui lòng chọn ngày sản xuất."
            );

            return;
        }


        if (!editForm.shift) {
            alert(
                "Vui lòng chọn ca."
            );

            return;
        }


        if (!editForm.machine_no?.trim()) {
            alert(
                "Vui lòng nhập số máy."
            );

            return;
        }


        if (!editForm.product_name?.trim()) {
            alert(
                "Vui lòng nhập sản phẩm."
            );

            return;
        }


        try {
            setSaving(true);


            await updateTempReport(
                editingId,
                editForm
            );


            setReports(previousReports =>
                previousReports.map(report =>
                    Number(report.id) === editingId
                        ? {
                              ...report,
                              ...editForm
                          }
                        : report
                )
            );


            alert(
                "Đã cập nhật báo cáo."
            );


            setEditingId(null);

            setEditForm(null);
        } catch (err: unknown) {
            console.error(
                "UPDATE TEMP REPORT ERROR:",
                err
            );


            const message =
                axios.isAxiosError(err)
                    ? err.response?.data?.message ||
                      "Không thể cập nhật báo cáo"
                    : "Không thể cập nhật báo cáo";


            alert(message);
        } finally {
            setSaving(false);
        }
    };


    // =====================================================
    // TẢI CHI TIẾT CÁC BÁO CÁO
    // =====================================================
const loadReports = async (
    ids: number[]
) => {
    try {
        setLoading(true);
        setError("");

        const results: Array<
            ProductionReport | null
        > = await Promise.all(
            ids.map(
                async (
                    id
                ): Promise<
                    ProductionReport | null
                > => {
                    try {
                        const report =
                            await getTempReportDetail(
                                id
                            );

                        return report ?? null;
                    } catch (err) {
                        console.error(
                            `GET TEMP REPORT ${id} ERROR:`,
                            err
                        );

                        return null;
                    }
                }
            )
        );

        const validReports =
            results.filter(
                (
                    report
                ): report is ProductionReport =>
                    report !== null
            );

        setReports(validReports);

        if (
            validReports.length === 0
        ) {
            setError(
                "Không tìm thấy báo cáo hợp lệ."
            );
        } else if (
            validReports.length <
            ids.length
        ) {
            setError(
                "Một số báo cáo không thể tải hoặc không còn tồn tại."
            );
        }
    } catch (err) {
        console.error(
            "LOAD SELECTED REPORTS ERROR:",
            err
        );

        setReports([]);

        setError(
            "Không thể tải báo cáo."
        );
    } finally {
        setLoading(false);
    }
};


    // =====================================================
    // ĐỌC DANH SÁCH ID ĐÃ CHỌN
    // =====================================================

    useEffect(() => {
        const saved =
            sessionStorage.getItem(
                "selectedPendingReportIds"
            );


        if (!saved) {
            setLoading(false);

            setError(
                "Không tìm thấy báo cáo đã chọn."
            );

            return;
        }


        try {
            const parsedIds: unknown =
                JSON.parse(saved);


            if (
                !Array.isArray(parsedIds)
            ) {
                throw new Error(
                    "Danh sách báo cáo không hợp lệ"
                );
            }


            const ids = Array.from(
                new Set(
                    parsedIds
                        .map(id => Number(id))
                        .filter(
                            id =>
                                Number.isInteger(
                                    id
                                ) &&
                                id > 0
                        )
                )
            );


            if (
                ids.length === 0
            ) {
                setLoading(false);

                setError(
                    "Không tìm thấy báo cáo hợp lệ."
                );

                return;
            }


            void loadReports(ids);
        } catch (err) {
            console.error(
                "PARSE SELECTED REPORT IDS ERROR:",
                err
            );

            setLoading(false);

            setError(
                "Danh sách báo cáo đã chọn không hợp lệ."
            );
        }
    }, []);


    // =====================================================
    // DANH SÁCH ID HIỆN TẠI
    // =====================================================

    const visibleIds =
        useMemo(
            () =>
                reports
                    .map(
                        report =>
                            Number(report.id)
                    )
                    .filter(
                        id =>
                            Number.isInteger(
                                id
                            ) &&
                            id > 0
                    ),
            [reports]
        );


    // =====================================================
    // DUYỆT TẤT CẢ BÁO CÁO ĐANG XEM
    // =====================================================

    const handleApprove = async () => {
        if (
            visibleIds.length === 0
        ) {
            alert(
                "Không có báo cáo để duyệt."
            );

            return;
        }


        if (
            editingId !== null
        ) {
            alert(
                "Vui lòng lưu hoặc hủy chỉnh sửa trước khi duyệt."
            );

            return;
        }


        const confirmed =
            window.confirm(
                `Duyệt ${visibleIds.length} báo cáo?`
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
                `Đã duyệt ${visibleIds.length} báo cáo.`
            );


            sessionStorage.removeItem(
                "selectedPendingReportIds"
            );


            navigate(
                `${basePath}/reports`
            );
        } catch (err: unknown) {
            console.error(
                "APPROVE SELECTED REPORTS ERROR:",
                err
            );


            const message =
                axios.isAxiosError(err)
                    ? err.response?.data?.message ||
                      "Không thể duyệt báo cáo"
                    : "Không thể duyệt báo cáo";


            alert(message);
        } finally {
            setActionLoading(false);
        }
    };


    // =====================================================
    // GIAO DIỆN
    // =====================================================

    return (
        <main className="selected-review-page">
            <header className="selected-review-header">
                <div>
                    <button
                        type="button"
                        className="selected-review-back"
                        disabled={
                            actionLoading ||
                            saving
                        }
                        onClick={() =>
                            navigate(
                                `${basePath}/reports`
                            )
                        }
                    >
                        ← Quay lại danh sách
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
                        className="selected-review-approve"
                        onClick={
                            handleApprove
                        }
                        disabled={
                            loading ||
                            actionLoading ||
                            saving ||
                            editingId !== null ||
                            reports.length === 0
                        }
                    >
                        {actionLoading
                            ? "Đang xử lý..."
                            : `✓ Duyệt (${reports.length})`
                        }
                    </button>
                </div>
            </header>


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
                <div className="selected-report-list">
                    {reports.map(
                        (
                            report,
                            index
                        ) => {
                            const reportId =
                                Number(report.id);


                            const isEditing =
                                editingId ===
                                reportId;


                            const currentReport =
                                isEditing &&
                                editForm
                                    ? editForm
                                    : report;


                            return (
                                <article
                                    className="selected-report-card"
                                    key={
                                        report.id ??
                                        `${report.worker_code}-${index}`
                                    }
                                >
                                    <div className="selected-report-card-header">
                                        <div>
                                            <span className="selected-report-index">
                                                Báo cáo{" "}
                                                {index + 1}
                                            </span>


                                            <h2>
                                                {report.worker_code ||
                                                    "---"}

                                                {" - "}

                                                {report.full_name ||
                                                    "---"}
                                            </h2>
                                        </div>


                                        {canEdit && (
                                            <div className="selected-report-edit-actions">
                                                {!isEditing ? (
                                                    <button
                                                        type="button"
                                                        className="selected-review-edit"
                                                        disabled={
                                                            saving ||
                                                            actionLoading ||
                                                            editingId !==
                                                                null
                                                        }
                                                        onClick={() =>
                                                            handleStartEdit(
                                                                report
                                                            )
                                                        }
                                                    >
                                                        ✎ Sửa báo cáo
                                                    </button>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="selected-review-cancel"
                                                            disabled={
                                                                saving
                                                            }
                                                            onClick={
                                                                handleCancelEdit
                                                            }
                                                        >
                                                            Hủy
                                                        </button>


                                                        <button
                                                            type="button"
                                                            className="selected-review-save"
                                                            disabled={
                                                                saving
                                                            }
                                                            onClick={
                                                                handleSaveEdit
                                                            }
                                                        >
                                                            {saving
                                                                ? "Đang lưu..."
                                                                : "Lưu thay đổi"
                                                            }
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>


                                    <section className="selected-report-section">
                                        <h3>
                                            Thông tin chung
                                        </h3>


                                        <div className="selected-info-grid">
                                            <div className="selected-info-item">
                                                <span>
                                                    Ngày sản xuất
                                                </span>


                                                {isEditing ? (
                                                    <input
                                                        type="date"
                                                        value={
                                                            currentReport.work_date
                                                                ?.split(
                                                                    "T"
                                                                )[0] ||
                                                            ""
                                                        }
                                                        onChange={event =>
                                                            handleFieldChange(
                                                                "work_date",
                                                                event
                                                                    .target
                                                                    .value
                                                            )
                                                        }
                                                    />
                                                ) : (
                                                    <strong>
                                                        {formatDate(
                                                            currentReport.work_date
                                                        )}
                                                    </strong>
                                                )}
                                            </div>


                                            <div className="selected-info-item">
                                                <span>
                                                    Công đoạn
                                                </span>


                                                <strong>
                                                    {currentReport.process_name ||
                                                        "---"}
                                                </strong>
                                            </div>


                                            <div className="selected-info-item">
                                                <span>
                                                    Ca
                                                </span>


                                                {isEditing ? (
                                                    <select
                                                        value={
                                                            currentReport.shift ||
                                                            ""
                                                        }
                                                        onChange={event =>
                                                            handleFieldChange(
                                                                "shift",
                                                                event
                                                                    .target
                                                                    .value
                                                            )
                                                        }
                                                    >
                                                        <option value="">
                                                            Chọn ca
                                                        </option>

                                                        <option value="Ca 1">
                                                            Ca 1
                                                        </option>

                                                        <option value="Ca 2">
                                                            Ca 2
                                                        </option>

                                                        <option value="Ca 3">
                                                            Ca 3
                                                        </option>
                                                    </select>
                                                ) : (
                                                    <strong>
                                                        {currentReport.shift ||
                                                            "---"}
                                                    </strong>
                                                )}
                                            </div>


                                            <div className="selected-info-item">
                                                <span>
                                                    Số máy
                                                </span>


                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        value={
                                                            currentReport.machine_no ||
                                                            ""
                                                        }
                                                        onChange={event =>
                                                            handleFieldChange(
                                                                "machine_no",
                                                                event
                                                                    .target
                                                                    .value
                                                            )
                                                        }
                                                    />
                                                ) : (
                                                    <strong>
                                                        {currentReport.machine_no ||
                                                            "---"}
                                                    </strong>
                                                )}
                                            </div>


                                            <div className="selected-info-item">
                                                <span>
                                                    Sản phẩm
                                                </span>


                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        value={
                                                            currentReport.product_name ||
                                                            ""
                                                        }
                                                        onChange={event =>
                                                            handleFieldChange(
                                                                "product_name",
                                                                event
                                                                    .target
                                                                    .value
                                                            )
                                                        }
                                                    />
                                                ) : (
                                                    <strong>
                                                        {currentReport.product_name ||
                                                            "---"}
                                                    </strong>
                                                )}
                                            </div>
                                        </div>
                                    </section>


                                    <div className="selected-report-columns">
                                        <section className="selected-report-section">
                                            <h3>
                                                Tổng hợp thời gian
                                            </h3>


                                            <div className="selected-summary-grid">
                                                <div>
                                                    <span>
                                                        Tổng thời gian
                                                    </span>


                                                    {isEditing ? (
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={
                                                                currentReport.total_time ??
                                                                0
                                                            }
                                                            onChange={event =>
                                                                handleFieldChange(
                                                                    "total_time",
                                                                    Number(
                                                                        event
                                                                            .target
                                                                            .value
                                                                    )
                                                                )
                                                            }
                                                        />
                                                    ) : (
                                                        <strong>
                                                            {formatNumber(
                                                                currentReport.total_time
                                                            )}{" "}
                                                            giờ
                                                        </strong>
                                                    )}
                                                </div>


                                                <div>
                                                    <span>
                                                        Thời gian trừ
                                                    </span>


                                                    {isEditing ? (
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={
                                                                currentReport.deduction_time ??
                                                                0
                                                            }
                                                            onChange={event =>
                                                                handleFieldChange(
                                                                    "deduction_time",
                                                                    Number(
                                                                        event
                                                                            .target
                                                                            .value
                                                                    )
                                                                )
                                                            }
                                                        />
                                                    ) : (
                                                        <strong>
                                                            {formatNumber(
                                                                currentReport.deduction_time
                                                            )}{" "}
                                                            giờ
                                                        </strong>
                                                    )}
                                                </div>


                                                <div>
                                                    <span>
                                                        Thời gian thực tế
                                                    </span>


                                                    {isEditing ? (
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={
                                                                currentReport.actual_time ??
                                                                0
                                                            }
                                                            onChange={event =>
                                                                handleFieldChange(
                                                                    "actual_time",
                                                                    Number(
                                                                        event
                                                                            .target
                                                                            .value
                                                                    )
                                                                )
                                                            }
                                                        />
                                                    ) : (
                                                        <strong>
                                                            {formatNumber(
                                                                currentReport.actual_time
                                                            )}{" "}
                                                            giờ
                                                        </strong>
                                                    )}
                                                </div>
                                            </div>
                                        </section>


                                        <section className="selected-report-section">
                                            <h3>
                                                Sản lượng và chất lượng
                                            </h3>


                                            <div className="selected-summary-grid selected-summary-grid-four">
                                                <div>
                                                    <span>
                                                        Định mức
                                                    </span>


                                                    {isEditing ? (
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="1"
                                                            value={
                                                                currentReport.standard_output ??
                                                                0
                                                            }
                                                            onChange={event =>
                                                                handleFieldChange(
                                                                    "standard_output",
                                                                    Number(
                                                                        event
                                                                            .target
                                                                            .value
                                                                    )
                                                                )
                                                            }
                                                        />
                                                    ) : (
                                                        <strong>
                                                            {formatNumber(
                                                                currentReport.standard_output
                                                            )}
                                                        </strong>
                                                    )}
                                                </div>


                                                <div>
                                                    <span>
                                                        Thực tế
                                                    </span>


                                                    {isEditing ? (
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="1"
                                                            value={
                                                                currentReport.actual_output ??
                                                                0
                                                            }
                                                            onChange={event =>
                                                                handleFieldChange(
                                                                    "actual_output",
                                                                    Number(
                                                                        event
                                                                            .target
                                                                            .value
                                                                    )
                                                                )
                                                            }
                                                        />
                                                    ) : (
                                                        <strong>
                                                            {formatNumber(
                                                                currentReport.actual_output
                                                            )}
                                                        </strong>
                                                    )}
                                                </div>


                                                <div>
                                                    <span>
                                                        TT OK
                                                    </span>


                                                    {isEditing ? (
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="1"
                                                            value={
                                                                currentReport.tt_ok ??
                                                                0
                                                            }
                                                            onChange={event =>
                                                                handleFieldChange(
                                                                    "tt_ok",
                                                                    Number(
                                                                        event
                                                                            .target
                                                                            .value
                                                                    )
                                                                )
                                                            }
                                                        />
                                                    ) : (
                                                        <strong>
                                                            {formatNumber(
                                                                currentReport.tt_ok
                                                            )}
                                                        </strong>
                                                    )}
                                                </div>


                                                <div>
                                                    <span>
                                                        TT NG
                                                    </span>


                                                    {isEditing ? (
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="1"
                                                            value={
                                                                currentReport.tt_ng ??
                                                                0
                                                            }
                                                            onChange={event =>
                                                                handleFieldChange(
                                                                    "tt_ng",
                                                                    Number(
                                                                        event
                                                                            .target
                                                                            .value
                                                                    )
                                                                )
                                                            }
                                                        />
                                                    ) : (
                                                        <strong>
                                                            {formatNumber(
                                                                currentReport.tt_ng
                                                            )}
                                                        </strong>
                                                    )}
                                                </div>
                                            </div>
                                        </section>
                                    </div>


                                    <div className="selected-report-columns">
                                        <section className="selected-report-section">
                                            <h3>
                                                Chi tiết thời gian trừ
                                            </h3>


                                            {currentReport.deductions
                                                ?.length ? (
                                                <div className="selected-detail-table-wrapper">
                                                    <table className="selected-detail-table">
                                                        <thead>
                                                            <tr>
                                                                <th>
                                                                    STT
                                                                </th>

                                                                <th>
                                                                    Nội dung trừ
                                                                </th>

                                                                <th>
                                                                    Số giờ
                                                                </th>
                                                            </tr>
                                                        </thead>


                                                        <tbody>
                                                            {currentReport.deductions.map(
                                                                (
                                                                    item,
                                                                    deductionIndex
                                                                ) => (
                                                                    <tr
                                                                        key={
                                                                            item.id ??
                                                                            `${item.deduction_type_id}-${deductionIndex}`
                                                                        }
                                                                    >
                                                                        <td>
                                                                            {deductionIndex +
                                                                                1}
                                                                        </td>

                                                                        <td>
                                                                            {item.deduction_name ||
                                                                                item.deduction_code ||
                                                                                "---"}
                                                                        </td>

                                                                        <td>
                                                                            {formatNumber(
                                                                                item.hours
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                )
                                                            )}
                                                        </tbody>


                                                        <tfoot>
                                                            <tr>
                                                                <td
                                                                    colSpan={
                                                                        2
                                                                    }
                                                                >
                                                                    Tổng thời gian trừ
                                                                </td>

                                                                <td>
                                                                    {formatNumber(
                                                                        currentReport.deduction_time
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        </tfoot>
                                                    </table>
                                                </div>
                                            ) : (
                                                <p className="selected-no-detail">
                                                    Không có thời gian trừ
                                                </p>
                                            )}
                                        </section>


                                        <section className="selected-report-section">
                                            <h3>
                                                Chi tiết NG
                                            </h3>


                                            {currentReport.defects
                                                ?.length ? (
                                                <div className="selected-detail-table-wrapper">
                                                    <table className="selected-detail-table">
                                                        <thead>
                                                            <tr>
                                                                <th>
                                                                    STT
                                                                </th>

                                                                <th>
                                                                    Loại NG
                                                                </th>

                                                                <th>
                                                                    Số lượng
                                                                </th>
                                                            </tr>
                                                        </thead>


                                                        <tbody>
                                                            {currentReport.defects.map(
                                                                (
                                                                    item,
                                                                    defectIndex
                                                                ) => (
                                                                    <tr
                                                                        key={
                                                                            item.id ??
                                                                            `${item.defect_type_id}-${defectIndex}`
                                                                        }
                                                                    >
                                                                        <td>
                                                                            {defectIndex +
                                                                                1}
                                                                        </td>

                                                                        <td>
                                                                            {item.defect_name ||
                                                                                item.defect_code ||
                                                                                "---"}
                                                                        </td>

                                                                        <td>
                                                                            {formatNumber(
                                                                                item.quantity
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                )
                                                            )}
                                                        </tbody>


                                                        <tfoot>
                                                            <tr>
                                                                <td
                                                                    colSpan={
                                                                        2
                                                                    }
                                                                >
                                                                    Tổng TT NG
                                                                </td>

                                                                <td>
                                                                    {formatNumber(
                                                                        currentReport.tt_ng
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        </tfoot>
                                                    </table>
                                                </div>
                                            ) : (
                                                <p className="selected-no-detail">
                                                    Không có chi tiết NG
                                                </p>
                                            )}
                                        </section>
                                    </div>


                                    <section className="selected-report-section selected-report-note-section">
                                        <h3>
                                            Ghi chú
                                        </h3>


                                        {isEditing ? (
                                            <textarea
                                                value={
                                                    currentReport.note ||
                                                    ""
                                                }
                                                rows={4}
                                                onChange={event =>
                                                    handleFieldChange(
                                                        "note",
                                                        event
                                                            .target
                                                            .value
                                                    )
                                                }
                                                placeholder="Nhập ghi chú"
                                            />
                                        ) : (
                                            <p>
                                                {currentReport.note ||
                                                    "Không có"}
                                            </p>
                                        )}
                                    </section>
                                </article>
                            );
                        }
                    )}
                </div>
            )}
        </main>
    );
}


export default SelectedReportsReview;