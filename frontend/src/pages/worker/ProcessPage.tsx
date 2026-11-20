import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";

import axios from "axios";

import {
    useNavigate,
    useParams
} from "react-router-dom";


import {
    createTempReport,
    updateTempReport,
} from "../../services/productionService";


import type { ProductStandardOption } from "../../services/masterDataService";

import { useToast } from "../../components/feedback/toastContext";
import { getApiError } from "../../utils/apiError";
import {
    clearProcessDraftAsync,
} from "./processDraftStorage";
import { createClientRequestId } from "../../utils/workerSubmitGuard";
import { clearSubmittedProcessDraft } from "./processSubmitDraftCompletion";
import { useProcessOnlineStatus } from "./useProcessOnlineStatus";
import { classifyProcessSubmitResponse } from "../../utils/processSubmitOutcome";
import { isTransientNetworkFailure } from "../../services/offlineReportQueue";
import { queueRemainingMachineReports, shouldQueuePendingMachineReports } from "./processMachineReportQueue";
import { reportsAwaitingDuplicateConfirmation, reportsUnsentAfterNetworkFailure } from "./processSubmitBatchSlices";

import type {
    AutocompleteOption
} from "../../components/common/AutocompleteInput";
// =====================================================
// KIỂU DỮ LIỆU FORM
// =====================================================


import {
    clampWorkerWorkDate,
    createEmptyMachineLine,
    getCurrentLocalDate,
    getWorkerAllowedWorkDates,
    initialDeduction,
    initialForm,
    processMap,
} from "./processPageConfig";
import { processExtraFields } from "./processExtraFields";
import ProcessExtraFieldsSection from "./components/ProcessExtraFieldsSection";
import ProcessTimeDeductionSection from "./components/ProcessTimeDeductionSection";
import ProcessWorkerHeader from "./components/ProcessWorkerHeader";
import ProcessQualitySection from "./components/ProcessQualitySection";
import ProcessBasicInfoSection from "./components/ProcessBasicInfoSection";
import ProcessSubmitActions from "./components/ProcessSubmitActions";
import {
    filterProductsForProcessScope,
    getInitialOperationMode,
    getProcessCapabilities,
    usesMultiMachineLines as resolveUsesMultiMachineLines,
    usesSingleMachine as resolveUsesSingleMachine,
} from "./processPageDomain";
import {
    calculateActualOutput as calculateActualOutputValue,
    formatIntegerDisplay,
    parseIntegerDisplay,
} from "./processFormUtils";
import {
    aggregateMachineLines,
    getMachineNgTotal,
} from "./processMachineLines";
import { focusProcessValidationTarget } from "./processValidationFocus";
import { useProcessQualityActions } from "./useProcessQualityActions";
import { useProcessDeductionActions } from "./useProcessDeductionActions";
import { validateProcessForm } from "./processFullFormValidation";


import {
    applyProcessFormChange,
    clearZeroNumberField,
} from "./processInputLogic";
import {
    toDuplicatePrompt,
} from "./processDuplicateReportLogic";
import { useDuplicateReportFlow } from "./useDuplicateReportFlow";
import { useProcessDuplicateActions } from "./useProcessDuplicateActions";
import { createDuplicateFormSignature } from "./processDuplicateFormSignature";
import { buildProductionReportPayloads } from "./processReportSubmission";
import { useProcessMasterData } from "./useProcessMasterData";
import { useProcessWorkerProfile } from "./useProcessWorkerProfile";
import { useProcessProductOptions } from "./useProcessProductOptions";
import { useMachineLineStandardLookup } from "./useMachineLineStandardLookup";
import { useProcessSingleStandardLookup } from "./useProcessSingleStandardLookup";
import { useProcessDraftSaveWarning } from "./useProcessDraftSaveWarning";
import { useProcessDraftAutosave } from "./useProcessDraftAutosave";
import { useProcessDraftRestore } from "./useProcessDraftRestore";
import { useProcessMachineLineActions } from "./useProcessMachineLineActions";
import { applyMachineAggregateToForm } from "./processMachineFormAggregation";
import { hasProcessReportInput, resetProcessFormRetainingWorker } from "./processFormResetGuard";

import type {
    DeductionKey,
    DeductionState,
    FormState,
    MachineLineState,
    NgKey,
    OperationMode,
    OperationType,
} from "./processPageConfig";
function ProcessPage() {

    const { showToast } = useToast();
    const submitLockRef = useRef(false);
    const clientRequestIdRef = useRef<string | null>(null);
    const pendingSplitPayloadsRef = useRef<any[]>([]);
    // A confirmed primary report must not be submitted again when a later split fails.
    const duplicatePrimaryCompletedRef = useRef(false);
    // Reuse the same idempotency key if the server accepted a forced duplicate but its response was lost.
    const duplicateForceRequestIdRef = useRef<string | null>(null);
    const masterDataRequestSeqRef = useRef(0);
    const isRestoringDraftRef = useRef(false);
    const draftSaveTimerRef = useRef<number | null>(null);
    const resetVersionRef = useRef(0);
    useProcessDraftSaveWarning(showToast);


    const navigate =
        useNavigate();


    const {
        process = "cat-long"
    } = useParams();


    const processInfo =
        useMemo(
            () =>

                processMap[process]
                ??
                processMap["cat-long"],

            [process]
        );



    const [form, setForm] = useState<FormState>(initialForm);
    const { worker, loadingWorker } = useProcessWorkerProfile(process, setForm);

    const processCapabilities = useMemo(() => getProcessCapabilities(process), [process]);
    const {
        processCode,
        isCutLongProcess,
        isInspectionProcess,
        isManualOnlyProcess,
    } = processCapabilities;
    const {
        machineOptions,
        productOptions,
        activeNgOptions,
        activeDeductionOptions,
        loadingMasterData,
    } = useProcessMasterData(processInfo.id, processCode);


    useEffect(() => {
        masterDataRequestSeqRef.current += 1;
    }, [processInfo.id, processCode, showToast]);


const machineAutocompleteOptions =
    useMemo<AutocompleteOption[]>(
        () =>

            machineOptions.map(
                (
                    machine: (typeof machineOptions)[number]
                ) => ({

                    value:
                        machine.machine_code,

                    label:
                        machine.machine_code,

                    workType:
                        machine.gc_work_type

                })
            ),

        [machineOptions]
    );
    const [operationType, setOperationType] = useState<OperationType>("CUT");
    const [isCvkMode, setIsCvkMode] = useState(false);
    const [cutExecutionMode, setCutExecutionMode] = useState<"AUTO" | "NON_AUTO">("AUTO");
    const [operationMode, setOperationMode] = useState<OperationMode>(
        () => getInitialOperationMode(processCapabilities)
    );

    const scopedProductOptions = useMemo<ProductStandardOption[]>(
        () => filterProductsForProcessScope({
            products: productOptions,
            processCode,
            processId: processInfo.id,
            operationType,
        }),
        [productOptions, processCode, processInfo.id, operationType]
    );

    const [machineCount, setMachineCount] = useState(1);
    const [machineLines, setMachineLines] = useState<MachineLineState[]>([createEmptyMachineLine()]);
    const [extraData, setExtraData] = useState<Record<string, string>>({});
    const currentExtraFields = processExtraFields[process] || [];
    const usesMultiMachineLines = resolveUsesMultiMachineLines(processCapabilities, operationMode);
    const usesSingleMachine = resolveUsesSingleMachine(processCapabilities, operationMode);
    const usesAnyMachine = usesMultiMachineLines || usesSingleMachine;
    const usesMachineLineAccounting = usesMultiMachineLines;

    const {
        productAutocompleteOptions,
        getMachineProductOptions,
        getMachineProductAutocompleteOptions,
    } = useProcessProductOptions({
        processCode,
        products: scopedProductOptions,
        machineOptions,
        selectedMachine: form.machineNo,
        usesAnyMachine,
        usesSingleMachine,
    });
    useEffect(() => {
        if (isRestoringDraftRef.current) return;
        if (!isCutLongProcess) return;
        setForm((current) => current.productName ? { ...current, productName: "", standardOutput: "" } : current);
        setMachineLines((current) => current.map((line) => line.productCode
            ? { ...line, productCode: "", standardOutputPerHour: 0, standardTimeSeconds: null, standardSource: null, standardError: "" }
            : line));
    }, [operationType, isCutLongProcess]);

    useEffect(() => {
        if (isRestoringDraftRef.current) return;
        if (!isCutLongProcess && !isInspectionProcess) return;
        setForm((current) => ({ ...current, productName: "", standardOutput: "", machineNo: "" }));
        setMachineLines([createEmptyMachineLine()]);
        setMachineCount(1);
    }, [operationMode, isCutLongProcess, isInspectionProcess]);

    useEffect(() => {
        if (isRestoringDraftRef.current) return;
        setExtraData({});
        setMachineLines([createEmptyMachineLine()]);
        setMachineCount(1);
        setOperationMode(
            ["MAI", "DO", "EP", "CAN"].includes(processCode) ? "MACHINE" : "MANUAL"
        );
    }, [process, processCode]);

    useEffect(() => {
        if (!usesSingleMachine) {
            setForm((current) => current.machineNo ? { ...current, machineNo: "" } : current);
        }
    }, [usesSingleMachine]);

    // The machine-lines coordinator owns count limits and machine/NG mutations.
    const {
        maxMachineCount,
        resizeMachineLines,
        updateMachineLine,
        toggleMachineDefect,
        updateMachineDefectValue,
    } = useProcessMachineLineActions({
        processCode,
        machineOptions,
        machineCount,
        machineLines,
        setMachineCount,
        setMachineLines,
    });

    const { refreshMachineLineStandard } = useMachineLineStandardLookup({
        processCode,
        processId: processInfo.id,
        workDate: form.workDate,
        updateMachineLine,
    });

    useEffect(() => {
        if (!usesMultiMachineLines) return;

        const aggregate = aggregateMachineLines(machineLines, activeNgOptions);

        setSelectedNg(aggregate.selectedNg);
        setForm((current) => applyMachineAggregateToForm(current, aggregate, machineLines.length, activeNgOptions));
    }, [usesMultiMachineLines, machineLines, activeNgOptions]);

    useProcessSingleStandardLookup(processInfo.id, form, setForm);

    // KQD is an ordinary NG defect: actual output is always TT OK + every NG.
    const calculateActualOutput = (values: FormState): number =>
        calculateActualOutputValue(values, activeNgOptions);

// CHI TIẾT TRỪ GIỜ
    // =================================================

    const [
        deductions,
        setDeductions
    ] = useState<DeductionState>(
        initialDeduction
    );


    // =================================================
    // DANH SÁCH LOẠI TRỪ GIỜ ĐÃ CHỌN
    // =================================================

    const [
        selectedDeduction,
        setSelectedDeduction
    ] = useState<DeductionKey[]>([]);


    // =================================================
    // DANH SÁCH LỖI NG ĐÃ CHỌN
    // =================================================

    const [
        selectedNg,
        setSelectedNg
    ] = useState<NgKey[]>([]);


    // =================================================
    // MỞ / ĐÓNG DANH SÁCH TRỪ GIỜ
    // =================================================

    const [
        showDeduction,
        setShowDeduction
    ] = useState(false);


    // =================================================
    // MỞ / ĐÓNG DANH SÁCH LỖI NG
    // =================================================

    const [
        showNg,
        setShowNg
    ] = useState(false);


    // =================================================
    // LÝ DO DỪNG MÁY
    // =================================================

    // =================================================
    // TRẠNG THÁI GỬI FORM
    // =================================================

    const [
        submitting,
        setSubmitting
    ] = useState(false);
    const [submitValidationError, setSubmitValidationError] = useState("");

    const {
        duplicatePrompt,
        setDuplicatePrompt,
    } = useDuplicateReportFlow();

    // The duplicate prompt is bound to the entire form snapshot that produced its payload.
    // Include machine lines, deductions and operation modes too; checking only parent totals
    // could allow a stale duplicate payload after a machine-line edit.
    const getDuplicateFormSignature = useCallback(() => createDuplicateFormSignature({
        processId: processInfo.id,
        process,
        form,
        extraData,
        operationType,
        isCvkMode,
        cutExecutionMode,
        operationMode,
        machineLines,
        machineCount,
        deductions,
        selectedDeduction,
        selectedNg,
    }), [
        processInfo.id,
        process,
        form,
        extraData,
        operationType,
        isCvkMode,
        cutExecutionMode,
        operationMode,
        machineLines,
        machineCount,
        deductions,
        selectedDeduction,
        selectedNg,
    ]);

    const { handleCreateDuplicateAnyway, handleUpdateExistingReport } = useProcessDuplicateActions({
        process, navigate, showToast, duplicatePrompt, setDuplicatePrompt,
        setSubmitting, getDuplicateFormSignature, submitLockRef,
        clientRequestIdRef, pendingSplitPayloadsRef, duplicatePrimaryCompletedRef,
        duplicateForceRequestIdRef, isRestoringDraftRef, draftSaveTimerRef, resetVersionRef,
    });

    useProcessDraftRestore({
        process,
        isRestoringDraftRef,
        setForm,
        setDeductions,
        setSelectedDeduction,
        setSelectedNg,
        setMachineLines,
        setMachineCount,
        setOperationType,
        setIsCvkMode,
        setCutExecutionMode,
        setOperationMode,
        setExtraData,
    });

    useProcessDraftAutosave({
        process,
        processCode,
        form,
        deductions,
        selectedDeduction,
        selectedNg,
        machineLines,
        machineCount,
        operationType,
        operationMode,
        isCvkMode,
        cutExecutionMode,
        extraData,
        loadingWorker,
        loadingMasterData,
        submitting,
        isRestoringDraftRef,
        draftSaveTimerRef,
        resetVersionRef,
    });

    const isOnline = useProcessOnlineStatus();

    // =====================================================
    // INPUT THÔNG THƯỜNG
    // =====================================================

    const handleChange = (
        event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) => {
        const { name, value } = event.target;
        setForm((prev) => applyProcessFormChange(prev, name, value, calculateActualOutput));
    };

    // =====================================================
    // CHỈ CHO PHÉP NHẬP SỐ THẬP PHÂN
    // =====================================================

// =====================================================
// KIỂM TRA SỐ THẬP PHÂN
// Cho phép:
// ""
// 1
// 1.5
// 0.25
// =====================================================






    // =====================================================
    // INPUT SỐ THỜI GIAN
    // =====================================================




    // =====================================================
    // INPUT SẢN LƯỢNG / ĐỊNH MỨC
    // =====================================================

   
    // =====================================================
    // TÍNH TỔNG THỜI GIAN TRỪ
    // =====================================================

    const {
        normalizeDeductionValue,
        updateDeductionValue,
        handleToggleDeduction,
    } = useProcessDeductionActions({
        form, setForm, setDeductions, setSelectedDeduction, showToast,
    });

    // =====================================================
    // CẬP NHẬT GIÁ TRỊ LỖI NG
    // =====================================================

    const { handleNgValue, handleToggleNg, handleTtOkChange } = useProcessQualityActions({
        setForm,
        setSelectedNg,
        activeNgOptions,
        calculateActualOutput,
    });

    // =====================================================
    // BLUR Ô SỐ:
    // NẾU GIÁ TRỊ LÀ 0 THÌ CHUYỂN VỀ RỖNG
    // =====================================================

    const handleNumberBlur = (

        event:
            React.FocusEvent<
                HTMLInputElement
            >

    ) => {

        const {
            name,
            value
        } = event.target;


        if (
            value !==
            "0"
        ) {

            return;

        }


        setForm((prev) => clearZeroNumberField(prev, name, value));

    };


    // =====================================================
    // KIỂM TRA FORM
    // =====================================================

    const validateForm = (): string => validateProcessForm({
        loadingMasterData, loadingWorker, hasWorker: Boolean(worker), form, deductions,
        activeNgOptions, selectedNg, selectedDeduction, usesMachineLineAccounting, isCvkMode,
        usesMultiMachineLines, usesSingleMachine, machineLines, processCode, maxMachineCount,
        machineOptions, scopedProductOptions, getMachineProductOptions, isManualOnlyProcess,
        currentExtraFields, extraData, calculateActualOutput,
    });

    // =====================================================
    // GỬI BÁO CÁO
    // =====================================================

    const focusValidationTarget = (message: string) =>
        focusProcessValidationTarget(message, usesMultiMachineLines, setShowNg, setShowDeduction);

    const handleSubmit =
        async () => {

            // UX: kiểm tra dữ liệu tại chỗ trước, tránh bắt công nhân chờ một request
            // kiểm tra mạng rồi mới biết form đang thiếu trường bắt buộc.
            const validationMessage = validateForm();

            if (validationMessage) {
                setSubmitValidationError(validationMessage);
                showToast(validationMessage, "warning");
                focusValidationTarget(validationMessage);
                return;
            }


            if (submitLockRef.current) return;
            setSubmitValidationError("");
            submitLockRef.current = true;
            clientRequestIdRef.current ||= createClientRequestId();

            try {
                setSubmitting(true);

                const payloads = buildProductionReportPayloads({
                    clientRequestId: clientRequestIdRef.current,
                    processId: processInfo.id,
                    form,
                    extraData,
                    operationType,
                    isCutLongProcess,
                    isCvkMode,
                    processCode,
                    usesAnyMachine,
                    usesMultiMachineLines,
                    usesSingleMachine,
                    machineLines,
                    machineOptions,
                    productOptions: scopedProductOptions,
                    activeNgOptions,
                    deductions,
                    activeDeductionOptions,
                });

                if (!navigator.onLine) {
                    queueRemainingMachineReports(payloads);
                    showToast("Đang mất mạng. Các báo cáo đã được lưu trên thiết bị và sẽ tự gửi khi có Internet.", "warning");
                    clearSubmittedProcessDraft({ process, isRestoringDraftRef, resetVersionRef, draftSaveTimerRef, clientRequestIdRef });
                    window.setTimeout(() => navigate("/worker", { replace: true }), 900);
                    return;
                }

                for (let index = 0; index < payloads.length; index += 1) {
                    const payload = payloads[index];
                    let response;
                    try {
                        response = await createTempReport(payload);
                    } catch (error: any) {
                        if (axios.isAxiosError(error) && error.response?.status === 429) {
                            showToast("Bạn thao tác quá nhanh. Dữ liệu trên form vẫn được giữ, vui lòng thử lại sau ít phút.", "warning");
                            return;
                        }
                        if (axios.isAxiosError(error) && error.response?.status === 409 && ["DUPLICATE_PRODUCTION_REPORT", "DUPLICATE_CONFIRMATION_REQUIRED"].includes(String(error.response?.data?.code || ""))) {
                            const duplicateResponse = error.response;
                            const challengeToken = String(duplicateResponse.data?.duplicate_confirmation_token || "").trim();
                            if (challengeToken) {
                                const prompt = toDuplicatePrompt(duplicateResponse.data, payload);
                                if (prompt) {
                                    duplicatePrimaryCompletedRef.current = false;
                                    duplicateForceRequestIdRef.current = null;
                                    pendingSplitPayloadsRef.current = reportsAwaitingDuplicateConfirmation(payloads, index);
                                    const reportType = duplicateResponse.data?.report_type === "approved" ? "approved" : "temp";
                                    setDuplicatePrompt({ ...prompt, reportType, formSignature: getDuplicateFormSignature() });
                                    return;
                                }
                            }
                        }
                        if (isTransientNetworkFailure(error)) {
                            queueRemainingMachineReports(reportsUnsentAfterNetworkFailure(payloads, index));
                            showToast("Kết nối Internet bị gián đoạn. Các báo cáo còn lại đã được lưu trên thiết bị và sẽ tự gửi khi có mạng.", "warning");
                            clearSubmittedProcessDraft({ process, isRestoringDraftRef, resetVersionRef, draftSaveTimerRef, clientRequestIdRef });
                            window.setTimeout(() => navigate("/worker", { replace: true }), 900);
                            return;
                        }
                        throw error;
                    }

                    const submitOutcome = classifyProcessSubmitResponse(response);
                    if (submitOutcome === "similar_report" && response?.data?.id) {
                        const prompt = toDuplicatePrompt(response, payload);
                        if (prompt) {
                            duplicatePrimaryCompletedRef.current = false;
                            duplicateForceRequestIdRef.current = null;
                            pendingSplitPayloadsRef.current = reportsAwaitingDuplicateConfirmation(payloads, index);
                            setDuplicatePrompt({ ...prompt, formSignature: getDuplicateFormSignature() });
                            return;
                        }
                    }
                }

                pendingSplitPayloadsRef.current = [];
                showToast("Lưu báo cáo thành công. Các báo cáo đã được gửi chờ duyệt.", "success");
                clearSubmittedProcessDraft({ process, isRestoringDraftRef, resetVersionRef, draftSaveTimerRef, clientRequestIdRef });
                window.setTimeout(() => navigate("/worker", { replace: true }), 900);

            }
            catch (error: unknown) {

                console.error(
                    "CREATE TEMP REPORT ERROR:",
                    error
                );


                const { message, errors } = getApiError(error, "Lưu báo cáo thất bại");
                const firstFieldError = Object.values(errors)[0];
                showToast(firstFieldError || message, "error");

            }
            finally {

                submitLockRef.current = false;
                setSubmitting(false);

            }

        };


    // =====================================================
    // LÀM MỚI FORM
    // =====================================================

    const handleReset = () => {
        if (duplicatePrimaryCompletedRef.current && pendingSplitPayloadsRef.current.length) {
            showToast("Một phần báo cáo đã gửi thành công. Hãy gửi nốt phần còn lại trước khi làm mới biểu mẫu.", "warning");
            return;
        }
        if (submitLockRef.current || submitting) return;
        const hasEnteredData = hasProcessReportInput(form, selectedNg, selectedDeduction, machineLines);

        if (hasEnteredData && !window.confirm("Làm mới sẽ xóa dữ liệu bạn đang nhập. Bạn có chắc muốn tiếp tục?")) {
            return;
        }

        // Invalidate any pending draft autosave before clearing the form.
        resetVersionRef.current += 1;
        isRestoringDraftRef.current = false;
        if (draftSaveTimerRef.current !== null) {
            window.clearTimeout(draftSaveTimerRef.current);
            draftSaveTimerRef.current = null;
        }
        void clearProcessDraftAsync(process);

        setForm((prev) => resetProcessFormRetainingWorker(prev, getCurrentLocalDate()));


        setSubmitValidationError("");
        clientRequestIdRef.current = null;
        duplicateForceRequestIdRef.current = null;
        setDeductions(
            initialDeduction
        );


        setSelectedDeduction(
            []
        );


        setSelectedNg(
            []
        );

        setOperationType("CUT");
        setOperationMode("MANUAL");
        setMachineCount(1);
        setMachineLines([createEmptyMachineLine()]);




        setShowDeduction(
            false
        );


        setShowNg(
            false
        );

    };
        return (

        <main className="worker-form-page">

            <div className="worker-form-shell">

                {!isOnline ? (
                    <div className="worker-offline-banner" role="status">
                        Đang ngoại tuyến · Bạn vẫn có thể nhập báo cáo. Dữ liệu sẽ lưu trên thiết bị và tự đồng bộ khi có Internet.
                    </div>
                ) : null}

                <ProcessWorkerHeader
                    processTitle={processInfo.title}
                    workerName={form.workerName}
                    workerCode={form.workerCode}
                    trainingPercent={form.trainingPercent}
                    workDate={clampWorkerWorkDate(form.workDate)}
                    dateOptions={getWorkerAllowedWorkDates()}
                    onBack={() => navigate(-1)}
                    onDateChange={handleChange}
                />

                <ProcessBasicInfoSection
                    processCode={processCode}
                    inlineExtraFields={undefined}
                    form={form}
                    setForm={setForm}
                    onFormChange={handleChange}
                    isCutLongProcess={isCutLongProcess}
                    isInspectionProcess={isInspectionProcess}
                    isCvkMode={isCvkMode}
                    setIsCvkMode={setIsCvkMode}
                    operationType={operationType}
                    setOperationType={setOperationType}
                    operationMode={operationMode}
                    setOperationMode={setOperationMode}
                    cutExecutionMode={cutExecutionMode}
                    setCutExecutionMode={setCutExecutionMode}
                    usesMultiMachineLines={usesMultiMachineLines}
                    usesSingleMachine={usesSingleMachine}
                    productAutocompleteOptions={productAutocompleteOptions}
                    getMachineProductAutocompleteOptions={getMachineProductAutocompleteOptions}
                    productOptions={scopedProductOptions}
                    machineAutocompleteOptions={machineAutocompleteOptions}
                    machineOptions={machineOptions}
                    loadingMasterData={loadingMasterData}
                    machineCount={machineCount}
                    maxMachineCount={maxMachineCount}
                    machineLines={machineLines}
                    resizeMachineLines={resizeMachineLines}
                    updateMachineLine={updateMachineLine}
                    refreshMachineLineStandard={refreshMachineLineStandard}
                    getMachineNgTotal={getMachineNgTotal}
                    activeNgOptions={activeNgOptions}
                    activeDeductionOptions={activeDeductionOptions}
                    toggleMachineDefect={toggleMachineDefect}
                    updateMachineDefectValue={updateMachineDefectValue}
                />

                {processCode !== "CAN" && processCode !== "DO" && <ProcessExtraFieldsSection
                    fields={currentExtraFields}
                    extraData={extraData}
                    setExtraData={setExtraData}
                />}

                {!usesMachineLineAccounting && (
                    <ProcessTimeDeductionSection
                        processCode={processCode}
                        form={form}
                        setForm={setForm}
                        deductions={deductions}
                        activeDeductionOptions={activeDeductionOptions}
                        selectedDeduction={selectedDeduction}
                        showDeduction={showDeduction}
                        setShowDeduction={setShowDeduction}
                        onToggleDeduction={handleToggleDeduction}
                        onUpdateDeduction={updateDeductionValue}
                        onNormalizeDeduction={normalizeDeductionValue}
                        onOtherDeductionName={(value) => setForm((current) => ({ ...current, otherDeductionName: value }))}
                        onWarning={(message) => showToast(message, "warning")}
                    />
                )}

                                {/* =================================================
                    SẢN XUẤT
                ================================================= */}

                {/* <section className="worker-form-card">

    <h2 className="worker-card-title">

        <span>
            ⬡
        </span>

        Sản xuất

    </h2>




</section> */}


                {!isCvkMode && (
                <ProcessQualitySection
                    form={form}
                    activeNgOptions={activeNgOptions}
                    selectedNg={selectedNg}
                    showNg={showNg}
                    setShowNg={setShowNg}
                    usesMultiMachineLines={usesMultiMachineLines}
                    operationMode={operationMode}
                    formatIntegerDisplay={formatIntegerDisplay}
                    onTtOkChange={handleTtOkChange}
                    onNumberBlur={handleNumberBlur}
                    onToggleNg={handleToggleNg}
                    onNgValue={handleNgValue}
                    onOtherNgName={(value) => setForm((current) => ({ ...current, otherNgName: value }))}
                />
                )}

                {processCode === "EP" && (
                    <section className="worker-form-card">
                        <label htmlFor="ep-production-note" className="worker-card-title">
                            Ghi chú (không bắt buộc)
                        </label>
                        <textarea
                            id="ep-production-note"
                            value={form.note}
                            onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                            placeholder="Nhập ghi chú về quá trình sản xuất hoặc sự cố máy (nếu có)"
                            rows={3}
                            maxLength={2000}
                            style={{ width: "100%", boxSizing: "border-box", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", font: "inherit", resize: "vertical" }}
                        />
                    </section>
                )}

                {submitValidationError && <div className="worker-submit-validation-error" role="alert">
                    <strong>Chưa thể nộp báo cáo</strong>
                    <span>{submitValidationError}</span>
                    <button type="button" onClick={() => setSubmitValidationError("")} aria-label="Đóng thông báo kiểm tra">×</button>
                </div>}
                <ProcessSubmitActions
                duplicatePrompt={duplicatePrompt}
                submitting={submitting}
                loadingWorker={loadingWorker}
                loadingMasterData={loadingMasterData}
                onCancelDuplicate={() => {
                    if (duplicatePrimaryCompletedRef.current && pendingSplitPayloadsRef.current.length) {
                        showToast("Một phần báo cáo đã gửi thành công. Vui lòng thử lại để gửi nốt các báo cáo còn lại trước khi thoát.", "warning");
                        return;
                    }
                    setDuplicatePrompt(null);
                    pendingSplitPayloadsRef.current = [];
                    duplicatePrimaryCompletedRef.current = false;
                    duplicateForceRequestIdRef.current = null;
                    submitLockRef.current = false;
                }}
                onUpdateExisting={() => void handleUpdateExistingReport()}
                onCreateDuplicate={() => void handleCreateDuplicateAnyway()}
                canUpdateExisting={duplicatePrompt?.reportType !== "approved"}
                    onReset={handleReset}
                    onSubmit={() => void handleSubmit()}
                />

            </div>

        </main>

    );

}


export default ProcessPage;