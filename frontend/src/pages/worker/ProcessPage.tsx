import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState
} from "react";

import axios from "axios";

import { clearAuthSession, getStoredUser } from "../../utils/authStorage";

import {
    useNavigate,
    useParams
} from "react-router-dom";


import {
    createTempReport,
    updateTempReport,
} from "../../services/productionService";

import {
    getCurrentWorker
} from "../../services/workerService";


import type {
    WorkerProfile
} from "../../types/worker";
import {
    resolveProductStandard
} from "../../services/masterDataService";
import type { ProductStandardOption } from "../../services/masterDataService";

import { useToast } from "../../components/feedback/toastContext";
import { getApiError } from "../../utils/apiError";
import {
    clearProcessDraftAsync,
    loadProcessDraftAsync,
    PROCESS_DRAFT_SAVE_FAILED_EVENT,
} from "./processDraftStorage";
import { createClientRequestId } from "../../utils/workerSubmitGuard";
import { classifyProcessSubmitResponse } from "../../utils/processSubmitOutcome";
import { enqueueOfflineReports, isTransientNetworkFailure } from "../../services/offlineReportQueue";
import { workerCanAccessProcess } from "../../utils/processAccess";
import { getProcessFormSchema } from "./processFormSchemas";

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
    getWorkerMaxWorkDate,
    getWorkerMinWorkDate,
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
    MAX_TOTAL_WORK_MINUTES,
    calculateActualOutput as calculateActualOutputValue,
    formatIntegerDisplay,
    parseFlexibleTime,
    parseIntegerDisplay,
} from "./processFormUtils";
import {
    aggregateMachineLines,
    getMachineNgTotal,
    getMaxMachineCount,
} from "./processMachineLines";
import { validateMachineLines } from "./processPageValidation";
import { focusProcessValidationTarget } from "./processValidationFocus";
import {
    calculateDeductionTimeSummary,
    getProspectiveTotalWorkMinutes,
    normalizeDeductionInput,
    normalizeDeductionStoredValue,
} from "./processDeductionLogic";
import {
    applyNgToggleToForm,
    applyNgValueToForm,
    applyTtOkToForm,
    calculateNgTotal,
    isValidIntegerInput,
} from "./processQualityLogic";

import {
    validateWorkerWorkDate,
} from "./processWorkDateLogic";

import {
    applyProcessFormChange,
    clearZeroNumberField,
} from "./processInputLogic";
import {
    toDuplicatePrompt,
} from "./processDuplicateReportLogic";
import { useDuplicateReportFlow } from "./useDuplicateReportFlow";
import { buildProductionReportPayloads } from "./processReportSubmission";
import { useProcessMasterData } from "./useProcessMasterData";
import { useRelatedGrindingMachines } from "./useRelatedGrindingMachines";
import { useProcessProductOptions } from "./useProcessProductOptions";
import { useMachineLineStandardLookup } from "./useMachineLineStandardLookup";
import { useProcessDraftAutosave } from "./useProcessDraftAutosave";
import {
    patchMachineLineItem,
    resizeMachineLineItems,
    toggleMachineLineDefect,
    updateMachineLineDefectValue,
} from "./processMachineLineState";
import { applyMachineAggregateToForm } from "./processMachineFormAggregation";
import { filterProductsForSelection } from "./productSuggestionRules";

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
    const workerInfoRequestSeqRef = useRef(0);
    const masterDataRequestSeqRef = useRef(0);
    const isRestoringDraftRef = useRef(false);
    const draftSaveTimerRef = useRef<number | null>(null);
    const resetVersionRef = useRef(0);
    const draftSaveWarningShownRef = useRef(false);
    useEffect(() => {
        const onDraftSaveFailed = () => {
            if (draftSaveWarningShownRef.current) return;
            draftSaveWarningShownRef.current = true;
            showToast("Không thể lưu bản nháp trên thiết bị. Hãy giữ trang này mở và kiểm tra bộ nhớ trước khi rời trang.", "warning");
        };
        window.addEventListener(PROCESS_DRAFT_SAVE_FAILED_EVENT, onDraftSaveFailed);
        return () => window.removeEventListener(PROCESS_DRAFT_SAVE_FAILED_EVENT, onDraftSaveFailed);
    }, [showToast]);


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



    // =================================================
    // HỒ SƠ CÔNG NHÂN
    // =================================================

    const [
        worker,
        setWorker
    ] = useState<WorkerProfile | null>(
        null
    );


    // =================================================
    // DỮ LIỆU FORM
    // =================================================

    const [
        form,
        setForm
    ] = useState<FormState>(
        initialForm
    );

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

    const { extraFieldOptions, loadingRelatedMaiMachines } = useRelatedGrindingMachines(processCode);

    useEffect(() => {
        masterDataRequestSeqRef.current += 1;
    }, [processInfo.id, processCode, showToast]);


const machineAutocompleteOptions =
    useMemo<AutocompleteOption[]>(
        () =>

            machineOptions.map(
                (
                    machine: MachineOption
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
        getMachineProductOptionsForLine,
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

    // Machine-count limits are enforced by the shared domain helper.
    const maxMachineCount = getMaxMachineCount(processCode, machineLines, machineOptions);

    useEffect(() => {
        if (machineCount > maxMachineCount) {
            setMachineCount(maxMachineCount);
            setMachineLines((current) => current.slice(0, maxMachineCount));
        }
    }, [machineCount, maxMachineCount]);

    const resizeMachineLines = (count: number) => {
        const normalizedCount = Math.min(maxMachineCount, Math.max(1, count));
        setMachineCount(normalizedCount);
        setMachineLines((current) => resizeMachineLineItems(current, count, maxMachineCount));
    };

    const updateMachineLine = (index: number, patch: Partial<MachineLineState>) => {
        setMachineLines((current) => patchMachineLineItem(current, index, patch));
    };

    const { refreshMachineLineStandard } = useMachineLineStandardLookup({
        processCode,
        processId: processInfo.id,
        workDate: form.workDate,
        updateMachineLine,
    });

    const toggleMachineDefect = (lineIndex: number, key: string) => {
        setMachineLines((current) => toggleMachineLineDefect(current, lineIndex, key));
    };

    const updateMachineDefectValue = (lineIndex: number, key: string, value: string) => {
        setMachineLines((current) => updateMachineLineDefectValue(current, lineIndex, key, value));
    };

    useEffect(() => {
        if (!usesMultiMachineLines) return;

        const aggregate = aggregateMachineLines(machineLines, activeNgOptions);

        setSelectedNg(aggregate.selectedNg);
        setForm((current) => applyMachineAggregateToForm(current, aggregate, machineLines.length, activeNgOptions));
    }, [usesMultiMachineLines, machineLines, activeNgOptions]);

    useEffect(() => {
        let active = true;
        if (!form.productName.trim() || !form.workDate) {
            return () => { active = false; };
        }
        void resolveProductStandard(
            processInfo.id,
            form.machineNo.trim(),
            form.productName.trim(),
            form.workDate
        ).then((resolved) => {
            if (!active) return;
            const resolvedOutput = Number(resolved.resolved_output_per_hour || 0);
            if (resolvedOutput > 0) {
                setForm((current) => ({ ...current, standardOutput: String(resolvedOutput) }));
            }
        }).catch(() => {
            // Standard lookup failure keeps the manually entered standard; KQD is always ordinary NG.
        });
        return () => { active = false; };
    }, [processInfo.id, form.machineNo, form.productName, form.workDate]);

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
    // TRẠNG THÁI TẢI WORKER
    // =================================================

    const [
        loadingWorker,
        setLoadingWorker
    ] = useState(true);


    // =================================================
    // TRẠNG THÁI GỬI FORM
    // =================================================

    const [
        submitting,
        setSubmitting
    ] = useState(false);

    const {
        duplicatePrompt,
        setDuplicatePrompt,
    } = useDuplicateReportFlow();

    // The duplicate prompt is bound to the entire form snapshot that produced its payload.
    // Include machine lines, deductions and operation modes too; checking only parent totals
    // could allow a stale duplicate payload after a machine-line edit.
    const getDuplicateFormSignature = useCallback(() => JSON.stringify({
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

    const finishDuplicateAction = useCallback(() => {
        // A confirmed duplicate creation/update is a successful submission.
        // Cancel any pending autosave and invalidate its snapshot before
        // clearing, otherwise navigating back can restore an already-sent form.
        resetVersionRef.current += 1;
        if (draftSaveTimerRef.current !== null) {
            window.clearTimeout(draftSaveTimerRef.current);
            draftSaveTimerRef.current = null;
        }
        void clearProcessDraftAsync(process);
        setDuplicatePrompt(null);
        pendingSplitPayloadsRef.current = [];
        duplicatePrimaryCompletedRef.current = false;
        duplicateForceRequestIdRef.current = null;
        clientRequestIdRef.current = null;
        submitLockRef.current = false;
        setSubmitting(false);
        navigate("/worker", { replace: true });
    }, [navigate, process, setDuplicatePrompt]);

    const handleCreateDuplicateAnyway = async () => {
        if (submitLockRef.current || !duplicatePrompt) return;
        submitLockRef.current = true;
        const snapshotMatches = duplicatePrompt.formSignature === getDuplicateFormSignature();
        if (!snapshotMatches) {
            submitLockRef.current = false;
            showToast("Dữ liệu trên form đã thay đổi sau khi phát hiện báo cáo trùng. Vui lòng lưu lại để kiểm tra lại.", "warning");
            if (!duplicatePrimaryCompletedRef.current) {
                duplicateForceRequestIdRef.current = null;
                setDuplicatePrompt(null);
            }
            return;
        }
        try {
            setSubmitting(true);
            if (!duplicatePrimaryCompletedRef.current) {
                duplicateForceRequestIdRef.current ||= createClientRequestId();
                await createTempReport({
                    ...duplicatePrompt.payload,
                    client_request_id: duplicateForceRequestIdRef.current,
                    force_create: true,
                    duplicate_confirmation_token: duplicatePrompt.confirmationToken,
                });
                duplicatePrimaryCompletedRef.current = true;
            }
            const pendingCount = pendingSplitPayloadsRef.current.length;
            // Persist every remaining machine report BEFORE navigating away.
            // A browser reload must not discard the rest of this split submit.
            if (pendingCount) enqueueOfflineReports(pendingSplitPayloadsRef.current);
            showToast(pendingCount ? "Đã xác nhận báo cáo trùng. Các báo cáo máy còn lại đã lưu an toàn và đang đồng bộ." : "Đã tạo báo cáo trùng theo xác nhận.", pendingCount ? "warning" : "success");
            finishDuplicateAction();
        } catch (error: unknown) {
            // After the primary report succeeded, preserve the unsent split reports
            // across a page reload when connectivity becomes unreliable. Their
            // original client_request_id values make offline retries idempotent.
            if (duplicatePrimaryCompletedRef.current && isTransientNetworkFailure(error)
                && !(axios.isAxiosError(error) && error.response?.status === 429)) {
                try {
                    enqueueOfflineReports(pendingSplitPayloadsRef.current);
                    showToast("Báo cáo chính đã lưu. Các báo cáo còn lại đã được đưa vào hàng đợi và sẽ tự đồng bộ khi có mạng.", "warning");
                    finishDuplicateAction();
                    return;
                } catch (queueError: unknown) {
                    showToast(queueError instanceof Error ? queueError.message : "Không thể lưu báo cáo còn lại trên thiết bị.", "error");
                }
            }
            showToast((error as any)?.response?.data?.message || (duplicatePrimaryCompletedRef.current ? "Báo cáo chính đã được xử lý. Một báo cáo còn lại chưa gửi được; hãy thử lại để tiếp tục phần chưa gửi." : "Không thể tạo báo cáo."), "error");
            submitLockRef.current = false;
            setSubmitting(false);
        }
    };

    const handleUpdateExistingReport = async () => {
        if (submitLockRef.current || !duplicatePrompt || duplicatePrompt.reportType === "approved") return;
        submitLockRef.current = true;
        const snapshotMatches = duplicatePrompt.formSignature === getDuplicateFormSignature();
        if (!snapshotMatches) {
            submitLockRef.current = false;
            showToast("Dữ liệu trên form đã thay đổi sau khi phát hiện báo cáo trùng. Vui lòng kiểm tra lại.", "warning");
            if (!duplicatePrimaryCompletedRef.current) setDuplicatePrompt(null);
            return;
        }
        try {
            setSubmitting(true);
            if (!duplicatePrimaryCompletedRef.current) {
                await updateTempReport(duplicatePrompt.reportId, { ...duplicatePrompt.payload, id: duplicatePrompt.reportId });
                duplicatePrimaryCompletedRef.current = true;
            }
            const pendingCount = pendingSplitPayloadsRef.current.length;
            // Save the complete remainder atomically before clearing the form.
            if (pendingCount) enqueueOfflineReports(pendingSplitPayloadsRef.current);
            showToast(pendingCount ? "Đã cập nhật báo cáo chính. Các báo cáo máy còn lại đã lưu an toàn và đang đồng bộ." : "Đã cập nhật báo cáo hiện có.", pendingCount ? "warning" : "success");
            finishDuplicateAction();
        } catch (error: unknown) {
            if (duplicatePrimaryCompletedRef.current && isTransientNetworkFailure(error)
                && !(axios.isAxiosError(error) && error.response?.status === 429)) {
                try {
                    enqueueOfflineReports(pendingSplitPayloadsRef.current);
                    showToast("Báo cáo chính đã cập nhật. Các báo cáo còn lại đã lưu vào hàng đợi offline.", "warning");
                    finishDuplicateAction();
                    return;
                } catch (queueError: unknown) {
                    showToast(queueError instanceof Error ? queueError.message : "Không thể lưu báo cáo còn lại trên thiết bị.", "error");
                }
            }
            showToast((error as any)?.response?.data?.message || (duplicatePrimaryCompletedRef.current ? "Báo cáo chính đã được cập nhật. Một báo cáo còn lại chưa gửi được; hãy thử lại để tiếp tục phần chưa gửi." : "Không thể cập nhật báo cáo."), "error");
            submitLockRef.current = false;
            setSubmitting(false);
        }
    };

    // Separate-run duplicate creation deliberately gets a fresh id and server challenge.
    // Contract: separate-run payload gets a fresh client_request_id and server confirmation token.
    // Contract: reportType: duplicateResponse.data?.report_type === "approved" is the approved-state discriminator.


useLayoutEffect(() => {
        let cancelled = false;
        isRestoringDraftRef.current = true;
        void loadProcessDraftAsync(process).then((draft) => {
        if (cancelled) return;
        if (!draft) { isRestoringDraftRef.current = false; return; }

        // Restore the draft in a layout effect so the initialization effects
        // below cannot reset the restored machine lines during the same mount.
        isRestoringDraftRef.current = true;

        setForm((current) => ({
            ...current,
            ...draft.form,
            workerCode: current.workerCode,
            workerName: current.workerName,
            trainingPercent: current.trainingPercent,
        }));
        setDeductions(draft.deductions);
        setSelectedDeduction(draft.selectedDeduction as DeductionKey[]);
        setSelectedNg(draft.selectedNg as NgKey[]);
        setMachineLines(
            draft.machineLines.length
                ? draft.machineLines
                : [createEmptyMachineLine()]
        );
        setMachineCount(Math.max(1, draft.machineCount));
        setOperationType(draft.operationType);
        setIsCvkMode(Boolean(draft.isCvkMode || ["CVK", "XUATNHAP", "KTCD", "TAIPP"].includes(String(draft.form?.workType || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, ""))));
        setCutExecutionMode(draft.cutExecutionMode === "NON_AUTO" ? "NON_AUTO" : "AUTO");
        setOperationMode(draft.operationMode);
        setExtraData(draft.extraData || {});

        window.setTimeout(() => {
            if (!cancelled) isRestoringDraftRef.current = false;
        }, 0);
        }).catch(() => { if (!cancelled) isRestoringDraftRef.current = false; });
        return () => { cancelled = true; };
    }, [process]);

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

    const [isOnline, setIsOnline] = useState(() => navigator.onLine);

    useEffect(() => {
        const online = () => setIsOnline(true);
        const offline = () => setIsOnline(false);
        window.addEventListener("online", online);
        window.addEventListener("offline", offline);
        return () => {
            window.removeEventListener("online", online);
            window.removeEventListener("offline", offline);
        };
    }, []);

    // =====================================================
    // LẤY THÔNG TIN WORKER THEO USER ID
    // =====================================================

    useEffect(() => {
        const requestSeq = ++workerInfoRequestSeqRef.current;
        const isCurrentRequest = () => workerInfoRequestSeqRef.current === requestSeq;

        const loadWorkerInfo =
            async () => {

                try {

                    setLoadingWorker(
                        true
                    );


                    const savedUser = getStoredUser();

                    if (!savedUser) {
                        clearAuthSession({ bumpEpoch: false });
                        navigate("/login", { replace: true });
                        return;
                    }


                    const workerData =
                        await getCurrentWorker();

                    const schema = getProcessFormSchema(process);
                    if (!workerCanAccessProcess(workerData, schema.processId, schema.processCode)) {
                        showToast("Bạn chưa được phân công công đoạn này.", "error");
                        navigate("/worker/process", { replace: true });
                        return;
                    }

                    if (!isCurrentRequest()) return;

                    setWorker(
                        workerData
                    );


                    setForm(
                        (prev) => ({

                            ...prev,

                            workerCode:
                                workerData.worker_code
                                ||
                                "",

                            workerName:
                                workerData.full_name
                                ||
                                "",

                            trainingPercent:
    workerData.training_percent !== null
    &&
    workerData.training_percent !== undefined

        ? String(
            workerData.training_percent
        )

        : ""

                        })
                    );

                }
                catch (error: unknown) {
                    if (!isCurrentRequest()) return;

                    console.error(
                        "LOAD WORKER ERROR:",
                        error
                    );


                    if (
                        axios.isAxiosError(
                            error
                        )
                        &&
                        error.response?.status
                        ===
                        401
                    ) {

                        clearAuthSession({ bumpEpoch: false });


                        navigate(
                            "/login",
                            {
                                replace: true
                            }
                        );


                        return;

                    }


                    const message =

                        axios.isAxiosError(
                            error
                        )

                            ? error.response
                                ?.data
                                ?.message

                                ||

                                "Không lấy được thông tin nhân viên"

                            : error instanceof Error

                                ? error.message

                                : "Không lấy được thông tin nhân viên";


                    showToast(
                        message
                    );

                }
                finally {
                    if (isCurrentRequest()) {
                        setLoadingWorker(false);
                    }
                }

            };


        void loadWorkerInfo();

    }, [navigate, process, showToast]);
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

    const updateTotalDeduction = (
        data: DeductionState
    ) => {
        // Các ô chi tiết nhập bằng PHÚT. Ví dụ 70 = 1 giờ 10 phút.
        setForm((prev) => {
            const summary = calculateDeductionTimeSummary(
                data,
                prev.actualHours,
                prev.actualMinutes
            );

            return {
                ...prev,
                actualTime: String(summary.actualTime),
                deductionTime: String(summary.deductionHours),
                totalTime: String(summary.totalTime)
            };
        });
    };


    // =====================================================
    // CẬP NHẬT GIÁ TRỊ MỘT LOẠI TRỪ GIỜ
    // =====================================================

const normalizeDeductionValue = (key: DeductionKey) => {
    setDeductions((prev) => {
        const normalizedValue = normalizeDeductionStoredValue(String(prev[key] || ""));
        const next = { ...prev, [key]: normalizedValue };
        updateTotalDeduction(next);
        return next;
    });
};

const updateDeductionValue = (
    key: DeductionKey,
    value: string
) => {

    const normalizedValue = normalizeDeductionInput(value);

    if (normalizedValue !== "" && Number(normalizedValue) > MAX_TOTAL_WORK_MINUTES) {
        showToast("Tổng thời gian tối đa là 12 giờ", "warning");
        return;
    }

    setDeductions((prev) => {
        const next = {
            ...prev,
            [key]: normalizedValue
        };

        const prospectiveTotalMinutes = getProspectiveTotalWorkMinutes(
            next,
            form.actualHours,
            form.actualMinutes
        );

        if (prospectiveTotalMinutes > MAX_TOTAL_WORK_MINUTES) {
            showToast(
                "Không thể tăng thời gian trừ vì tổng thời gian sẽ vượt quá 12 giờ",
                "warning"
            );
            return prev;
        }

        updateTotalDeduction(next);
        return next;
    });

};


    // =====================================================
    // CHỌN / BỎ CHỌN LOẠI TRỪ GIỜ
    // =====================================================

    const handleToggleDeduction = (

        key: DeductionKey,

        checked: boolean

    ) => {

        if (checked) {

            setSelectedDeduction(
                (prev) => {

                    if (
                        prev.includes(
                            key
                        )
                    ) {

                        return prev;

                    }


                    return [
                        ...prev,
                        key
                    ];

                }
            );


            setDeductions((prev) => {

                const next = {

                    ...prev,

                    [key]:
                        prev[key]
                        ||
                        ""

                };


                updateTotalDeduction(
                    next
                );


                return next;

            });


            return;

        }


        setSelectedDeduction(
            (prev) =>
                prev.filter(
                    (item) =>
                        item !== key
                )
        );


        setDeductions((prev) => {

            const next = {

                ...prev,

                [key]:
                    ""

            };


            updateTotalDeduction(
                next
            );


            return next;

        });


        

    };



    // =====================================================
    // CẬP NHẬT GIÁ TRỊ LỖI NG
    // =====================================================

    const handleNgValue = (key: NgKey, value: string) => {
        if (!isValidIntegerInput(value)) return;
        setForm((prev) =>
            applyNgValueToForm(prev, key, value, activeNgOptions, calculateActualOutput)
        );
    };

    // =====================================================
    // CHỌN / BỎ CHỌN LỖI NG
    // =====================================================

    const handleToggleNg = (key: NgKey, checked: boolean) => {
        setSelectedNg((prev) => {
            if (checked) return prev.includes(key) ? prev : [...prev, key];
            return prev.filter((item) => item !== key);
        });

        setForm((prev) =>
            applyNgToggleToForm(prev, key, checked, activeNgOptions, calculateActualOutput)
        );
    };

    // =====================================================
    // CẬP NHẬT TT OK
    // =====================================================


    const handleTtOkChange = (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const value = parseIntegerDisplay(event.target.value);
        if (!isValidIntegerInput(value)) return;
        setForm((prev) => applyTtOkToForm(prev, value, calculateActualOutput));
    };


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

    const validateForm = (): string => {
        if (
            loadingWorker
        ) {

            return "Thông tin nhân viên đang được tải";

        }


        if (
            !worker
            ||
            !form.workerCode
            ||
            !form.workerName
        ) {

            return "Không tìm thấy thông tin nhân viên";

        }


        const workDateError = validateWorkerWorkDate(
            form.workDate,
            getWorkerMinWorkDate(),
            getWorkerMaxWorkDate()
        );
        if (workDateError) return workDateError;


        if (
            !form.shift
        ) {

            return "Vui lòng chọn ca làm việc";

        }


        if (!isCvkMode && !usesMultiMachineLines) {
            if (!form.productName.trim()) {
                return "Vui lòng chọn sản phẩm";
            }

            const eligibleProducts = usesSingleMachine
                ? getMachineProductOptions(form.machineNo)
                : filterProductsForSelection({ products: scopedProductOptions, mode: "MANUAL", machineOptions, useEncodedMachineSuffix: processCode === "GC" });
            const matchedProduct = eligibleProducts.find(
                (item) => item.product_code.trim().toLowerCase() === form.productName.trim().toLowerCase()
            );
            if (!matchedProduct) {
                return "Sản phẩm không có trong danh mục. Vui lòng chọn lại từ danh sách gợi ý";
            }
        }

        if (usesMultiMachineLines) {
            const machineLinesError = validateMachineLines({
                processCode,
                machineLines,
                maxMachines: maxMachineCount,
                allowZeroQuantity: isCvkMode,
                isMachineValid: (machineCode) => machineOptions.some(
                    (item) => item.machine_code.trim().toLowerCase() === machineCode.trim().toLowerCase()
                ),
                isProductValid: (machineCode, productCode) => getMachineProductOptions(machineCode).some(
                    (item) => item.product_code.trim().toLowerCase() === productCode.trim().toLowerCase()
                ),
            });
            if (machineLinesError) return machineLinesError;
        } else if (usesSingleMachine) {
            if (!form.machineNo.trim() && processCode !== "DO") return "Vui lòng chọn số máy";
            const matchedMachine = machineOptions.find(
                (item) => item.machine_code.trim().toLowerCase() === form.machineNo.trim().toLowerCase()
            );
            if (form.machineNo.trim() && !matchedMachine) return "Máy không có trong danh mục. Vui lòng chọn lại từ danh sách gợi ý";
        }

        if (isManualOnlyProcess && (form.machineNo.trim() || machineLines.some((line) => line.machineCode.trim()))) {
            return "Công đoạn làm tay không được chứa dữ liệu máy";
        }


        if (!usesMachineLineAccounting) {
            if (parseFlexibleTime(form.actualTime) <= 0) {
                return "Thời gian làm việc thực tế phải lớn hơn 0";
            }

            if (Number(form.actualMinutes || 0) > 59) {
                return "Số phút làm thực tế phải từ 0 đến 59";
            }

            const actualMinutes = Math.round(parseFlexibleTime(form.actualTime) * 60);
            const deductionMinutes = Math.round(parseFlexibleTime(form.deductionTime) * 60);
            if (actualMinutes + deductionMinutes > MAX_TOTAL_WORK_MINUTES) {
                return "Thời gian thực tế + thời gian trừ không được vượt quá 12 giờ";
            }
            if (parseFlexibleTime(form.totalTime) > 12) {
                return "Tổng thời gian không được vượt quá 12 giờ";
            }
        }



        if (!isCvkMode && (
            Number(
                form.standardOutput
                ||
                0
            ) <= 0
        )) {

            return "Định mức phải lớn hơn 0";

        }


        if (
            Number(
                form.actualOutput
                ||
                0
            )
            <
            0
        ) {

            return "Sản lượng thực tế không hợp lệ";

        }


        const totalDefects = calculateNgTotal(form, activeNgOptions);


        if (
            totalDefects
            !==
            Number(
                form.ttNg
                ||
                0
            )
        ) {

            return "TT NG phải bằng tổng số lượng các lỗi NG";

        }


        // GC machine-line reports calculate actual output independently for each
        // machine/product line. The parent form's aggregate must not be checked
        // against the single-product formula used by manual reports.
        if (!usesMachineLineAccounting && Number(form.actualOutput || 0) !== calculateActualOutput(form)) {
            return "Thực tế phải bằng TT OK cộng TT NG";
        }

        const missingExtraField = currentExtraFields.find(
            (field) => field.required && !String(extraData[field.key] || "").trim()
        );
        if (missingExtraField) {
            return `Vui lòng nhập ${missingExtraField.label}`;
        }

        const relatedGrindingMachine = String(extraData.grinding_machine_no || "").trim();
        if (processCode === "DO" && relatedGrindingMachine) {
            if (loadingRelatedMaiMachines) return "Đang tải danh mục máy Mài, vui lòng chờ";
            if (!relatedMaiMachines.some((machine) => machine.machine_code.trim().toUpperCase() === relatedGrindingMachine.toUpperCase())) {
                return "Máy Mài liên quan không còn trong danh mục hoạt động. Vui lòng chọn lại";
            }
        }

        return "";

    };


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
                showToast(validationMessage, "warning");
                focusValidationTarget(validationMessage);
                return;
            }


            if (submitLockRef.current) return;
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
                    enqueueOfflineReports(payloads);
                    showToast("Đang mất mạng. Các báo cáo đã được lưu trên thiết bị và sẽ tự gửi khi có Internet.", "warning");
                    void clearProcessDraftAsync(process);
                    clientRequestIdRef.current = null;
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
                                    pendingSplitPayloadsRef.current = payloads.slice(index + 1);
                                    const reportType = duplicateResponse.data?.report_type === "approved" ? "approved" : "temp";
                                    setDuplicatePrompt({ ...prompt, reportType, formSignature: getDuplicateFormSignature() });
                                    return;
                                }
                            }
                        }
                        if (isTransientNetworkFailure(error)) {
                            enqueueOfflineReports(payloads.slice(index));
                            showToast("Kết nối Internet bị gián đoạn. Các báo cáo còn lại đã được lưu trên thiết bị và sẽ tự gửi khi có mạng.", "warning");
                            void clearProcessDraftAsync(process);
                            clientRequestIdRef.current = null;
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
                            pendingSplitPayloadsRef.current = payloads.slice(index + 1);
                            setDuplicatePrompt({ ...prompt, formSignature: getDuplicateFormSignature() });
                            return;
                        }
                    }
                }

                pendingSplitPayloadsRef.current = [];
                showToast("Lưu báo cáo thành công. Các báo cáo đã được gửi chờ duyệt.", "success");
                void clearProcessDraftAsync(process);
                clientRequestIdRef.current = null;
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
        const hasEnteredData = Boolean(
            form.productName.trim()
            || form.machineNo.trim()
            || Number(form.actualTime || 0) > 0
            || Number(form.ttOk || 0) > 0
            || Number(form.ttNg || 0) > 0
            || selectedNg.length
            || selectedDeduction.length
            || machineLines.some((line) =>
                line.machineCode.trim()
                || line.productCode.trim()
                || Number(line.okQuantity || 0) > 0
                || Number(line.ngQuantity || 0) > 0
                || Number(line.hours || 0) > 0
                || Number(line.minutes || 0) > 0
            )
        );

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

        setForm((prev) => ({

            ...initialForm,
            // Explicitly clear every time field so a reset can never retain
            // the previous working/deduction/total time values.
            actualHours: "",
            actualMinutes: "",
            actualTime: "",
            deductionTime: "",
            totalTime: "",

            workDate:
                getCurrentLocalDate(),

            workerCode:
                prev.workerCode,

            workerName:
                prev.workerName,

            trainingPercent:
                prev.trainingPercent

        }));


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

                {processCode !== "CAN" && <ProcessExtraFieldsSection
                    fields={currentExtraFields}
                    extraData={extraData}
                    setExtraData={setExtraData}
                    fieldOptions={extraFieldOptions}
                    loadingFieldOptions={loadingRelatedMaiMachines}
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
                />
                )}

                <ProcessSubmitActions
                duplicatePrompt={duplicatePrompt}
                submitting={submitting}
                loadingWorker={loadingWorker}
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