import {
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
    getCompanyNetworkAccess,
    getDeductionOptionsByProcess,
    updateTempReport,
} from "../../services/productionService";

import {
    getCurrentWorker
} from "../../services/workerService";


import type {
    WorkerProfile
} from "../../types/worker";
import type { ProductionReport } from "../../types/production";
import {
    getCachedDefects,
    getCachedMachines,
    getCachedProductStandards
} from "../../services/masterDataCache";

import {
    resolveProductStandard
} from "../../services/masterDataService";
import type {
    MachineOption,
    ProductStandardOption
} from "../../services/masterDataService";

import { useToast } from "../../components/feedback/toastContext";
import { getApiError } from "../../utils/apiError";
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
    allNgOptions,
    clampWorkerWorkDate,
    createEmptyMachineLine,
    deductionOptions,
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
import ProcessNetworkGate from "./components/ProcessNetworkGate";
import ProcessWorkerHeader from "./components/ProcessWorkerHeader";
import ProcessQualitySection from "./components/ProcessQualitySection";
import ProcessBasicInfoSection from "./components/ProcessBasicInfoSection";
import ProcessSubmitActions from "./components/ProcessSubmitActions";
import {
    MAX_TOTAL_WORK_MINUTES,
    calculateActualOutput as calculateActualOutputValue,
    formatIntegerDisplay,
    getDeductionMinutes,
    parseFlexibleTime,
    parseIntegerDisplay,
} from "./processFormUtils";

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
    const [duplicatePrompt, setDuplicatePrompt] = useState<{
        reportId: number;
        payload: ProductionReport;
    } | null>(null);

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

const [
    machineOptions,
    setMachineOptions
] = useState<MachineOption[]>([]);


const [
    productOptions,
    setProductOptions
] = useState<ProductStandardOption[]>([]);

const [
    activeNgOptions,
    setActiveNgOptions
] = useState(allNgOptions);

const [
    activeDeductionOptions,
    setActiveDeductionOptions
] = useState(deductionOptions.map((item) => ({ ...item, id: undefined as number | undefined, code: item.key })));


const [
    loadingMasterData,
    setLoadingMasterData
] = useState(true);
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


const productAutocompleteOptions =
    useMemo<AutocompleteOption[]>(
        () =>

            productOptions.map(
                (
                    product:
                        ProductStandardOption
                ) => ({

                    value:
                        product.product_code,

                    label:
                        product.product_code

                })
            ),

        [productOptions]
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

    const processCode = ({
        "cat-long": "GC",
        mai: "MAI",
        do: "DO",
        "kiem-1": "K1",
        "kiem-2": "K2",
        can: "CAN",
        ep: "EP",
        bavia: "XLBV",
        sx3: "SX3",
    } as Record<string, string>)[process] || "GC";
    const isCutLongProcess = processCode === "GC";
    const isInspectionProcess = processCode === "K1" || processCode === "K2";
    const isAlwaysMultiMachineProcess = ["MAI", "DO", "EP"].includes(processCode);
    const isSingleMachineProcess = processCode === "CAN";
    const isManualOnlyProcess = processCode === "XLBV" || processCode === "SX3";
    const [operationType, setOperationType] = useState<OperationType>("CUT");
    const [operationMode, setOperationMode] = useState<OperationMode>(
        isAlwaysMultiMachineProcess || isSingleMachineProcess ? "MACHINE" : "MANUAL"
    );
    const [machineCount, setMachineCount] = useState(1);
    const [machineLines, setMachineLines] = useState<MachineLineState[]>([createEmptyMachineLine()]);
    const [extraData, setExtraData] = useState<Record<string, string>>({});
    const currentExtraFields = processExtraFields[process] || [];
    const usesMultiMachineLines = isAlwaysMultiMachineProcess || (isCutLongProcess && operationMode === "MACHINE");
    const usesSingleMachine = isSingleMachineProcess || (isInspectionProcess && operationMode === "MACHINE");
    const usesAnyMachine = usesMultiMachineLines || usesSingleMachine;

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

    const resizeMachineLines = (count: number) => {
        const normalizedCount = Math.min(4, Math.max(1, count));
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
            const resolved = await resolveProductStandard(
                processInfo.id,
                normalizedMachine,
                normalizedProduct
            );
            const output = Number(resolved.resolved_output_per_hour || 0);
            updateMachineLine(index, {
                standardOutputPerHour: Number.isFinite(output) ? output : 0,
                standardTimeSeconds: resolved.standard_time_seconds,
                standardSource: resolved.standard_source,
                standardLoading: false,
                standardError: output > 0 ? "" : "Định mức bằng 0"
            });
        } catch (error) {
            updateMachineLine(index, {
                standardOutputPerHour: 0,
                standardTimeSeconds: null,
                standardSource: null,
                standardLoading: false,
                standardError: getApiError(error, "Không lấy được định mức").message
            });
        }
    };

    const getMachineNgTotal = (line: MachineLineState) =>
        line.selectedDefects.reduce((sum, key) => sum + Number(line.defects[key] || 0), 0);

    const toggleMachineDefect = (lineIndex: number, key: string) => {
        setMachineLines((current) => current.map((line, index) => {
            if (index !== lineIndex) return line;
            const exists = line.selectedDefects.includes(key);
            const selectedDefects = exists
                ? line.selectedDefects.filter((item) => item !== key)
                : [...line.selectedDefects, key];
            const defects = exists ? { ...line.defects, [key]: "" } : line.defects;
            const ngQuantity = String(selectedDefects.reduce((sum, item) => sum + Number(defects[item] || 0), 0));
            return { ...line, selectedDefects, defects, ngQuantity };
        }));
    };

    const updateMachineDefectValue = (lineIndex: number, key: string, value: string) => {
        const sanitized = value.replace(/\D/g, "");
        setMachineLines((current) => current.map((line, index) => {
            if (index !== lineIndex) return line;
            const defects = { ...line.defects, [key]: sanitized };
            const ngQuantity = String(line.selectedDefects.reduce((sum, item) => sum + Number(defects[item] || 0), 0));
            return { ...line, defects, ngQuantity };
        }));
    };

    useEffect(() => {
        if (!usesMultiMachineLines) return;

        const totalOk = machineLines.reduce((sum, line) => sum + Number(line.okQuantity || 0), 0);
        const totalNg = machineLines.reduce((sum, line) => sum + Number(line.ngQuantity || 0), 0);

        const aggregatedDefects = machineLines.reduce<Record<string, number>>((result, line) => {
            line.selectedDefects.forEach((key) => {
                result[key] = (result[key] || 0) + Number(line.defects[key] || 0);
            });
            return result;
        }, {});

        const aggregatedSelectedNg = activeNgOptions
            .filter((item) => Number(aggregatedDefects[item.key] || 0) > 0)
            .map((item) => item.key);

        setSelectedNg(aggregatedSelectedNg);
        setForm((current) => {
            const next: FormState = {
                ...current,
                productName: machineLines[0]?.productCode || "",
                standardOutput: machineLines.length
                    ? String(machineLines.reduce((sum, line) => sum + Number(line.standardOutputPerHour || 0), 0))
                    : "0",
                actualOutput: String(totalOk + totalNg),
                ttOk: String(totalOk),
                ttNg: String(totalNg)
            };

            activeNgOptions.forEach((item) => {
                next[item.key] = String(aggregatedDefects[item.key] || 0);
            });

            return next;
        });
    }, [usesMultiMachineLines, machineLines, activeNgOptions]);

const selectedProduct = useMemo(
    () => productOptions.find((product) => product.product_code === form.productName),
    [productOptions, form.productName]
);

const productExcludesKqd = (): boolean =>
    Number(selectedProduct?.exclude_kqd_from_tt || 0) === 1;

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

    const [networkChecking, setNetworkChecking] = useState(true);
    const [networkAllowed, setNetworkAllowed] = useState(false);
    const [networkMessage, setNetworkMessage] = useState("Đang kiểm tra mạng công ty...");
    const [clientIp, setClientIp] = useState("");

    const checkCompanyNetwork = async (): Promise<boolean> => {
        try {
            setNetworkChecking(true);
            const access = await getCompanyNetworkAccess();
            const allowed = Boolean(access.allowed);
            setNetworkAllowed(allowed);
            setNetworkMessage(access.message || (allowed
                ? "Thiết bị đang kết nối qua mạng công ty."
                : "Vui lòng tắt 4G/5G và kết nối Wi-Fi KTC để nhập báo cáo."));
            setClientIp(access.client_ip || "");
            return allowed;
        } catch (error: unknown) {
            const { message } = getApiError(error, "Không thể kiểm tra mạng công ty");
            setNetworkAllowed(false);
            setNetworkMessage(message);
            setClientIp("");
            return false;
        } finally {
            setNetworkChecking(false);
        }
    };

    useEffect(() => {
        void checkCompanyNetwork();
    }, []);


    // =====================================================
    // LẤY THÔNG TIN WORKER THEO USER ID
    // =====================================================

    useEffect(() => {

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

                    setLoadingWorker(
                        false
                    );

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

                if (value === "C" && prev.shift !== "C") {
                    next.workDate = clampWorkerWorkDate(
                        shiftLocalDate(prev.workDate, -1)
                    );
                } else if (prev.shift === "C" && value !== "C") {
                    next.workDate = clampWorkerWorkDate(
                        shiftLocalDate(prev.workDate, 1)
                    );
                }

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

            if (
                name ===
                "totalTime"
            ) {

                next.actualTime =
                    String(

                        Math.max(

                            0,

                            Number(
                                value
                                ||
                                0
                            )

                            -

                            Number(
                                next.deductionTime
                                ||
                                0
                            )

                        )

                    );

            }


            return next;

        });

    };


    // =====================================================
    // CHỈ CHO PHÉP NHẬP SỐ THẬP PHÂN
    // =====================================================

// =====================================================
// LOAD DANH SÁCH MÁY VÀ SẢN PHẨM THEO CÔNG ĐOẠN
// =====================================================

useEffect(() => {

    const loadMasterData =
        async () => {

            try {

                setLoadingMasterData(
                    true
                );


                // Tải độc lập để một API lỗi không làm mất toàn bộ danh sách.
                const [
                    machinesResult,
                    productsResult,
                    defectsResult,
                    deductionsResult
                ] = await Promise.allSettled([
                    getCachedMachines(processInfo.id),
                    getCachedProductStandards(processInfo.id),
                    getCachedDefects(processInfo.id),
                    getDeductionOptionsByProcess(processInfo.id)
                ]);

                const machines = machinesResult.status === "fulfilled"
                    ? machinesResult.value
                    : [];
                const products = productsResult.status === "fulfilled"
                    ? productsResult.value
                    : [];

                setMachineOptions(machines);
                setProductOptions(products);

                if (defectsResult.status === "fulfilled") {
                    setActiveNgOptions(
                        defectsResult.value.map((item) => ({
                            id: Number(item.id || item.defect_type_id),
                            key: `defect_${Number(item.id || item.defect_type_id)}`,
                            code: String(item.defect_code || "").trim(),
                            label: String(item.defect_name || item.defect_code || "Lỗi NG").trim()
                        }))
                    );
                } else {
                    console.error("LOAD DEFECT OPTIONS ERROR:", defectsResult.reason);
                }

                if (deductionsResult.status === "fulfilled") {
                    const options = deductionsResult.value.map((item) => ({
                        id: Number(item.id || item.deduction_type_id),
                        key: `deduction_${Number(item.id || item.deduction_type_id)}`,
                        code: String(item.deduction_code || "").trim(),
                        label: String(item.deduction_name || item.deduction_code || "Trừ giờ").trim()
                    }));
                    setActiveDeductionOptions(options.length ? options : deductionOptions.map((item) => ({ ...item, id: undefined, code: item.key })));
                } else {
                    console.error("LOAD DEDUCTION OPTIONS ERROR:", deductionsResult.reason);
                    setActiveDeductionOptions(deductionOptions.map((item) => ({ ...item, id: undefined, code: item.key })));
                }

                if (machinesResult.status === "rejected") {
                    console.error("LOAD MACHINES ERROR:", machinesResult.reason);
                }
                if (productsResult.status === "rejected") {
                    console.error("LOAD PRODUCT STANDARDS ERROR:", productsResult.reason);
                }

                if (machines.length === 0 || products.length === 0) {
                    showToast(
                        machines.length === 0 && products.length === 0
                            ? "Không tìm thấy máy và sản phẩm cho công đoạn này"
                            : machines.length === 0
                                ? "Không tìm thấy máy cho công đoạn này"
                                : "Không tìm thấy sản phẩm cho công đoạn này"
                    );
                }

            }
            catch (error: unknown) {

                console.error(
                    "LOAD MASTER DATA ERROR:",
                    error
                );


                const message =

                    axios.isAxiosError(
                        error
                    )

                        ? error.response
                            ?.data
                            ?.message

                            ||

                            "Không thể tải danh sách máy hoặc sản phẩm"

                        : error instanceof Error

                            ? error.message

                            : "Không thể tải danh sách máy hoặc sản phẩm";


                showToast(
                    message
                );

            }
            finally {

                setLoadingMasterData(
                    false
                );

            }

        };


    void loadMasterData();

}, [processInfo.id, showToast]);

    // =====================================================
    // CHỈ CHO PHÉP NHẬP SỐ NGUYÊN
    // =====================================================

    const isValidIntegerInput = (
        value: string
    ): boolean => {

        return (

            value === ""

            ||

            /^\d*$/.test(
                value
            )

        );

    };

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
        const totalMinutes = getDeductionMinutes(data);
        const deductionHours = totalMinutes / 60;

        setForm((prev) => {
            const actualHours = Math.max(0, Number(prev.actualHours) || 0);
            const actualMinutes = Math.min(59, Math.max(0, Number(prev.actualMinutes) || 0));
            const actualTime = actualHours + actualMinutes / 60;
            return {
                ...prev,
                actualTime: String(actualTime),
                deductionTime: String(deductionHours),
                totalTime: String(actualTime + deductionHours)
            };
        });
    };


    // =====================================================
    // CẬP NHẬT GIÁ TRỊ MỘT LOẠI TRỪ GIỜ
    // =====================================================

const normalizeDeductionValue = (key: DeductionKey) => {
    setDeductions((prev) => {
        const raw = String(prev[key] || "").replace(/\D/g, "");
        const next = { ...prev, [key]: raw ? String(Number(raw)) : "" };
        updateTotalDeduction(next);
        return next;
    });
};

const updateDeductionValue = (
    key: DeductionKey,
    value: string
) => {

    const normalizedValue = value.replace(/\D/g, "");

    if (normalizedValue !== "" && Number(normalizedValue) > MAX_TOTAL_WORK_MINUTES) {
        showToast("Tổng thời gian tối đa là 12 giờ", "warning");
        return;
    }

    setDeductions((prev) => {
        const next = {
            ...prev,
            [key]: normalizedValue
        };

        const actualMinutes =
            (Number(form.actualHours) || 0) * 60
            + (Number(form.actualMinutes) || 0);
        const prospectiveTotalMinutes =
            actualMinutes + getDeductionMinutes(next);

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

    const handleNgValue = (

        key: NgKey,

        value: string

    ) => {

        if (
            !isValidIntegerInput(
                value
            )
        ) {

            return;

        }


        setForm((prev) => {

            const next = {

                ...prev,

                [key]:
                    value

            };


            const totalNg =
                activeNgOptions.reduce(

                    (
                        sum,
                        item
                    ) =>

                        sum
                        +
                        Number(
                            next[item.key]
                            ||
                            0
                        ),

                    0

                );


            next.ttNg =
                String(
                    totalNg
                );


            next.actualOutput = String(calculateActualOutput(next));


            return next;

        });

    };


    // =====================================================
    // CHỌN / BỎ CHỌN LỖI NG
    // =====================================================

    const handleToggleNg = (

        key: NgKey,

        checked: boolean

    ) => {

        if (checked) {

            setSelectedNg(
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


            setForm((prev) => {

                const next = {

                    ...prev,

                    [key]:
                        prev[key]
                        ||
                        ""

                };


                const totalNg =
                    activeNgOptions.reduce(

                        (
                            sum,
                            item
                        ) =>

                            sum
                            +
                            Number(
                                next[item.key]
                                ||
                                0
                            ),

                        0

                    );


                next.ttNg =
                    String(
                        totalNg
                    );


                next.actualOutput = String(calculateActualOutput(next));


                return next;

            });


            return;

        }


        setSelectedNg(
            (prev) =>
                prev.filter(
                    (item) =>
                        item !== key
                )
        );


        setForm((prev) => {

            const next = {

                ...prev,

                [key]:
                    ""

            };


            const totalNg =
                activeNgOptions.reduce(

                    (
                        sum,
                        item
                    ) =>

                        sum
                        +
                        Number(
                            next[item.key]
                            ||
                            0
                        ),

                    0

                );


            next.ttNg =
                String(
                    totalNg
                );


            next.actualOutput = String(calculateActualOutput(next));


            return next;

        });

    };

    // =====================================================
    // CẬP NHẬT TT OK
    // =====================================================


    const handleTtOkChange = (

        event:
            React.ChangeEvent<
                HTMLInputElement
            >

    ) => {

        const value =
            parseIntegerDisplay(event.target.value);


        if (
            !isValidIntegerInput(
                value
            )
        ) {

            return;

        }


        setForm((prev) => ({

            ...prev,

            ttOk:
                value,

            actualOutput: String(calculateActualOutput({ ...prev, ttOk: value }))

        }));

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


        setForm((prev) => ({

            ...prev,

            [name]:
                ""

        }));

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


        if (
            !form.workDate
        ) {

            return "Vui lòng chọn ngày làm việc";

        }


        if (form.workDate > getWorkerMaxWorkDate()) {
            return "Không được chọn ngày làm việc trong tương lai";
        }


        if (form.workDate < getWorkerMinWorkDate()) {
            return "Chỉ được nhập báo cáo trong vòng 14 ngày gần nhất";
        }


        if (
            !form.shift
        ) {

            return "Vui lòng chọn ca làm việc";

        }


        if (!usesMultiMachineLines) {
            if (!form.productName.trim()) {
                return "Vui lòng chọn sản phẩm";
            }

            const matchedProduct = productOptions.find(
                (item) => item.product_code.trim().toLowerCase() === form.productName.trim().toLowerCase()
            );
            if (!matchedProduct) {
                return "Sản phẩm không có trong danh mục. Vui lòng chọn lại từ danh sách gợi ý";
            }
        }

        if (usesMultiMachineLines) {
            if (machineLines.length < 1 || machineLines.length > 4) {
                return "Vui lòng chọn từ 1 đến 4 máy";
            }
            const usedMachines = new Set<string>();
            for (let index = 0; index < machineLines.length; index += 1) {
                const line = machineLines[index];
                const code = line.machineCode.trim().toLowerCase();
                const matchedMachine = machineOptions.find(
                    (item) => item.machine_code.trim().toLowerCase() === code
                );
                if (!matchedMachine) return `Vui lòng chọn đúng máy ${index + 1} từ danh mục`;
                if (usedMachines.has(code)) return "Không được chọn trùng số máy";
                usedMachines.add(code);
                const matchedLineProduct = productOptions.find(
                    (item) => item.product_code.trim().toLowerCase() === line.productCode.trim().toLowerCase()
                );
                if (!matchedLineProduct) return `Vui lòng chọn đúng sản phẩm cho máy ${index + 1}`;
                const okQuantity = Number(line.okQuantity || 0);
                const ngQuantity = Number(line.ngQuantity || 0);
                if (!Number.isInteger(okQuantity) || okQuantity < 0) return `OK máy ${index + 1} phải là số nguyên không âm`;
                if (!Number.isInteger(ngQuantity) || ngQuantity < 0) return `NG máy ${index + 1} phải là số nguyên không âm`;
                const minutes = (Number(line.hours) || 0) * 60 + (Number(line.minutes) || 0);
                if (Number(line.minutes || 0) > 59) return `Số phút máy ${index + 1} phải từ 0 đến 59`;
                if (minutes <= 0) return `Vui lòng nhập thời gian chạy máy ${index + 1}`;
                if (minutes > 24 * 60) return `Thời gian máy ${index + 1} không được vượt quá 24 giờ`;
            }
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


        const totalDefects =
            activeNgOptions.reduce(

                (
                    sum,
                    item
                ) =>

                    sum
                    +
                    Number(
                        form[item.key]
                        ||
                        0
                    ),

                0

            );


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

    const handleSubmit =
        async () => {

            // Kiểm tra lại ngay trước lúc gửi để chặn trường hợp người dùng
            // mở form bằng Wi-Fi công ty rồi chuyển sang 4G/5G.
            const isOnCompanyNetwork = await checkCompanyNetwork();
            if (!isOnCompanyNetwork) {
                showToast("Không thể gửi dữ liệu. Hãy tắt 4G/5G và kết nối Wi-Fi KTC.", "error");
                return;
            }

            const validationMessage =
                validateForm();


            if (
                validationMessage
            ) {

                showToast(validationMessage, "warning");


                return;

            }


            if (submitLockRef.current) return;
            submitLockRef.current = true;
            clientRequestIdRef.current ||= crypto.randomUUID();

            try {
                setSubmitting(true);

                const payload: ProductionReport = {
                    client_request_id: clientRequestIdRef.current,

                    process_id:
                        processInfo.id,

                    work_date:
                        form.workDate,

                    // Ngày báo cáo dùng để phân nhóm; entry_date là ngày công nhân thực tế nhập.
                    entry_date: getCurrentLocalDate(),

                    extra_data: Object.fromEntries(
                        Object.entries(extraData).map(([key, value]) => [
                            key,
                            value !== "" && !Number.isNaN(Number(value)) ? Number(value) : value
                        ])
                    ) as Record<string, string | number | boolean>,

                    shift:
                        form.shift,

                    machine_no:
                        usesMultiMachineLines
                            ? machineLines.map((line) => line.machineCode.trim()).join(", ")
                            : usesSingleMachine
                                ? (machineOptions.find(
                                    (item) => item.machine_code.trim().toLowerCase() === form.machineNo.trim().toLowerCase()
                                )?.machine_code || form.machineNo.trim())
                                : "",

                    operation_type: isCutLongProcess ? operationType : undefined,
                    operation_mode: usesAnyMachine ? "MACHINE" : "MANUAL",
                    machine_lines: usesMultiMachineLines
                        ? machineLines.map((line) => ({
                            machine_code: machineOptions.find(
                                (item) => item.machine_code.trim().toLowerCase() === line.machineCode.trim().toLowerCase()
                            )?.machine_code || line.machineCode.trim(),
                            product_code: productOptions.find(
                                (item) => item.product_code.trim().toLowerCase() === line.productCode.trim().toLowerCase()
                            )?.product_code || line.productCode.trim(),
                            machine_time_hours: (Number(line.hours) || 0) + (Number(line.minutes) || 0) / 60,
                            ok_quantity: Number(line.okQuantity || 0),
                            ng_quantity: Number(line.ngQuantity || 0),
                            defects: line.selectedDefects
                                .filter((key) => Number(line.defects[key] || 0) > 0)
                                .map((key) => {
                                    const option = activeNgOptions.find((item) => item.key === key);
                                    return {
                                        defect_id: option?.id || null,
                                        defect_code: option?.code || key,
                                        defect_name: option?.label || key,
                                        quantity: Number(line.defects[key] || 0)
                                    };
                                })
                        }))
                        : undefined,

                    exclude_kqd_from_tt:
                        Number(selectedProduct?.exclude_kqd_from_tt || 0),


                    total_time:
                        parseFlexibleTime(form.totalTime),

                    actual_time:
                        parseFlexibleTime(form.actualTime),

                    deduction_time:
                        parseFlexibleTime(form.deductionTime),


                
                    product_name:
                        usesMultiMachineLines
                            ? (machineLines[0]?.productCode.trim() || "")
                            : productOptions.find(
                                (item) => item.product_code.trim().toLowerCase() === form.productName.trim().toLowerCase()
                            )?.product_code || form.productName.trim(),

                    standard_output:
                        Number(
                            form.standardOutput
                            ||
                            0
                        ),

                    actual_output:
                        Number(
                            form.actualOutput
                            ||
                            0
                        ),


                    tt_ok:
                        usesMultiMachineLines
                            ? machineLines.reduce((sum, line) => sum + Number(line.okQuantity || 0), 0)
                            : Number(form.ttOk || 0),

                    tt_ng:
                        usesMultiMachineLines
                            ? machineLines.reduce((sum, line) => sum + Number(line.ngQuantity || 0), 0)
                            : Number(form.ttNg || 0),


                    kqd_dap_lai:
                        Number(
                            form.kqdDapLai
                            ||
                            0
                        ),

                    kqd_tuot:
                        Number(
                            form.kqdTuot
                            ||
                            0
                        ),

                    vo_do_long:
                        Number(
                            form.voDoLong
                            ||
                            0
                        ),

                    xuoc_do_long:
                        Number(
                            form.xuocDoLong
                            ||
                            0
                        ),

                    cong_gay:
                        Number(
                            form.congGay
                            ||
                            0
                        ),

                    xoay:
                        Number(
                            form.xoay
                            ||
                            0
                        ),

                    khong_dut:
                        Number(
                            form.khongDut
                            ||
                            0
                        ),

                    bavia_hut:
                        Number(
                            form.baviaHut
                            ||
                            0
                        ),

                    ppcm:
                        Number(
                            form.ppcm
                            ||
                            0
                        ),

                    loi_cao_su:
                        Number(
                            form.loiCaoSu
                            ||
                            0
                        ),

                    ng_kich_thuoc:
                        Number(
                            form.ngKichThuoc
                            ||
                            0
                        ),

                    cat_lem:
                        Number(
                            form.catLem
                            ||
                            0
                        ),


                    defects:
                        activeNgOptions

                            .filter(
                                (item) =>

                                    Number(
                                        form[item.key]
                                        ||
                                        0
                                    )
                                    >
                                    0
                            )

                            .map(
                                (item) => ({

                                    defect_type_id:
                                        item.id,

                                    defect_code:
                                        item.code,

                                    defect_name:
                                        item.label,

                                    quantity:
                                        Number(
                                            form[item.key]
                                            ||
                                            0
                                        )

                                })
                            ),


                    deductions:
                        activeDeductionOptions

                            .filter(
                                (item) =>

                                    Number(deductions[item.key] || 0)
                                    >
                                    0
                            )

                            .map(
                                (item) => ({

                                    deduction_type_id:
                                        item.id || undefined,

                                    deduction_code:
                                        String(item.code),

                                    deduction_name:
                                        item.label,

                                    hours:
                                        Number(deductions[item.key] || 0) / 60

                                })
                            ),


                    note: ""

                };

                const response = await createTempReport(payload);

                if (
                    response?.duplicate &&
                    response?.duplicate_reason === "similar_report" &&
                    response?.data?.id
                ) {
                    setDuplicatePrompt({
                        reportId: Number(response.data.id),
                        payload
                    });
                    return;
                }

                showToast(
                    response?.duplicate
                        ? "Báo cáo này đã được hệ thống ghi nhận trước đó"
                        : "Lưu báo cáo thành công. Báo cáo đã được gửi chờ duyệt.",
                    response?.duplicate
                        ? "info"
                        : "success"
                );

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


    const finishSuccessfulSubmit = (message: string) => {
        showToast(message, "success");
        clientRequestIdRef.current = null;
        setDuplicatePrompt(null);
        window.setTimeout(() => {
            navigate("/worker", { replace: true });
        }, 900);
    };

    const handleCreateDuplicateAnyway = async () => {
        if (!duplicatePrompt) return;
        try {
            setSubmitting(true);
            const payload = {
                ...duplicatePrompt.payload,
                client_request_id: crypto.randomUUID(),
                force_create: true
            };
            const response = await createTempReport(payload);
            finishSuccessfulSubmit(
                response?.duplicate
                    ? "Yêu cầu này đã được hệ thống ghi nhận trước đó"
                    : "Đã tạo báo cáo mới theo xác nhận của bạn."
            );
        } catch (error: unknown) {
            const { message, errors } = getApiError(error, "Không thể tạo báo cáo mới");
            showToast(Object.values(errors)[0] || message, "error");
        } finally {
            submitLockRef.current = false;
            setSubmitting(false);
        }
    };

    const handleUpdateExistingReport = async () => {
        if (!duplicatePrompt) return;
        try {
            setSubmitting(true);
            await updateTempReport(duplicatePrompt.reportId, duplicatePrompt.payload);
            finishSuccessfulSubmit("Đã cập nhật báo cáo cũ thành công.");
        } catch (error: unknown) {
            const { message, errors } = getApiError(error, "Không thể cập nhật báo cáo cũ");
            showToast(Object.values(errors)[0] || message, "error");
        } finally {
            submitLockRef.current = false;
            setSubmitting(false);
        }
    };

    // =====================================================
    // LÀM MỚI FORM
    // =====================================================

    const handleReset = () => {

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

    };
        if (networkChecking || !networkAllowed) {
            return (
                <ProcessNetworkGate
                    checking={networkChecking}
                    allowed={networkAllowed}
                    message={networkMessage}
                    clientIp={clientIp}
                    onRetry={() => void checkCompanyNetwork()}
                    onBack={() => navigate("/worker")}
                />
            );
        }

        return (

        <main className="worker-form-page">

            <div className="worker-form-shell">


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
                    productOptions={productOptions}
                    machineAutocompleteOptions={machineAutocompleteOptions}
                    loadingMasterData={loadingMasterData}
                    machineCount={machineCount}
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

            </div>


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
                onReset={handleReset}
                onSubmit={() => void handleSubmit()}
            />

        </main>

    );

}


export default ProcessPage;