import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";

import {
    useNavigate,
    useParams
} from "react-router-dom";


import type { ProductionReport } from "../../types/production";

import type { ProductStandardOption } from "../../services/masterDataService";

import { useToast } from "../../components/feedback/toastContext";
import {
    clearProcessDraftAsync,
} from "./processDraftStorage";
import { useProcessOnlineStatus } from "./useProcessOnlineStatus";

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


import { useDuplicateReportFlow } from "./useDuplicateReportFlow";
import { useProcessDuplicateActions } from "./useProcessDuplicateActions";
import { useProcessSubmission } from "./useProcessSubmission";
import { useProcessReset } from "./useProcessReset";
import { useProcessInputActions } from "./useProcessInputActions";
import { useProcessModeResets } from "./useProcessModeResets";
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
    const pendingSplitPayloadsRef = useRef<ProductionReport[]>([]);
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
    useProcessModeResets({
        process, processCode, isCutLongProcess, isInspectionProcess,
        operationType, operationMode, usesSingleMachine, isRestoringDraftRef,
        setForm, setMachineLines, setMachineCount, setExtraData, setOperationMode,
    });

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

    const { handleCreateDuplicateAnyway, handleUpdateExistingReport, handleCancelDuplicate } = useProcessDuplicateActions({
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

    const { handleChange, handleNumberBlur } = useProcessInputActions(setForm, calculateActualOutput);

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

    const { handleSubmit } = useProcessSubmission({
        process, navigate, showToast, validateForm, focusValidationTarget,
        buildPayloads: (clientRequestId) => buildProductionReportPayloads({
            clientRequestId,
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
        }),
        setSubmitting, setSubmitValidationError, setDuplicatePrompt,
        getDuplicateFormSignature, submitLockRef, clientRequestIdRef,
        pendingSplitPayloadsRef, duplicatePrimaryCompletedRef, duplicateForceRequestIdRef,
        isRestoringDraftRef, draftSaveTimerRef, resetVersionRef,
    });

    // =====================================================
    // LÀM MỚI FORM
    // =====================================================

    const { handleReset } = useProcessReset({
        process, showToast, submitting, form, selectedNg, selectedDeduction, machineLines,
        submitLockRef, clientRequestIdRef, pendingSplitPayloadsRef,
        duplicatePrimaryCompletedRef, duplicateForceRequestIdRef, isRestoringDraftRef,
        draftSaveTimerRef, resetVersionRef, setForm, setSubmitValidationError,
        setDeductions, setSelectedDeduction, setSelectedNg, setOperationType,
        setOperationMode, setMachineCount, setMachineLines, setShowDeduction, setShowNg,
    });

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
                onCancelDuplicate={handleCancelDuplicate}
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