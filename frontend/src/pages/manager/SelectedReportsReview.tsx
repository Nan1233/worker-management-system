import {
    useEffect,
    useMemo,
    useState
} from "react";

import {
    useNavigate
} from "react-router-dom";

import axios from "axios";

import api from "../../api/axios";

import AutocompleteInput from "../../components/common/AutocompleteInput";

import {
    getMachinesByProcess,
    getProductStandardsByProcess
} from "../../services/masterDataService";

import type {
    MachineOption,
    ProductStandardOption
} from "../../services/masterDataService";

import {
    approveSelectedTempReports,
    getTempReportDetail,
    updateTempReport
} from "../../services/productionService";

import type {
    ProductionDeduction,
    ProductionDefect,
    ProductionReport
} from "../../types/production";

import "./SelectedReportsReview.css";


const getDeductionOptionsByProcess = async (
    processId: number
): Promise<ProductionDeduction[]> => {
    const response = await api.get(
        `/processes/${processId}/deductions`
    );

    const rows =
        response.data.data ||
        response.data ||
        [];

    return rows.map(
        (item: {
            id: number;
            deduction_code?: string;
            deduction_name: string;
        }) => ({
            deduction_type_id: item.id,
            deduction_code:
                item.deduction_code || "",
            deduction_name:
                item.deduction_name,
            hours: 1
        })
    );
};


const getDefectOptionsByProcess = async (
    processId: number
): Promise<ProductionDefect[]> => {
    const response = await api.get(
        `/processes/${processId}/defects`
    );

    const rows =
        response.data.data ||
        response.data ||
        [];

    return rows.map(
        (item: {
            id: number;
            defect_code?: string;
            defect_name: string;
        }) => ({
            defect_type_id: item.id,
            defect_code:
                item.defect_code || "",
            defect_name:
                item.defect_name,
            quantity: 0
        })
    );
};


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
const [
    deductionOptions,
    setDeductionOptions
] = useState<ProductionDeduction[]>([]);


const [
    defectOptions,
    setDefectOptions
] = useState<ProductionDefect[]>([]);


const [
    selectedDeductionId,
    setSelectedDeductionId
] = useState("");


const [
    selectedDefectId,
    setSelectedDefectId
] = useState("");


const [
    showDeductionSelector,
    setShowDeductionSelector
] = useState(false);


const [
    showDefectSelector,
    setShowDefectSelector
] = useState(false);


const [
    machineOptions,
    setMachineOptions
] = useState<MachineOption[]>([]);


const [
    productOptions,
    setProductOptions
] = useState<ProductStandardOption[]>([]);


const [
    selectedMachineCode,
    setSelectedMachineCode
] = useState("");


const [
    selectedProductCode,
    setSelectedProductCode
] = useState("");

    // =====================================================
    // BẮT ĐẦU SỬA
    // =====================================================

const handleStartEdit = async (
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
    ...report,
    deductions: [
        ...(report.deductions || [])
    ],
    defects: [
        ...(report.defects || [])
    ]
});

setSelectedDeductionId("");
setSelectedDefectId("");
setShowDeductionSelector(false);
setShowDefectSelector(false);
setSelectedMachineCode(report.machine_no || "");
setSelectedProductCode(report.product_name || "");

const processId =
    Number(report.process_id);

if (
    !Number.isInteger(processId) ||
    processId <= 0
) {
    setDeductionOptions([]);
    setDefectOptions([]);
    return;
}

try {

    const [
        deductionList,
        defectList,
        machineList,
        productList
    ] = await Promise.all([
        getDeductionOptionsByProcess(
            processId
        ),
        getDefectOptionsByProcess(
            processId
        ),
        getMachinesByProcess(
            processId
        ),
        getProductStandardsByProcess(
            processId
        )
    ]);

    setDeductionOptions(
        deductionList
    );

    setDefectOptions(
        defectList
    );

    setMachineOptions(
        machineList
    );

    setProductOptions(
        productList
    );

} catch (err) {

    console.error(
        "LOAD REPORT OPTIONS ERROR:",
        err
    );

    setDeductionOptions([]);
    setDefectOptions([]);
    setMachineOptions([]);
    setProductOptions([]);

}
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

        setShowDeductionSelector(false);
        setShowDefectSelector(false);
        setSelectedDeductionId("");
        setSelectedDefectId("");
        setSelectedMachineCode("");
        setSelectedProductCode("");
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
    // SỬA CHI TIẾT THỜI GIAN TRỪ
    // =====================================================

    const updateDeduction = (
        index: number,
        field: keyof ProductionDeduction,
        value: string | number
    ) => {
        setEditForm(previousForm => {
            if (!previousForm) {
                return previousForm;
            }

            const deductions = [
                ...(previousForm.deductions || [])
            ];

            deductions[index] = {
                ...deductions[index],
                [field]: value
            };

            const deductionTime = deductions.reduce(
                (sum, item) =>
                    sum + Math.max(0, Number(item.hours) || 0),
                0
            );

            const totalTime =
                Math.max(
                    0,
                    Number(previousForm.total_time) || 0
                );

            return {
                ...previousForm,
                deductions,
                deduction_time: deductionTime,
                actual_time: Math.max(
                    0,
                    totalTime - deductionTime
                )
            };
        });
    };


    const addDeduction = (
    deduction: ProductionDeduction
) => {
    setEditForm(previousForm => {
        if (!previousForm) {
            return previousForm;
        }

        const existed =
            (previousForm.deductions || [])
                .some(item =>
                    Number(
                        item.deduction_type_id
                    ) ===
                    Number(
                        deduction.deduction_type_id
                    )
                );

        if (existed) {
            alert(
                "Thời gian trừ này đã có trong báo cáo."
            );

            return previousForm;
        }

        return {
            ...previousForm,
            deductions: [
                ...(previousForm.deductions || []),
                {
                    deduction_type_id:
                        deduction.deduction_type_id,

                    deduction_code:
                        deduction.deduction_code,

                    deduction_name:
                        deduction.deduction_name,

                    hours: 1
                }
            ]
        };
    });
};


    const removeDeduction = (
        index: number
    ) => {
        setEditForm(previousForm => {
            if (!previousForm) {
                return previousForm;
            }

            const deductions = (
                previousForm.deductions || []
            ).filter(
                (_, itemIndex) =>
                    itemIndex !== index
            );

            const deductionTime = deductions.reduce(
                (sum, item) =>
                    sum + Math.max(0, Number(item.hours) || 0),
                0
            );

            const totalTime =
                Math.max(
                    0,
                    Number(previousForm.total_time) || 0
                );

            return {
                ...previousForm,
                deductions,
                deduction_time: deductionTime,
                actual_time: Math.max(
                    0,
                    totalTime - deductionTime
                )
            };
        });
    };


    // =====================================================
    // SỬA CHI TIẾT NG
    // =====================================================

    const updateDefect = (
        index: number,
        field: keyof ProductionDefect,
        value: string | number
    ) => {
        setEditForm(previousForm => {
            if (!previousForm) {
                return previousForm;
            }

            const defects = [
                ...(previousForm.defects || [])
            ];

            defects[index] = {
                ...defects[index],
                [field]: value
            };

            const totalNg = defects.reduce(
                (sum, item) =>
                    sum + Math.max(0, Number(item.quantity) || 0),
                0
            );

            const actualOutput =
                Math.max(
                    0,
                    Number(previousForm.actual_output) || 0
                );

            return {
                ...previousForm,
                defects,
                tt_ng: totalNg,
                tt_ok: Math.max(
                    0,
                    actualOutput - totalNg
                )
            };
        });
    };


    const addDefect = (
    defect: ProductionDefect
) => {
    setEditForm(previousForm => {
        if (!previousForm) {
            return previousForm;
        }

        const existed =
            (previousForm.defects || [])
                .some(item =>
                    Number(
                        item.defect_type_id
                    ) ===
                    Number(
                        defect.defect_type_id
                    )
                );

        if (existed) {
            alert(
                "Loại NG này đã có trong báo cáo."
            );

            return previousForm;
        }

        return {
            ...previousForm,
            defects: [
                ...(previousForm.defects || []),
                {
                    defect_type_id:
                        defect.defect_type_id,

                    defect_code:
                        defect.defect_code,

                    defect_name:
                        defect.defect_name,

                    quantity: 0
                }
            ]
        };
    });
};


    const removeDefect = (
        index: number
    ) => {
        setEditForm(previousForm => {
            if (!previousForm) {
                return previousForm;
            }

            const defects = (
                previousForm.defects || []
            ).filter(
                (_, itemIndex) =>
                    itemIndex !== index
            );

            const totalNg = defects.reduce(
                (sum, item) =>
                    sum + Math.max(0, Number(item.quantity) || 0),
                0
            );

            const actualOutput =
                Math.max(
                    0,
                    Number(previousForm.actual_output) || 0
                );

            return {
                ...previousForm,
                defects,
                tt_ng: totalNg,
                tt_ok: Math.max(
                    0,
                    actualOutput - totalNg
                )
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
                "Vui lòng chọn sản phẩm."
            );

            return;
        }


        const validMachine =
            machineOptions.some(
                item =>
                    item.machine_code ===
                    editForm.machine_no.trim()
            );

        if (!validMachine) {
            alert(
                "Vui lòng chọn số máy trong danh sách gợi ý."
            );

            return;
        }


        const selectedProduct =
            productOptions.find(
                item =>
                    item.product_code ===
                    editForm.product_name.trim()
            );

        if (!selectedProduct) {
            alert(
                "Vui lòng chọn sản phẩm trong danh sách gợi ý."
            );

            return;
        }


        const deductions = (
            editForm.deductions || []
        )
            .map(item => ({
                ...item,
                deduction_name:
                    item.deduction_name?.trim() || "",
                hours: Math.max(
                    0,
                    Number(item.hours) || 0
                )
            }))
            .filter(item =>
                Boolean(item.deduction_type_id) ||
                Boolean(item.deduction_name)
            );


        const defects = (
            editForm.defects || []
        )
            .map(item => ({
                ...item,
                defect_name:
                    item.defect_name?.trim() || "",
                quantity: Math.max(
                    0,
                    Math.trunc(
                        Number(item.quantity) || 0
                    )
                )
            }))
            .filter(item =>
                Boolean(item.defect_type_id) ||
                Boolean(item.defect_name)
            );


        const deductionTime =
            deductions.reduce(
                (sum, item) =>
                    sum + item.hours,
                0
            );


        const totalNg =
            defects.reduce(
                (sum, item) =>
                    sum + item.quantity,
                0
            );


        const normalizedForm: ProductionReport = {
            ...editForm,
            shift: editForm.shift.trim(),
            machine_no:
                editForm.machine_no.trim(),
            product_name:
                editForm.product_name.trim(),
            standard_output:
                Number(selectedProduct.standard_output) || 0,
            total_time: Math.max(
                0,
                Number(editForm.total_time) || 0
            ),
            deduction_time: deductionTime,
            actual_time: Math.max(
                0,
                (Number(editForm.total_time) || 0) -
                    deductionTime
            ),
            actual_output: Math.max(
                0,
                Math.trunc(
                    Number(editForm.actual_output) || 0
                )
            ),
            tt_ng: totalNg,
            tt_ok: Math.max(
                0,
                Math.trunc(
                    Number(editForm.actual_output) || 0
                ) - totalNg
            ),
            deductions,
            defects
        };


        try {
            setSaving(true);


            await updateTempReport(
                editingId,
                normalizedForm
            );


            setReports(previousReports =>
                previousReports.map(report =>
                    Number(report.id) === editingId
                        ? {
                              ...report,
                              ...normalizedForm
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

                                                        <option value="A">
                                                            Ca A
                                                        </option>

                                                        <option value="B">
                                                            Ca B
                                                        </option>

                                                        <option value="C">
                                                            Ca C
                                                        </option>

                                                        <option value="D">
                                                            Ca D
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
                                                    <AutocompleteInput
                                                        id={`machine-${reportId}`}
                                                        label=""
                                                        value={
                                                            selectedMachineCode
                                                        }
                                                        options={
                                                            machineOptions.map(
                                                                item => ({
                                                                    value:
                                                                        item.machine_code,
                                                                    label:
                                                                        item.machine_name ||
                                                                        item.machine_code
                                                                })
                                                            )
                                                        }
                                                        placeholder="Gõ để tìm số máy"
                                                        emptyMessage="Không tìm thấy máy"
                                                        onChange={value => {
                                                            setSelectedMachineCode(
                                                                value
                                                            );

                                                            handleFieldChange(
                                                                "machine_no",
                                                                value
                                                            );
                                                        }}
                                                        onSelect={option => {
                                                            setSelectedMachineCode(
                                                                option.value
                                                            );

                                                            handleFieldChange(
                                                                "machine_no",
                                                                option.value
                                                            );
                                                        }}
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
                                                    <AutocompleteInput
                                                        id={`product-${reportId}`}
                                                        label=""
                                                        value={
                                                            selectedProductCode
                                                        }
                                                        options={
                                                            productOptions.map(
                                                                item => ({
                                                                    value:
                                                                        item.product_code,
                                                                    description:
                                                                        `Định mức: ${formatNumber(
                                                                            item.standard_output
                                                                        )}`
                                                                })
                                                            )
                                                        }
                                                        placeholder="Gõ để tìm sản phẩm"
                                                        emptyMessage="Không tìm thấy sản phẩm"
                                                        onChange={value => {
                                                            setSelectedProductCode(
                                                                value
                                                            );

                                                            handleFieldChange(
                                                                "product_name",
                                                                value
                                                            );
                                                        }}
                                                        onSelect={option => {
                                                            const selected =
                                                                productOptions.find(
                                                                    item =>
                                                                        item.product_code ===
                                                                        option.value
                                                                );

                                                            setSelectedProductCode(
                                                                option.value
                                                            );

                                                            setEditForm(
                                                                previousForm => {
                                                                    if (!previousForm) {
                                                                        return previousForm;
                                                                    }

                                                                    return {
                                                                        ...previousForm,
                                                                        product_name:
                                                                            option.value,
                                                                        standard_output:
                                                                            Number(
                                                                                selected?.standard_output
                                                                            ) || 0
                                                                    };
                                                                }
                                                            );
                                                        }}
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
                                                                setEditForm(
                                                                    previousForm => {
                                                                        if (!previousForm) {
                                                                            return previousForm;
                                                                        }

                                                                        const totalTime =
                                                                            Math.max(
                                                                                0,
                                                                                Number(
                                                                                    event.target.value
                                                                                ) || 0
                                                                            );

                                                                        return {
                                                                            ...previousForm,
                                                                            total_time: totalTime,
                                                                            actual_time:
                                                                                Math.max(
                                                                                    0,
                                                                                    totalTime -
                                                                                        (
                                                                                            Number(
                                                                                                previousForm.deduction_time
                                                                                            ) || 0
                                                                                        )
                                                                                )
                                                                        };
                                                                    }
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
                                                            readOnly
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


                                            </div>
                                        </section>
                                    </div>


                                    <div className="selected-report-columns">
                                        <section className="selected-report-section">
                                            <h3>
                                                Chi tiết thời gian trừ
                                            </h3>


                                            {isEditing ? (
                                                <>
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

                                                                    <th>
                                                                        Thao tác
                                                                    </th>
                                                                </tr>
                                                            </thead>

                                                            <tbody>
                                                                {(currentReport.deductions || []).map(
                                                                    (
                                                                        item,
                                                                        deductionIndex
                                                                    ) => (
                                                                        <tr
                                                                            key={
                                                                                item.id ??
                                                                                `new-deduction-${deductionIndex}`
                                                                            }
                                                                        >
                                                                            <td>
                                                                                {deductionIndex + 1}
                                                                            </td>

                                                                            <td>
                                                                                <input
    type="text"
    value={
        item.deduction_name ||
        item.deduction_code ||
        ""
    }
    readOnly
/>
                                                                            </td>

                                                                            <td>
                                                                                <input
                                                                                    type="number"
                                                                                    min="0"
                                                                                    step="0.01"
                                                                                    value={
                                                                                        item.hours ?? 0
                                                                                    }
                                                                                    onChange={event =>
                                                                                        updateDeduction(
                                                                                            deductionIndex,
                                                                                            "hours",
                                                                                            Number(
                                                                                                event.target.value
                                                                                            )
                                                                                        )
                                                                                    }
                                                                                />
                                                                            </td>

                                                                            <td>
                                                                                <button
                                                                                    type="button"
                                                                                    className="selected-review-cancel"
                                                                                    disabled={saving}
                                                                                    onClick={() =>
                                                                                        removeDeduction(
                                                                                            deductionIndex
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    Xóa
                                                                                </button>
                                                                            </td>
                                                                        </tr>
                                                                    )
                                                                )}
                                                            </tbody>

                                                            <tfoot>
                                                                <tr>
                                                                    <td colSpan={2}>
                                                                        Tổng thời gian trừ
                                                                    </td>

                                                                    <td>
                                                                        {formatNumber(
                                                                            currentReport.deduction_time
                                                                        )}
                                                                    </td>

                                                                    <td />
                                                                </tr>
                                                            </tfoot>
                                                        </table>
                                                    </div>
{showDeductionSelector ? (
                                                        <div className="selected-add-row">
                                                            <select
                                                                value={selectedDeductionId}
                                                                onChange={event =>
                                                                    setSelectedDeductionId(
                                                                        event.target.value
                                                                    )
                                                                }
                                                            >
                                                                <option value="">
                                                                    Chọn loại thời gian trừ
                                                                </option>

                                                                {deductionOptions
                                                                    .filter(option =>
                                                                        !(currentReport.deductions || [])
                                                                            .some(item =>
                                                                                Number(
                                                                                    item.deduction_type_id
                                                                                ) ===
                                                                                Number(
                                                                                    option.deduction_type_id
                                                                                )
                                                                            )
                                                                    )
                                                                    .map(option => (
                                                                        <option
                                                                            key={option.deduction_type_id}
                                                                            value={option.deduction_type_id}
                                                                        >
                                                                            {option.deduction_name}
                                                                        </option>
                                                                    ))}
                                                            </select>

                                                            <button
                                                                type="button"
                                                                className="selected-review-save"
                                                                disabled={
                                                                    saving ||
                                                                    !selectedDeductionId
                                                                }
                                                                onClick={() => {
                                                                    const selected =
                                                                        deductionOptions.find(
                                                                            item =>
                                                                                Number(
                                                                                    item.deduction_type_id
                                                                                ) ===
                                                                                Number(
                                                                                    selectedDeductionId
                                                                                )
                                                                        );

                                                                    if (!selected) {
                                                                        return;
                                                                    }

                                                                    addDeduction(
                                                                        selected
                                                                    );

                                                                    setSelectedDeductionId(
                                                                        ""
                                                                    );

                                                                    setShowDeductionSelector(
                                                                        false
                                                                    );
                                                                }}
                                                            >
                                                                Xác nhận thêm
                                                            </button>

                                                            <button
                                                                type="button"
                                                                className="selected-review-cancel"
                                                                disabled={saving}
                                                                onClick={() => {
                                                                    setSelectedDeductionId(
                                                                        ""
                                                                    );

                                                                    setShowDeductionSelector(
                                                                        false
                                                                    );
                                                                }}
                                                            >
                                                                Hủy
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className="selected-review-edit"
                                                            disabled={saving}
                                                            onClick={() =>
                                                                setShowDeductionSelector(
                                                                    true
                                                                )
                                                            }
                                                        >
                                                            + Thêm thời gian trừ
                                                        </button>
                                                    )}
                                                </>
                                            ) : currentReport.deductions
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


                                            {isEditing ? (
                                                <>
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

                                                                    <th>
                                                                        Thao tác
                                                                    </th>
                                                                </tr>
                                                            </thead>

                                                            <tbody>
                                                                {(currentReport.defects || []).map(
                                                                    (
                                                                        item,
                                                                        defectIndex
                                                                    ) => (
                                                                        <tr
                                                                            key={
                                                                                item.id ??
                                                                                `new-defect-${defectIndex}`
                                                                            }
                                                                        >
                                                                            <td>
                                                                                {defectIndex + 1}
                                                                            </td>

                                                                            <td>
                                                                                <input
    type="text"
    value={
        item.defect_name ||
        item.defect_code ||
        ""
    }
    readOnly
/>
                                                                            </td>

                                                                            <td>
                                                                                <input
                                                                                    type="number"
                                                                                    min="0"
                                                                                    step="1"
                                                                                    value={
                                                                                        item.quantity ?? 0
                                                                                    }
                                                                                    onChange={event =>
                                                                                        updateDefect(
                                                                                            defectIndex,
                                                                                            "quantity",
                                                                                            Math.max(
                                                                                                0,
                                                                                                Math.trunc(
                                                                                                    Number(
                                                                                                        event.target.value
                                                                                                    ) || 0
                                                                                                )
                                                                                            )
                                                                                        )
                                                                                    }
                                                                                />
                                                                            </td>

                                                                            <td>
                                                                                <button
                                                                                    type="button"
                                                                                    className="selected-review-cancel"
                                                                                    disabled={saving}
                                                                                    onClick={() =>
                                                                                        removeDefect(
                                                                                            defectIndex
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    Xóa
                                                                                </button>
                                                                            </td>
                                                                        </tr>
                                                                    )
                                                                )}
                                                            </tbody>

                                                            <tfoot>
                                                                <tr>
                                                                    <td colSpan={2}>
                                                                        Tổng TT NG
                                                                    </td>

                                                                    <td>
                                                                        {formatNumber(
                                                                            currentReport.tt_ng
                                                                        )}
                                                                    </td>

                                                                    <td />
                                                                </tr>
                                                            </tfoot>
                                                        </table>
                                                    </div>
{showDefectSelector ? (
                                                        <div className="selected-add-row">
                                                            <select
                                                                value={selectedDefectId}
                                                                onChange={event =>
                                                                    setSelectedDefectId(
                                                                        event.target.value
                                                                    )
                                                                }
                                                            >
                                                                <option value="">
                                                                    Chọn loại NG
                                                                </option>

                                                                {defectOptions
                                                                    .filter(option =>
                                                                        !(currentReport.defects || [])
                                                                            .some(item =>
                                                                                Number(
                                                                                    item.defect_type_id
                                                                                ) ===
                                                                                Number(
                                                                                    option.defect_type_id
                                                                                )
                                                                            )
                                                                    )
                                                                    .map(option => (
                                                                        <option
                                                                            key={option.defect_type_id}
                                                                            value={option.defect_type_id}
                                                                        >
                                                                            {option.defect_name}
                                                                        </option>
                                                                    ))}
                                                            </select>

                                                            <button
                                                                type="button"
                                                                className="selected-review-save"
                                                                disabled={
                                                                    saving ||
                                                                    !selectedDefectId
                                                                }
                                                                onClick={() => {
                                                                    const selected =
                                                                        defectOptions.find(
                                                                            item =>
                                                                                Number(
                                                                                    item.defect_type_id
                                                                                ) ===
                                                                                Number(
                                                                                    selectedDefectId
                                                                                )
                                                                        );

                                                                    if (!selected) {
                                                                        return;
                                                                    }

                                                                    addDefect(
                                                                        selected
                                                                    );

                                                                    setSelectedDefectId(
                                                                        ""
                                                                    );

                                                                    setShowDefectSelector(
                                                                        false
                                                                    );
                                                                }}
                                                            >
                                                                Xác nhận thêm
                                                            </button>

                                                            <button
                                                                type="button"
                                                                className="selected-review-cancel"
                                                                disabled={saving}
                                                                onClick={() => {
                                                                    setSelectedDefectId(
                                                                        ""
                                                                    );

                                                                    setShowDefectSelector(
                                                                        false
                                                                    );
                                                                }}
                                                            >
                                                                Hủy
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className="selected-review-edit"
                                                            disabled={saving}
                                                            onClick={() =>
                                                                setShowDefectSelector(
                                                                    true
                                                                )
                                                            }
                                                        >
                                                            + Thêm loại NG
                                                        </button>
                                                    )}
                                                </>
                                            ) : currentReport.defects
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