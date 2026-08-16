import {
    useCallback,
    useEffect,
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


import "./ProcessPage.css";


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
import type {
    MachineOption,
    ProductStandardOption
} from "../../services/masterDataService";

import { useToast } from "../../components/feedback/toastContext";
import { getApiError } from "../../utils/apiError";
import {
    clearProcessDraft,
    hasMeaningfulProcessDraft,
    loadProcessDraft,
    saveProcessDraft,
} from "./processDraftStorage";
import { getCachedResolvedProductStandard } from "../../services/productStandardRequestCache";
import { createClientRequestId } from "../../utils/workerSubmitGuard";
import { classifyProcessSubmitResponse } from "../../utils/processSubmitOutcome";
import { enqueueOfflineReport, isTransientNetworkFailure } from "../../services/offlineReportQueue";
import { workerCanAccessProcess } from "../../utils/processAccess";
import { getProcessFormSchema } from "./processFormSchemas";

import type {
    AutocompleteOption
} from "../../components/common/AutocompleteInput";
// =====================================================
// KIỂU DỮ LIỆU FORM
// =====================================================


import {
    KQD_CODES,
    clampWorkerWorkDate,
    createEmptyMachineLine,
    getCurrentLocalDate,
    getWorkerAllowedWorkDates,
    getWorkerMaxWorkDate,
    getWorkerMinWorkDate,
    initialDeduction,
    initialForm,
    processMap,
    shiftLocalDate,
} from "./processPageConfig";
import { processExtraFields } from "./processExtraFields";
import ProcessExtraFieldsSection from "./components/ProcessExtraFieldsSection";
import ProcessTimeDeductionSection from "./components/ProcessTimeDeductionSection";
import ProcessWorkerHeader from "./components/ProcessWorkerHeader";
import ProcessQualitySection from "./components/ProcessQualitySection";
import ProcessBasicInfoSection from "./components/ProcessBasicInfoSection";
import ProcessSubmitActions from "./components/ProcessSubmitActions";
import { filterProductsForSelection, toProductAutocompleteOptions } from "./productSuggestionRules";
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
    toggleMachineDefectLine,
    updateMachineDefectLine,
} from "./processMachineLines";
import { validateMachineLines } from "./processPageValidation";
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
    resolveWorkDateForShiftChange,
    validateWorkerWorkDate,
} from "./processWorkDateLogic";

import {
    clearZeroNumberField,
    updateTotalTimeField,
} from "./processInputLogic";
import {
    toDuplicatePrompt,
} from "./processDuplicateReportLogic";
import { useDuplicateReportFlow } from "./useDuplicateReportFlow";
import { buildProductionReportPayload } from "./processReportSubmission";
import { useProcessMasterData } from "./useProcessMasterData";

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
    const workerInfoRequestSeqRef = useRef(0);
    const masterDataRequestSeqRef = useRef(0);
    const machineStandardRequestSeqRef = useRef<Record<number, number>>({});

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
                        machine.machine_code

                })
            ),

        [machineOptions]
    );
    const [operationType, setOperationType] = useState<OperationType>("CUT");
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

    const productAutocompleteOptions = useMemo<AutocompleteOption[]>(() => {
        const effectiveMode: OperationMode = usesAnyMachine ? "MACHINE" : "MANUAL";
        const filtered = filterProductsForSelection({
            products: scopedProductOptions,
            mode: effectiveMode,
            machineCode: usesSingleMachine ? form.machineNo : undefined,
            machineOptions,
            useEncodedMachineSuffix: processCode === "GC",
        });
        return toProductAutocompleteOptions(filtered);
    }, [scopedProductOptions, usesAnyMachine, usesSingleMachine, form.machineNo, machineOptions, processCode]);

    const getMachineProductOptions = useCallback((machineCode: string): ProductStandardOption[] =>
        filterProductsForSelection({
            products: scopedProductOptions,
            mode: "MACHINE",
            machineCode,
            machineOptions,
            useEncodedMachineSuffix: processCode === "GC",
        }), [scopedProductOptions, machineOptions, processCode]);

    const getMachineProductOptionsForLine = useCallback((line: MachineLineState) =>
        getMachineProductOptions(line.machineCode), [getMachineProductOptions]);

    const getMachineProductAutocompleteOptions = useCallback((machineCode: string): AutocompleteOption[] =>
        toProductAutocompleteOptions(getMachineProductOptionsForLine({ machineCode } as MachineLineState)), [getMachineProductOptionsForLine]);
    useEffect(() => {
        if (!isCutLongProcess) return;
        setForm((current) => current.productName ? { ...current, productName: "", standardOutput: "" } : current);
        setMachineLines((current) => current.map((line) => line.productCode
            ? { ...line, productCode: "", standardOutputPerHour: 0, standardTimeSeconds: null, standardSource: null, standardError: "" }
            : line));
    }, [operationType, isCutLongProcess]);

    useEffect(() => {
        if (!isCutLongProcess && !isInspectionProcess) return;
        setForm((current) => ({ ...current, productName: "", standardOutput: "", machineNo: "" }));
        setMachineLines([createEmptyMachineLine()]);
        setMachineCount(1);
    }, [operationMode, isCutLongProcess, isInspectionProcess]);

    useEffect(() => {
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
        setMachineLines((current) =>
            Array.from({ length: normalizedCount }, (_, index) => current[index] || createEmptyMachineLine())
        );
    };

    const updateMachineLine = (index: number, patch: Partial<MachineLineState>) => {
        setMachineLines((current) => current.map((line, lineIndex) =>
            lineIndex === index ? { ...line, ...patch } : line
        ));
    };

    const refreshMachineLineStandard = async (index: number, machineCode: string, productCode: string) => {
        const normalizedMachine = machineCode.trim();
        const normalizedProduct = productCode.trim();
        const requestSeq = (machineStandardRequestSeqRef.current[index] || 0) + 1;
        machineStandardRequestSeqRef.current[index] = requestSeq;
        const isCurrentRequest = () => machineStandardRequestSeqRef.current[index] === requestSeq;
        if (!normalizedMachine || !normalizedProduct) {
            updateMachineLine(index, {
                standardOutputPerHour: 0,
                standardTimeSeconds: null,
                standardSource: null,
                standardLoading: false,
                standardError: ""
            });
            return;
        }

        updateMachineLine(index, { standardLoading: true, standardError: "" });
        try {
            const resolved = await getCachedResolvedProductStandard(
                processInfo.id,
                normalizedMachine,
                normalizedProduct,
                () => resolveProductStandard(
                    processInfo.id,
                    normalizedMachine,
                    normalizedProduct,
                    form.workDate
                )
            );
            if (!isCurrentRequest()) return;
            const output = Number(resolved.resolved_output_per_hour || 0);
            updateMachineLine(index, {
                standardOutputPerHour: Number.isFinite(output) ? output : 0,
                standardTimeSeconds: resolved.standard_time_seconds,
                standardSource: resolved.standard_source,
                standardLoading: false,
                standardError: output > 0 ? "" : "Định mức bằng 0"
            });
        } catch (error) {
            if (!isCurrentRequest()) return;
            updateMachineLine(index, {
                standardOutputPerHour: 0,
                standardTimeSeconds: null,
                standardSource: null,
                standardLoading: false,
                standardError: getApiError(error, "Không lấy được định mức").message
            });
        }
    };

    const toggleMachineDefect = (lineIndex: number, key: string) => {
        setMachineLines((current) => current.map((line, index) =>
            index === lineIndex ? toggleMachineDefectLine(line, key) : line
        ));
    };

    const updateMachineDefectValue = (lineIndex: number, key: string, value: string) => {
        setMachineLines((current) => current.map((line, index) =>
            index === lineIndex ? updateMachineDefectLine(line, key, value) : line
        ));
    };

    useEffect(() => {
        if (!usesMultiMachineLines) return;

        const aggregate = aggregateMachineLines(machineLines, activeNgOptions);

        setSelectedNg(aggregate.selectedNg);
        setForm((current) => {
            const next: FormState = {
                ...current,
                productName: aggregate.firstProductCode,
                standardOutput: machineLines.length
                    ? String(aggregate.totalStandardOutput)
                    : "0",
                actualOutput: String(aggregate.totalOk + aggregate.totalNg),
                ttOk: String(aggregate.totalOk),
                ttNg: String(aggregate.totalNg)
            };

            activeNgOptions.forEach((item) => {
                next[item.key] = String(aggregate.defects[item.key] || 0);
            });

            return next;
        });
    }, [usesMultiMachineLines, machineLines, activeNgOptions]);const [resolvedReportKqdPolicy, setResolvedReportKqdPolicy] = useState<boolean | null>(null);

useEffect(() => {
    let active = true;
    if (!form.productName.trim() || !form.workDate) {
        setResolvedReportKqdPolicy(null);
        return () => { active = false; };
    }
    void resolveProductStandard(
        processInfo.id,
        form.machineNo.trim(),
        form.productName.trim(),
        form.workDate
    ).then((resolved) => {
        if (!active) return;
        setResolvedReportKqdPolicy(Number(resolved.exclude_kqd_from_tt || 0) === 1);
        const resolvedOutput = Number(resolved.resolved_output_per_hour || 0);
        if (resolvedOutput > 0) setForm((current) => ({ ...current, standardOutput: String(resolvedOutput) }));
    }).catch(() => { if (active) setResolvedReportKqdPolicy(null); });
    return () => { active = false; };
}, [processInfo.id, form.machineNo, form.productName, form.workDate]);

const productExcludesKqd = (): boolean => resolvedReportKqdPolicy === true;

const calculateActualOutput = (values: FormState): number =>
    calculateActualOutputValue(values, activeNgOptions, productExcludesKqd(), KQD_CODES);





    // =================================================
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

    const getDuplicateFormSignature = useCallback(() => JSON.stringify({
        process: processInfo.id, workDate: form.workDate, shift: form.shift, machineNo: form.machineNo,
        productName: form.productName, actualTime: form.actualTime, ttOk: form.ttOk, ttNg: form.ttNg,
    }), [processInfo.id, form.workDate, form.shift, form.machineNo, form.productName, form.actualTime, form.ttOk, form.ttNg]);

    const finishDuplicateAction = useCallback(() => {
        setDuplicatePrompt(null);
        clientRequestIdRef.current = null;
        submitLockRef.current = false;
        setSubmitting(false);
        navigate("/worker", { replace: true });
    }, [navigate, setDuplicatePrompt]);

    const handleCreateDuplicateAnyway = async () => {
        if (submitLockRef.current || !duplicatePrompt) return;
        submitLockRef.current = true;
        const snapshotMatches = duplicatePrompt.formSignature === getDuplicateFormSignature();
        if (!snapshotMatches) {
            submitLockRef.current = false;
            showToast("Dữ liệu trên form đã thay đổi sau khi phát hiện báo cáo trùng. Vui lòng lưu lại để kiểm tra lại.", "warning");
            setDuplicatePrompt(null);
            return;
        }
        try {
            setSubmitting(true);
            await createTempReport({
                ...duplicatePrompt.payload,
                client_request_id: crypto.randomUUID(),
                force_create: true,
                duplicate_confirmation_token: duplicatePrompt.confirmationToken,
            });
            showToast("Đã tạo báo cáo trùng theo xác nhận.", "success");
            finishDuplicateAction();
        } catch (error: unknown) {
            showToast((error as any)?.response?.data?.message || "Không thể tạo báo cáo.", "error");
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
            setDuplicatePrompt(null);
            return;
        }
        try {
            setSubmitting(true);
            await updateTempReport(duplicatePrompt.reportId, { ...duplicatePrompt.payload, id: duplicatePrompt.reportId });
            showToast("Đã cập nhật báo cáo hiện có.", "success");
            finishDuplicateAction();
        } catch (error: unknown) {
            showToast((error as any)?.response?.data?.message || "Không thể cập nhật báo cáo.", "error");
            submitLockRef.current = false;
            setSubmitting(false);
        }
    };

    // Separate-run duplicate creation deliberately gets a fresh id and server challenge.
    // Contract: separate-run payload gets a fresh client_request_id and server confirmation token.
    // Contract: reportType: duplicateResponse.data?.report_type === "approved" is the approved-state discriminator.


useEffect(() => {
        const draft = loadProcessDraft(process);
        if (!draft) return;

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
        setOperationMode(draft.operationMode);
        setExtraData(draft.extraData || {});
    }, [process]);

    useEffect(() => {
        if (loadingWorker || loadingMasterData || submitting) return;

        const snapshot = {
            version: 1 as const,
            savedAt: Date.now(),
            process,
            form,
            deductions,
            selectedDeduction,
            selectedNg,
            machineLines,
            machineCount,
            operationType,
            operationMode,
            extraData,
        };

        const timer = window.setTimeout(() => {
            if (hasMeaningfulProcessDraft(snapshot)) {
                saveProcessDraft(snapshot);
            } else {
                clearProcessDraft(process);
            }
        }, 700);

        return () => window.clearTimeout(timer);
    }, [
        process,
        form,
        deductions,
        selectedDeduction,
        selectedNg,
        machineLines,
        machineCount,
        operationType,
        operationMode,
        extraData,
        loadingWorker,
        loadingMasterData,
        submitting,
    ]);

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
                        await getCurrentWorker(true);

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

        event:
            React.ChangeEvent<
                HTMLInputElement
                |
                HTMLSelectElement
                |
                HTMLTextAreaElement
            >

    ) => {

        const {
            name,
            value
        } = event.target;


        setForm((prev) => {

            const next = {

                ...prev,

                [name]:
                    value

            } as FormState;


            /*
                Ca C làm qua đêm và thuộc ngày sản xuất hôm trước.
                Khi chuyển sang ca C: lùi ngày 1 ngày.
                Khi rời ca C: trả ngày về 1 ngày để tránh bị lệch khi chọn lại ca.
            */

            if (name === "shift") {
                next.workDate = resolveWorkDateForShiftChange({
                    currentWorkDate: prev.workDate,
                    previousShift: prev.shift,
                    nextShift: value,
                    shiftDate: shiftLocalDate,
                    clampDate: clampWorkerWorkDate,
                });
            }


            /*
                Khi thay đổi TT OK hoặc TT NG,
                tự động tính tổng sản phẩm thực tế.
            */

            if (
                name === "ttOk"
                ||
                name === "ttNg"
            ) {

                next.actualOutput = String(calculateActualOutput(next));

            }


            /*
                Khi thay đổi tổng thời gian,
                tự tính thời gian thực tế:

                actualTime =
                totalTime - deductionTime
            */

            if (name === "totalTime") {
                return updateTotalTimeField(next, value);
            }


            return next;

        });

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


        if (!usesMultiMachineLines) {
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
                machineLines,
                isMachineValid: (machineCode) => machineOptions.some(
                    (item) => item.machine_code.trim().toLowerCase() === machineCode.trim().toLowerCase()
                ),
                isProductValid: (machineCode, productCode) => getMachineProductOptions(machineCode).some(
                    (item) => item.product_code.trim().toLowerCase() === productCode.trim().toLowerCase()
                ),
            });
            if (machineLinesError) return machineLinesError;
        } else if (usesSingleMachine) {
            if (!form.machineNo.trim()) return "Vui lòng chọn số máy";
            const matchedMachine = machineOptions.find(
                (item) => item.machine_code.trim().toLowerCase() === form.machineNo.trim().toLowerCase()
            );
            if (!matchedMachine) return "Máy không có trong danh mục. Vui lòng chọn lại từ danh sách gợi ý";
        }

        if (isManualOnlyProcess && (form.machineNo.trim() || machineLines.some((line) => line.machineCode.trim()))) {
            return "Công đoạn làm tay không được chứa dữ liệu máy";
        }


        if (parseFlexibleTime(form.actualTime) <= 0) {
            return "Thời gian làm thực tế phải lớn hơn 0";
        }


        if (Number(form.actualMinutes || 0) > 59) {
            return "Số phút làm thực tế phải từ 0 đến 59";
        }

        if (parseFlexibleTime(form.totalTime) > 12) {
            return "Tổng thời gian không được vượt quá 12 giờ";
        }



        if (
            Number(
                form.standardOutput
                ||
                0
            ) <= 0
        ) {

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


        if (Number(form.actualOutput || 0) !== calculateActualOutput(form)) {
            return productExcludesKqd()
                ? "Thực tế phải bằng TT OK cộng NG được tính (không gồm KQD của mã sản phẩm này)"
                : "Thực tế phải bằng TT OK cộng TT NG";
        }

        const missingExtraField = currentExtraFields.find(
            (field) => field.required && !String(extraData[field.key] || "").trim()
        );
        if (missingExtraField) {
            return `Vui lòng nhập ${missingExtraField.label}`;
        }

        return "";

    };


    // =====================================================
    // GỬI BÁO CÁO
    // =====================================================

    const focusValidationTarget = (message: string) => {
        const normalized = message.toLowerCase();
        let selector = "";

        if (normalized.includes("ngày làm việc")) selector = "#workerWorkDate";
        else if (normalized.includes("ca làm việc")) selector = 'input[name="shift"]';
        else if (normalized.includes("sản phẩm")) selector = usesMultiMachineLines ? '#machineProduct-0' : '#productName';
        else if (normalized.includes("máy")) selector = usesMultiMachineLines ? '#machineNo-0' : '#machineNo';
        else if (normalized.includes("thời gian")) selector = 'input[placeholder="0"]';
        else if (normalized.includes("tt ok") || normalized.includes("sản lượng")) selector = '#ttOk';

        if (normalized.includes("ng")) setShowNg(true);
        if (normalized.includes("trừ")) setShowDeduction(true);

        if (!selector) return;
        window.setTimeout(() => {
            const element = document.querySelector<HTMLElement>(selector);
            element?.focus({ preventScroll: true });
            element?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 30);
    };

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

                const payload = buildProductionReportPayload({
                    clientRequestId: clientRequestIdRef.current,
                    processId: processInfo.id,
                    form,
                    extraData,
                    operationType,
                    isCutLongProcess,
                    usesAnyMachine,
                    usesMultiMachineLines,
                    usesSingleMachine,
                    machineLines,
                    machineOptions,
                    productOptions: scopedProductOptions,
                    activeNgOptions,
                    deductions,
                    activeDeductionOptions,
                    excludeKqdFromTt: resolvedReportKqdPolicy === true,
                });

                let response;
                if (!navigator.onLine) {
                    enqueueOfflineReport(payload);
                    showToast("Đang mất mạng. Báo cáo đã được lưu trên thiết bị và sẽ tự gửi khi có Internet.", "warning");
                    clearProcessDraft(process);
                    clientRequestIdRef.current = null;
                    window.setTimeout(() => navigate("/worker", { replace: true }), 900);
                    return;
                }
                try {
                    response = await createTempReport(payload);
                } catch (error: any) {
                    if (axios.isAxiosError(error) && error.response?.status === 429) {
                        showToast("Bạn thao tác quá nhanh. Dữ liệu trên form vẫn được giữ, vui lòng thử lại sau ít phút.", "warning");
                        return;
                    }
                    if (axios.isAxiosError(error) && error.response?.status === 409 && ["DUPLICATE_PRODUCTION_REPORT", "DUPLICATE_CONFIRMATION_REQUIRED"].includes(String(error.response?.data?.code || ""))) {
                        const duplicateResponse = error.response;
                        const challengeToken = String(duplicateResponse?.duplicate_confirmation_token || duplicateResponse.data?.duplicate_confirmation_token || "").trim();
                        if (!challengeToken) {
                            throw error;
                        }
                        const prompt = toDuplicatePrompt(duplicateResponse.data, payload);
                        if (prompt) {
                            const reportType = duplicateResponse.data?.report_type === "approved" ? "approved" : "temp";
                            setDuplicatePrompt({ ...prompt, reportType, formSignature: getDuplicateFormSignature() });
                            return;
                        }
                    }
                    if (isTransientNetworkFailure(error)) {
                        enqueueOfflineReport(payload);
                        showToast("Kết nối Internet bị gián đoạn. Báo cáo đã được lưu trên thiết bị và sẽ tự gửi lại khi có mạng.", "warning");
                        clearProcessDraft(process);
                        clientRequestIdRef.current = null;
                        window.setTimeout(() => navigate("/worker", { replace: true }), 900);
                        return;
                    }
                    throw error;
                }

                const submitOutcome = classifyProcessSubmitResponse(response);

                if (
                    submitOutcome === "similar_report" &&
                    response?.data?.id
                ) {
                    // A force-create action is only safe when the server issued
                    // a challenge token bound to this exact collision. Legacy /
                    // idempotent duplicate responses without a token are treated
                    // as already-recorded rather than exposing an unsafe action.
                    const prompt = toDuplicatePrompt(response, payload);
                    if (prompt) {
                        setDuplicatePrompt({ ...prompt, formSignature: getDuplicateFormSignature() });
                        return;
                    }
                }

                showToast(
                    submitOutcome === "duplicate"
                        ? "Báo cáo này đã được hệ thống ghi nhận trước đó"
                        : "Lưu báo cáo thành công. Báo cáo đã được gửi chờ duyệt.",
                    submitOutcome === "duplicate"
                        ? "info"
                        : "success"
                );

clearProcessDraft(process);
clientRequestIdRef.current = null;

/*
 * Cho người dùng đủ thời gian nhìn thấy thông báo
 * trước khi quay về trang chọn công đoạn.
 */
window.setTimeout(() => {
    navigate(
        "/worker",
        {
            replace: true
        }
    );
}, 900);

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

        setForm((prev) => ({

            ...initialForm,

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

        clearProcessDraft(process);

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
                    form={form}
                    setForm={setForm}
                    onFormChange={handleChange}
                    isCutLongProcess={isCutLongProcess}
                    isInspectionProcess={isInspectionProcess}
                    operationType={operationType}
                    setOperationType={setOperationType}
                    operationMode={operationMode}
                    setOperationMode={setOperationMode}
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
                    toggleMachineDefect={toggleMachineDefect}
                    updateMachineDefectValue={updateMachineDefectValue}
                />

                <ProcessExtraFieldsSection
                    fields={currentExtraFields}
                    extraData={extraData}
                    setExtraData={setExtraData}
                />

                <ProcessTimeDeductionSection
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


                <ProcessQualitySection
                    form={form}
                    activeNgOptions={activeNgOptions}
                    selectedNg={selectedNg}
                    showNg={showNg}
                    setShowNg={setShowNg}
                    usesMultiMachineLines={usesMultiMachineLines}
                    formatIntegerDisplay={formatIntegerDisplay}
                    onTtOkChange={handleTtOkChange}
                    onNumberBlur={handleNumberBlur}
                    onToggleNg={handleToggleNg}
                    onNgValue={handleNgValue}
                />

                <ProcessSubmitActions
                duplicatePrompt={duplicatePrompt}
                submitting={submitting}
                loadingWorker={loadingWorker}
                onCancelDuplicate={() => {
                    setDuplicatePrompt(null);
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