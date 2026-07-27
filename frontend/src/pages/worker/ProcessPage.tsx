import {
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


import "./ProcessPage.css";


import {
    checkSimilarTempReport,
    createTempReport,
    getCompanyNetworkAccess,
    updateTempReport,
    getDefectOptionsByProcess
} from "../../services/productionService";

import {
    getCurrentWorker
} from "../../services/workerService";


import type {
    WorkerProfile
} from "../../types/worker";
import type { ProductionReport } from "../../types/production";
import {
    getMachinesByProcess,
    getProductStandardsByProcess
} from "../../services/masterDataService";

import type {
    MachineOption,
    ProductStandardOption
} from "../../services/masterDataService";

import AutocompleteInput from "../../components/common/AutocompleteInput";
import { useToast } from "../../components/feedback/toastContext";
import { getApiError } from "../../utils/apiError";

import type {
    AutocompleteOption
} from "../../components/common/AutocompleteInput";
// =====================================================
// KIỂU DỮ LIỆU FORM
// =====================================================

type FormState = {

    [key: string]: string;

    workDate: string;

    shift: string;

    workerCode: string;

    workerName: string;

    trainingPercent: string;

    machineNo: string;


    totalTime: string;

    actualTime: string;

    actualHours: string;

    actualMinutes: string;

    deductionTime: string;


    productName: string;

    standardOutput: string;

    actualOutput: string;


    ttOk: string;

    ttNg: string;


    kqdDapLai: string;

    kqdTuot: string;

    voDoLong: string;

    xuocDoLong: string;

    congGay: string;

    xoay: string;

    khongDut: string;

    baviaHut: string;

    ppcm: string;

    loiCaoSu: string;

    ngKichThuoc: string;

    catLem: string;


    note: string;

};


// =====================================================
// DỮ LIỆU CHI TIẾT TRỪ GIỜ
// =====================================================

type DeductionState = {

    thieuSanLuong: string;

    batMay: string;

    chuyenMa: string;

    chinhMay: string;

    choChinhMay: string;

    matDien: string;

    matKhi: string;

    choHang: string;

    baoDuongMay: string;

    nghiGiaiLao: string;

    giaoCa: string;

    dungMayHoTro: string;

    giatCs: string;

    fiveS: string;

    hocViec: string;

};

// =====================================================
// KEY CÁC LỖI NG
// =====================================================

type NgKey = string;


// =====================================================
// KEY CÁC LOẠI TRỪ GIỜ
// =====================================================

type DeductionKey =
    keyof DeductionState;


// =====================================================
// THÔNG TIN CÔNG ĐOẠN
// ID PHẢI KHỚP BẢNG processes TRONG DATABASE
// =====================================================

const processMap: Record<
    string,
    {
        id: number;
        title: string;
        machineLabel: string;
    }
> = {

    "cat-long": {

        id: 1,

        title:
            "Mẫu Cắt / Lồng",

        machineLabel:
            "Số máy cắt (lồng)"

    },

    "mai": {

        id: 2,

        title:
            "Mẫu Mài",

        machineLabel:
            "Số máy mài"

    },

    "kiem-1": {

        id: 3,

        title:
            "Mẫu Kiểm 1",

        machineLabel:
            "Số máy / vị trí kiểm"

    },

    "kiem-2": {

        id: 4,

        title:
            "Mẫu Kiểm 2",

        machineLabel:
            "Số máy / vị trí kiểm"

    },

    "ep": {

        id: 5,

        title:
            "Mẫu Ép",

        machineLabel:
            "Số máy ép"

    },

    "can": {

        id: 6,

        title:
            "Mẫu Cán",

        machineLabel:
            "Số máy cán"

    },

    "bavia": {

        id: 7,

        title:
            "Mẫu Bavia",

        machineLabel:
            "Số máy / vị trí Bavia"

    }

};


// =====================================================
// DANH SÁCH LOẠI TRỪ GIỜ
// TÊN PHẢI KHỚP deduction_types TRONG DATABASE
// =====================================================

const deductionOptions: Array<{
    key: DeductionKey;
    label: string;
}> = [

{
    key:"thieuSanLuong",
    label:"Thiếu sản lượng"
},

{
    key:"batMay",
    label:"Bật máy, xét máy"
},

{
    key:"chuyenMa",
    label:"Chuyển mã"
},

{
    key:"chinhMay",
    label:"Chỉnh máy"
},

{
    key:"choChinhMay",
    label:"Chờ chỉnh máy"
},

{
    key:"matDien",
    label:"Mất điện"
},

{
    key:"matKhi",
    label:"Mất khí"
},

{
    key:"choHang",
    label:"Chờ hàng"
},

{
    key:"baoDuongMay",
    label:"Bảo dưỡng máy"
},

{
    key:"nghiGiaiLao",
    label:"Nghỉ giải lao"
},

{
    key:"giaoCa",
    label:"Giao ca"
},

{
    key:"dungMayHoTro",
    label:"Dừng máy đi hỗ trợ"
},

{
    key:"giatCs",
    label:"Giặt CS/Cân CS, Tuốt-Tái PP, GL"
},

{
    key:"fiveS",
    label:"5S"
},

{
    key:"hocViec",
    label:"Học việc, đào tạo"
}

];


// =====================================================
// DANH SÁCH LỖI NG
// TÊN PHẢI KHỚP defect_types TRONG DATABASE
// =====================================================

const allNgOptions: Array<{

    key: NgKey;

    id?: number;

    code: string;

    label: string;

}> = [

    {

        key:
            "kqdDapLai",

        code:
            "KQD_DL",

        label:
            "KQD dập lại"

    },

    {

        key:
            "kqdTuot",

        code:
            "KQD_TUOT",

        label:
            "KQD tuột"

    },

    {

        key:
            "voDoLong",

        code:
            "VO_LONG",

        label:
            "Vỡ do lồng"

    },

    {

        key:
            "xuocDoLong",

        code:
            "XUOC_LONG",

        label:
            "Xước do lồng"

    },

    {

        key:
            "congGay",

        code:
            "CONG_GAY",

        label:
            "Cong gãy"

    },

    {

        key:
            "xoay",

        code:
            "XOAY",

        label:
            "Xoay"

    },

    {

        key:
            "khongDut",

        code:
            "KHONG_DUT",

        label:
            "Không đứt"

    },

    {

        key:
            "baviaHut",

        code:
            "BAVIA",

        label:
            "Bavia hụt"

    },

    {

        key:
            "ppcm",

        code:
            "PPCM",

        label:
            "PPCM"

    },

    {

        key:
            "loiCaoSu",

        code:
            "CAO_SU",

        label:
            "Lỗi cao su"

    },

    {

        key:
            "ngKichThuoc",

        code:
            "KT",

        label:
            "NG kích thước"

    },

    {

        key:
            "catLem",

        code:
            "CAT_LEM",

        label:
            "Cắt lẹm"

    }

];


// =====================================================
// LẤY NGÀY HIỆN TẠI THEO MÚI GIỜ MÁY NGƯỜI DÙNG
// =====================================================

const getCurrentLocalDate =
    (): string => {

        const now =
            new Date();


        const year =
            now.getFullYear();


        const month =
            String(
                now.getMonth() + 1
            ).padStart(
                2,
                "0"
            );


        const day =
            String(
                now.getDate()
            ).padStart(
                2,
                "0"
            );


        return `${year}-${month}-${day}`;

    };


// =====================================================
// CỘNG/TRỪ NGÀY THEO GIỜ ĐỊA PHƯƠNG
// Ca C làm qua đêm nên được tính cho ngày sản xuất hôm trước.
// =====================================================

const shiftLocalDate = (dateValue: string, dayOffset: number): string => {

    const [year, month, day] = dateValue.split("-").map(Number);

    if (!year || !month || !day) {
        return dateValue;
    }

    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + dayOffset);

    const nextYear = date.getFullYear();
    const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
    const nextDay = String(date.getDate()).padStart(2, "0");

    return `${nextYear}-${nextMonth}-${nextDay}`;

};


// =====================================================
// GIỚI HẠN NGÀY NHẬP BÁO CÁO CỦA CÔNG NHÂN
// Cho phép hôm nay và 14 ngày trước đó (tổng cộng tối đa 15 ngày).
// Không cho phép chọn ngày tương lai.
// =====================================================

const getWorkerMaxWorkDate = (): string => getCurrentLocalDate();

const getWorkerMinWorkDate = (): string =>
    shiftLocalDate(getCurrentLocalDate(), -14);

const clampWorkerWorkDate = (dateValue: string): string => {
    const minDate = getWorkerMinWorkDate();
    const maxDate = getWorkerMaxWorkDate();

    if (!dateValue) return maxDate;
    if (dateValue < minDate) return minDate;
    if (dateValue > maxDate) return maxDate;
    return dateValue;
};

const getWorkerAllowedWorkDates = (): Array<{ value: string; label: string }> => {
    const today = getCurrentLocalDate();

    return Array.from({ length: 15 }, (_, index) => {
        const value = shiftLocalDate(today, -index);
        const [year, month, day] = value.split("-").map(Number);
        const date = new Date(year, month - 1, day);
        const formatted = date.toLocaleDateString("vi-VN", {
            weekday: "short",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });

        const prefix = index === 0
            ? "Hôm nay"
            : index === 1
                ? "Hôm qua"
                : "";

        return {
            value,
            label: prefix ? `${prefix} - ${formatted}` : formatted,
        };
    });
};


// =====================================================
// FORMAT GIỜ THẬP PHÂN ĐỂ HIỂN THỊ
//
// Ví dụ:
// 1.5  -> 1 giờ 30 phút
// 10.83 -> 10 giờ 50 phút
// =====================================================

const decimalHoursToText = (
    value: string
): string => {

    const normalized = value.trim().toLowerCase().replace(",", ".");
    const hourMinuteMatch = normalized.match(/^(\d{1,2})\s*(?:h|:|g)\s*(\d{1,2})$/);
    const parsedHours = hourMinuteMatch
        ? Number(hourMinuteMatch[1]) + Math.min(59, Number(hourMinuteMatch[2])) / 60
        : Number(normalized || 0);

    const decimalHours = Math.max(
        0,
        Number.isFinite(parsedHours) ? parsedHours : 0
    );


    const hours =
        Math.floor(
            decimalHours
        );


    const minutes =
        Math.round(
            (
                decimalHours
                -
                hours
            )
            *
            60
        );


    if (minutes === 60) {

        return `${hours + 1} giờ 0 phút`;

    }


    return `${hours} giờ ${minutes} phút`;

};


// =====================================================
// FORM MẶC ĐỊNH
// =====================================================

const initialForm: FormState = {

    workDate:
        getCurrentLocalDate(),

    shift:
        "A",

    workerCode:
        "",

    workerName:
        "",

    trainingPercent:
        "",

    machineNo:
        "",


    totalTime:
        "",

    actualTime:
        "",

    actualHours:
        "",

    actualMinutes:
        "",

    deductionTime:
        "",


    productName:
        "",

    standardOutput:
        "",

    actualOutput:
        "",


    ttOk:
        "",

    ttNg:
        "",


    kqdDapLai:
        "",

    kqdTuot:
        "",

    voDoLong:
        "",

    xuocDoLong:
        "",

    congGay:
        "",

    xoay:
        "",

    khongDut:
        "",

    baviaHut:
        "",

    ppcm:
        "",

    loiCaoSu:
        "",

    ngKichThuoc:
        "",

    catLem:
        "",


    note:
        ""

};


// =====================================================
// TRỪ GIỜ MẶC ĐỊNH
// =====================================================

const initialDeduction: DeductionState = {

    thieuSanLuong:"",

    batMay:"",

    chuyenMa:"",

    chinhMay:"",

    choChinhMay:"",

    matDien:"",

    matKhi:"",

    choHang:"",

    baoDuongMay:"",

    nghiGiaiLao:"",

    giaoCa:"",

    dungMayHoTro:"",

    giatCs:"",

    fiveS:"",

    hocViec:""

};




const KQD_CODES = new Set(["KQD_DL", "KQD_DAP_LAI", "KQD_TUOT"]);

// =====================================================
// COMPONENT
// =====================================================

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

const selectedProduct = useMemo(
    () => productOptions.find((product) => product.product_code === form.productName),
    [productOptions, form.productName]
);

const productExcludesKqd = (): boolean =>
    Number(selectedProduct?.exclude_kqd_from_tt || 0) === 1;

const calculateCountedNg = (values: FormState): number =>
    activeNgOptions.reduce((sum, item) => {
        const code = String(item.code || "").trim().toUpperCase();
        if (productExcludesKqd() && (KQD_CODES.has(code) || code.startsWith("KQD"))) return sum;
        return sum + Number(values[item.key] || 0);
    }, 0);

const calculateActualOutput = (values: FormState): number =>
    Number(values.ttOk || 0) + calculateCountedNg(values);





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


                    const savedUser =
                        localStorage.getItem(
                            "user"
                        );


                    if (!savedUser) {

                        localStorage.removeItem(
                            "token"
                        );


                        navigate(
                            "/login",
                            {
                                replace: true
                            }
                        );


                        return;

                    }


                    const workerData =
                        await getCurrentWorker();


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

                        localStorage.removeItem(
                            "token"
                        );

                        localStorage.removeItem(
                            "user"
                        );


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

    }, [navigate, showToast]);
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
                    defectsResult
                ] = await Promise.allSettled([
                    getMachinesByProcess(processInfo.id),
                    getProductStandardsByProcess(processInfo.id),
                    getDefectOptionsByProcess(processInfo.id)
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

const MAX_TOTAL_WORK_MINUTES = 12 * 60;

const getDeductionMinutes = (data: DeductionState): number =>
    Object.values(data).reduce(
        (sum, currentValue) => sum + (Number(currentValue) || 0),
        0
    );

const parseFlexibleTime = (value: string): number => {
    const normalized = value.trim().toLowerCase().replace(",", ".");

    if (!normalized) return 0;

    const hourMinuteMatch = normalized.match(/^(\d{1,3})\s*(?:h|:|g)\s*(\d{1,2})$/);
    if (hourMinuteMatch) {
        const hours = Number(hourMinuteMatch[1]);
        const minutes = Number(hourMinuteMatch[2]);

        if (minutes > 59) return Number.NaN;

        return hours + minutes / 60;
    }

    const hourOnlyMatch = normalized.match(/^(\d{1,3})\s*(?:h|g)$/);
    if (hourOnlyMatch) return Number(hourOnlyMatch[1]);

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
};





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

    const formatIntegerDisplay = (value: string): string => {
        const digits = value.replace(/\D/g, "");
        return digits ? Number(digits).toLocaleString("vi-VN") : "";
    };

    const parseIntegerDisplay = (value: string): string =>
        value.replace(/\D/g, "");


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


        if (!form.productName.trim()) {
            return "Vui lòng chọn sản phẩm";
        }

        const matchedProduct = productOptions.find(
            (item) => item.product_code.trim().toLowerCase() === form.productName.trim().toLowerCase()
        );
        if (!matchedProduct) {
            return "Sản phẩm không có trong danh mục. Vui lòng chọn lại từ danh sách gợi ý";
        }

        if (!form.machineNo.trim()) {
            return "Vui lòng chọn số máy";
        }

        const matchedMachine = machineOptions.find(
            (item) => item.machine_code.trim().toLowerCase() === form.machineNo.trim().toLowerCase()
        );
        if (!matchedMachine) {
            return "Máy không có trong danh mục. Vui lòng chọn lại từ danh sách gợi ý";
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

                    shift:
                        form.shift,

                    machine_no:
                        machineOptions.find(
                            (item) => item.machine_code.trim().toLowerCase() === form.machineNo.trim().toLowerCase()
                        )?.machine_code || form.machineNo.trim(),

                    exclude_kqd_from_tt:
                        Number(selectedProduct?.exclude_kqd_from_tt || 0),


                    total_time:
                        parseFlexibleTime(form.totalTime),

                    actual_time:
                        parseFlexibleTime(form.actualTime),

                    deduction_time:
                        parseFlexibleTime(form.deductionTime),


                
                    product_name:
                        productOptions.find(
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
                        Number(
                            form.ttOk
                            ||
                            0
                        ),

                    tt_ng:
                        Number(
                            form.ttNg
                            ||
                            0
                        ),


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
                        deductionOptions

                            .filter(
                                (item) =>

                                    Number(deductions[item.key] || 0)
                                    >
                                    0
                            )

                            .map(
                                (item) => ({

                                    deduction_name:
                                        item.label,

                                    hours:
                                        Number(deductions[item.key] || 0) / 60

                                })
                            ),


                    note: ""

                };

                const similar = await checkSimilarTempReport({
                    process_id: payload.process_id,
                    work_date: payload.work_date,
                    shift: payload.shift,
                    machine_no: payload.machine_no,
                    product_name: payload.product_name
                });

                if (similar.duplicate && similar.data?.id) {
                    setDuplicatePrompt({ reportId: similar.data.id, payload });
                    return;
                }

                const response = await createTempReport(payload);

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




        setShowDeduction(
            false
        );


        setShowNg(
            false
        );

    };
        if (networkChecking) {
            return (
                <main className="worker-form-page worker-network-page">
                    <section className="worker-network-card" aria-live="polite">
                        <div className="worker-network-symbol">↻</div>
                        <h1>Đang kiểm tra mạng công ty</h1>
                        <p>Vui lòng chờ trong giây lát.</p>
                    </section>
                </main>
            );
        }

        if (!networkAllowed) {
            return (
                <main className="worker-form-page worker-network-page">
                    <section className="worker-network-card worker-network-denied" role="alert">
                        <div className="worker-network-symbol">!</div>
                        <h1>Không thể nhập báo cáo</h1>
                        <p>{networkMessage}</p>
                        {clientIp && (
                            <small>IP hiện tại: {clientIp}</small>
                        )}
                        <div className="worker-network-actions">
                            <button type="button" onClick={() => void checkCompanyNetwork()}>
                                Kiểm tra lại
                            </button>
                            <button type="button" className="secondary" onClick={() => navigate("/worker")}>
                                Quay lại
                            </button>
                        </div>
                    </section>
                </main>
            );
        }

        return (

        <main className="worker-form-page">

            <div className="worker-form-shell">


                {/* =================================================
                    HEADER
                ================================================= */}

                <header className="worker-form-header">

                    <div className="worker-form-title-row">

                        <button

                            type="button"

                            className="worker-form-back"

                            onClick={() =>
                                navigate(-1)
                            }

                            aria-label="Quay lại"

                        >

                            ←

                        </button>


                        <h1>

                            {processInfo.title}

                        </h1>

                    </div>


                </header>

                <div className="worker-sticky-info">

                    <div className="worker-sticky-person">

                        <strong>
                            {form.workerName || "Đang tải..."}
                        </strong>

                        <span>
                            {form.workerCode || "---"}
                        </span>

                    </div>

                    <div className="worker-sticky-meta">

                        <span className="worker-sticky-training">
                            Học việc: {form.trainingPercent || 0}%
                        </span>

                        <label className="worker-sticky-date" htmlFor="workerWorkDate">

                            <select
                                id="workerWorkDate"
                                className="worker-sticky-date-select"
                                name="workDate"
                                value={clampWorkerWorkDate(form.workDate)}
                                onChange={handleChange}
                                aria-label="Chọn ngày báo cáo trong 15 ngày gần nhất"
                            >
                                {getWorkerAllowedWorkDates().map((dateOption) => (
                                    <option key={dateOption.value} value={dateOption.value}>
                                        {dateOption.label}
                                    </option>
                                ))}
                            </select>

                        </label>

                    </div>

                </div>


                {/* =================================================
                    THÔNG TIN CƠ BẢN
                ================================================= */}

                <section className="worker-form-card">

                    <h2 className="worker-card-title">

                        <span>

                            ⓘ

                        </span>

                        Thông tin cơ bản

                    </h2>


                    <div className="worker-basic-grid">


                        {/* CA LÀM VIỆC */}

                        <div className="worker-field-block worker-field-full">

                            <label className="worker-field-label">

                                Ca làm việc

                                <em>

                                    *

                                </em>

                            </label>


                            <div className="worker-shift-list">

                                {
                                    [
                                        "A",
                                        "B",
                                        "C",
                                        "D"
                                    ]
                                        .map(
                                            (
                                                shift
                                            ) => (

                                                <label

                                                    key={
                                                        shift
                                                    }

                                                    className="worker-shift-item"

                                                >

                                                    <input

                                                        type="radio"

                                                        name="shift"

                                                        value={
                                                            shift
                                                        }

                                                        checked={
                                                            form.shift
                                                            ===
                                                            shift
                                                        }

                                                        onChange={
                                                            handleChange
                                                        }

                                                    />


                                                    <span>

                                                        {
                                                            shift.replace(
                                                                "Ca ",
                                                                ""
                                                            )
                                                        }

                                                    </span>

                                                </label>

                                            )
                                        )
                                }

                            </div>

                        </div>

<div className="worker-field-block worker-field-full">

    <AutocompleteInput
        id="productName"
        label="Sản phẩm"
        value={form.productName}
        options={productAutocompleteOptions}
        placeholder="Nhập mã sản phẩm"
        required
        disabled={loadingMasterData}
        emptyMessage="Không tìm thấy sản phẩm"
        onChange={(value) => {

            const selectedProduct =
                productOptions.find(
                    (item) =>
                        item.product_code
                            .trim()
                            .toLowerCase()
                        ===
                        value
                            .trim()
                            .toLowerCase()
                );


            setForm((prev) => ({

                ...prev,

                productName:
                    value,

                standardOutput:
                    selectedProduct
                        ? String(
                            Math.round(Number(selectedProduct.standard_output) || 0)
                        )
                        : ""

            }));

        }}
        onSelect={(option) => {

            const selectedProduct =
                productOptions.find(
                    (item) =>
                        item.product_code
                        .trim()
                        .toLowerCase()
                    ===
                    option.value
                        .trim()
                        .toLowerCase()
                );


            setForm((prev) => ({

                ...prev,

                productName:
                    option.value,

                standardOutput:
                    selectedProduct
                        ? String(
                            Math.round(Number(selectedProduct.standard_output) || 0)
                        )
                        : ""

            }));

        }}
    />

</div>
                    
                        {/* SỐ MÁY */}

<div className="worker-field-block worker-field-full">

    <AutocompleteInput
        id="machineNo"
        label="Số máy"
        value={form.machineNo}
        options={machineAutocompleteOptions}
        placeholder="Nhập mã máy"
        required
        disabled={loadingMasterData}
        emptyMessage="Không tìm thấy máy"
onChange={(value: string) => {
            setForm((prev) => ({

                ...prev,

                machineNo:
                    value

            }));

        }}
onSelect={(
    option: AutocompleteOption
) => {
            setForm((prev) => ({

                ...prev,

                machineNo:
                    option.value

            }));

        }}
    />

</div>

                    </div>

                </section>


                {/* =================================================
                    HIỆU SUẤT & THỜI GIAN
                ================================================= */}

                <section className="worker-form-card">

                    <h2 className="worker-card-title">

                        <span>

                            ◷

                        </span>

                        Hiệu suất &amp; Thời gian

                    </h2>


                    <div className="worker-time-grid">
                        <div className="worker-time-item">
                            <label>Thời gian làm thực tế</label>
                            <div className="worker-time-split">
                                <input
                                    type="number"
                                    min="0"
                                    max="12"
                                    step="1"
                                    inputMode="numeric"
                                    value={form.actualHours}
                                    onChange={(event) => {
                                        const value = event.target.value.replace(/\D/g, "");
                                        if (value !== "" && Number(value) > 12) {
                                            showToast("Thời gian tối đa là 12 giờ", "warning");
                                            return;
                                        }

                                        const hours = Number(value) || 0;
                                        const deductionMinutes = getDeductionMinutes(deductions);
                                        const currentMinutes =
                                            hours === 12
                                                ? 0
                                                : Math.min(59, Number(form.actualMinutes) || 0);
                                        const prospectiveTotalMinutes =
                                            hours * 60 + currentMinutes + deductionMinutes;

                                        if (prospectiveTotalMinutes > MAX_TOTAL_WORK_MINUTES) {
                                            showToast(
                                                "Không thể chọn số giờ này vì tổng thời gian sẽ vượt quá 12 giờ",
                                                "warning"
                                            );
                                            return;
                                        }

                                        setForm((prev) => {
                                            const minutes = hours === 12
                                                ? 0
                                                : Math.min(59, Number(prev.actualMinutes) || 0);
                                            const actualTime = hours + minutes / 60;
                                            const deductionTime = parseFlexibleTime(prev.deductionTime);
                                            return {
                                                ...prev,
                                                actualHours: value,
                                                actualMinutes: hours === 12 ? "0" : prev.actualMinutes,
                                                actualTime: String(actualTime),
                                                totalTime: String(actualTime + deductionTime)
                                            };
                                        });
                                    }}
                                    placeholder="Giờ"
                                />
                                <span>giờ</span>
                                <input
                                    type="number"
                                    min="0"
                                    max="59"
                                    step="1"
                                    inputMode="numeric"
                                    value={form.actualMinutes}
                                    disabled={
                                        Number(form.actualHours) >= 12
                                        || (Number(form.actualHours) || 0) * 60
                                            + getDeductionMinutes(deductions)
                                            >= MAX_TOTAL_WORK_MINUTES
                                    }
                                    onChange={(event) => {
                                        const value = event.target.value.replace(/\D/g, "");
                                        if (value !== "" && Number(value) > 59) return;

                                        const hours = Number(form.actualHours) || 0;
                                        const minutes = Number(value) || 0;
                                        const deductionMinutes = getDeductionMinutes(deductions);

                                        if (hours === 12 && minutes > 0) {
                                            showToast(
                                                "Đã đủ 12 giờ nên số phút phải bằng 0",
                                                "warning"
                                            );
                                            return;
                                        }

                                        if (hours * 60 + minutes + deductionMinutes > MAX_TOTAL_WORK_MINUTES) {
                                            showToast(
                                                "Không thể tăng số phút vì tổng thời gian sẽ vượt quá 12 giờ",
                                                "warning"
                                            );
                                            return;
                                        }

                                        setForm((prev) => {
                                            const actualTime = hours + minutes / 60;
                                            const deductionTime = parseFlexibleTime(prev.deductionTime);
                                            return {
                                                ...prev,
                                                actualMinutes: value,
                                                actualTime: String(actualTime),
                                                totalTime: String(actualTime + deductionTime)
                                            };
                                        });
                                    }}
                                    placeholder="Phút"
                                />
                                <span>phút</span>
                            </div>
                            <small>Lưu DB/Excel: {parseFlexibleTime(form.actualTime).toFixed(3)} giờ</small>
                        </div>

                        <div className="worker-time-item">
                            <label>Tổng thời gian</label>
                            <input value={form.totalTime} readOnly />
                            <small>{decimalHoursToText(form.totalTime)}</small>
                        </div>

                        <div className="worker-time-item">
                            <label>Thời gian trừ</label>
                            <input value={form.deductionTime} readOnly />
                            <small>{decimalHoursToText(form.deductionTime)}</small>
                        </div>
                    </div>

                    {/* =================================================
                        CHỌN LOẠI TRỪ GIỜ
                    ================================================= */}

                    <div className="worker-dropdown-box">

                        <button

                            type="button"

                            className="worker-dropdown-title"

                            onClick={() =>
                                setShowDeduction(
                                    (
                                        prev
                                    ) => !prev
                                )
                            }

                        >

                            <span>

                                ⏱ Chọn loại trừ thời gian

                            </span>


                            <span>

                                {
                                    showDeduction

                                        ? "▲"

                                        : "▼"
                                }

                            </span>

                        </button>


                        {
                            showDeduction
                            && (

                                <div className="worker-dropdown-options">

                                    {
                                        deductionOptions
                                            .map(
                                                (
                                                    item
                                                ) => {

                                                    const checked =
                                                        selectedDeduction
                                                            .includes(
                                                                item.key
                                                            );


                                                    return (

                                                        <label

                                                            key={
                                                                item.key
                                                            }

                                                            className="worker-dropdown-option"

                                                        >

                                                            <input

                                                                type="checkbox"

                                                                checked={
                                                                    checked
                                                                }

                                                                onChange={
                                                                    (
                                                                        event
                                                                    ) =>

                                                                        handleToggleDeduction(

                                                                            item.key,

                                                                            event.target.checked

                                                                        )
                                                                }

                                                            />


                                                            <span>

                                                                {
                                                                    item.label
                                                                }

                                                            </span>

                                                        </label>

                                                    );

                                                }
                                            )
                                    }

                                </div>

                            )
                        }

                    </div>


                    {/* =================================================
                        CÁC Ô TRỪ GIỜ ĐÃ CHỌN
                    ================================================= */}

                    {
                        selectedDeduction.length
                        >
                        0
                        && (

                            <div className="worker-dynamic-grid">

                                {
                                    deductionOptions

                                        .filter(
                                            (
                                                item
                                            ) =>

                                                selectedDeduction
                                                    .includes(
                                                        item.key
                                                    )
                                        )

                                        .map(
                                            (
                                                item
                                            ) => (

                                                <div

                                                    key={
                                                        item.key
                                                    }

                                                    className="worker-field-block"

                                                >

                                                    <label

                                                        className="worker-field-label"

                                                        htmlFor={
                                                            item.key
                                                        }

                                                    >

                                                        {
                                                            item.label
                                                        }

                                                    </label>


                                                    <input

                                                        id={
                                                            item.key
                                                        }

                                                        className="worker-text-input"

                                                        name={
                                                            item.key
                                                        }

                                                        value={
                                                            deductions[
                                                                item.key
                                                            ]
                                                        }

                                                        onChange={
                                                            (
                                                                event
                                                            ) =>

                                                                updateDeductionValue(

                                                                    item.key,

                                                                    event.target.value

                                                                )
                                                        }

                                                        onBlur={() => normalizeDeductionValue(item.key)}

                                                        inputMode="numeric"

                                                        placeholder="Số phút, VD: 70"

                                                        autoComplete="off"

                                                    />

                                                </div>

                                            )
                                        )
                                }

                            </div>

                        )
                    }


                    {/* =================================================
                        LÝ DO DỪNG MÁY
                    ================================================= */}



                </section>
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


                {/* =================================================
                    BÁO CÁO CHẤT LƯỢNG
                ================================================= */}

                <section className="worker-form-card worker-quality-section">

                    <h2 className="worker-card-title">

                        <span>

                            ▣

                        </span>

                        Báo cáo Chất lượng

                    </h2>


                    {/* =================================================
                        TT OK / TT NG
                    ================================================= */}

                    <div className="worker-quality-summary">


                        {/* TT OK */}

                        <div className="worker-quality-card ok">

                            <label

                                htmlFor="ttOk"

                            >

                                TT OK

                            </label>


                            <input

                                id="ttOk"

                                name="ttOk"

                                value={
                                    formatIntegerDisplay(form.ttOk)
                                }

                                onChange={
                                    handleTtOkChange
                                }

                                onBlur={
                                    handleNumberBlur
                                }

                                inputMode="numeric"

                                placeholder=""

                                autoComplete="off"

                            />

                        </div>


                        {/* TT NG */}

                        <div className="worker-quality-card ng">

                            <label

                                htmlFor="ttNg"

                            >

                                TT NG

                            </label>


                            <input

                                id="ttNg"

                                name="ttNg"

                                value={
                                    formatIntegerDisplay(form.ttNg)
                                }

                                readOnly

                                placeholder=""

                            />

                        </div>

                    </div>


                    <div className="worker-grand-total" aria-live="polite">

                        <label htmlFor="totalOutput">

                            Tổng sản lượng (OK + NG)

                        </label>


                        <input

                            id="totalOutput"

                            value={
                                (
                                    Number(form.ttOk || 0)
                                    +
                                    Number(form.ttNg || 0)
                                ).toLocaleString("vi-VN")
                            }

                            readOnly

                            tabIndex={-1}

                        />

                    </div>


                    {/* =================================================
                        CHỌN LỖI NG
                    ================================================= */}

                    <div className="worker-dropdown-box">

                        <button

                            type="button"

                            className="worker-dropdown-title"

                            onClick={() =>
                                setShowNg(
                                    (
                                        prev
                                    ) => !prev
                                )
                            }

                        >

                            <span>

                                ⚠️ Chọn lỗi NG

                            </span>


                            <span>

                                {
                                    showNg

                                        ? "▲"

                                        : "▼"
                                }

                            </span>

                        </button>


                        {
                            showNg
                            && (

                                <div className="worker-dropdown-options">

                                    {
                                        activeNgOptions
                                            .map(
                                                (
                                                    item
                                                ) => {

                                                    const checked =
                                                        selectedNg
                                                            .includes(
                                                                item.key
                                                            );


                                                    return (

                                                        <label

                                                            key={
                                                                item.key
                                                            }

                                                            className="worker-dropdown-option"

                                                        >

                                                            <input

                                                                type="checkbox"

                                                                checked={
                                                                    checked
                                                                }

                                                                onChange={
                                                                    (
                                                                        event
                                                                    ) =>

                                                                        handleToggleNg(

                                                                            item.key,

                                                                            event.target.checked

                                                                        )
                                                                }

                                                            />


                                                            <span>

                                                                {
                                                                    item.label
                                                                }

                                                            </span>

                                                        </label>

                                                    );

                                                }
                                            )
                                    }

                                </div>

                            )
                        }

                    </div>


                    {/* =================================================
                        CÁC Ô LỖI NG ĐÃ CHỌN
                    ================================================= */}

                    {
                        selectedNg.length
                        >
                        0
                        && (

                            <div className="worker-dynamic-grid worker-ng-grid">

                                {
                                    activeNgOptions

                                        .filter(
                                            (
                                                item
                                            ) =>

                                                selectedNg
                                                    .includes(
                                                        item.key
                                                    )
                                        )

                                        .map(
                                            (
                                                item
                                            ) => (

                                                <div

                                                    key={
                                                        item.key
                                                    }

                                                    className="worker-field-block"

                                                >

                                                    <label

                                                        className="worker-field-label"

                                                        htmlFor={
                                                            item.key
                                                        }

                                                    >

                                                        {
                                                            item.label
                                                        }

                                                    </label>


                                                    <input

                                                        id={
                                                            item.key
                                                        }

                                                        className="worker-text-input"

                                                        name={
                                                            item.key
                                                        }

                                                        value={
                                                            form[
                                                                item.key
                                                            ]
                                                        }

                                                        onChange={
                                                            (
                                                                event
                                                            ) =>

                                                                handleNgValue(

                                                                    item.key,

                                                                    event.target.value

                                                                )
                                                        }

                                                        inputMode="numeric"

                                                        placeholder=""

                                                        autoComplete="off"

                                                    />

                                                </div>

                                            )
                                        )
                                }

                            </div>

                        )
                    }


                </section>

            </div>


            {duplicatePrompt && (
                <div className="duplicate-dialog-backdrop" role="presentation">
                    <div className="duplicate-dialog" role="dialog" aria-modal="true" aria-labelledby="duplicate-dialog-title">
                        <h2 id="duplicate-dialog-title">Phát hiện báo cáo tương tự</h2>
                        <p>
                            Đã tồn tại báo cáo cùng nhân viên, ngày, ca, máy và sản phẩm.
                            Bạn muốn chỉnh sửa báo cáo cũ hay vẫn tạo báo cáo mới?
                        </p>
                        <div className="duplicate-dialog-actions">
                            <button type="button" className="duplicate-dialog-cancel" onClick={() => { setDuplicatePrompt(null); submitLockRef.current = false; }}>Hủy</button>
                            <button type="button" className="duplicate-dialog-edit" onClick={handleUpdateExistingReport} disabled={submitting}>Chỉnh sửa báo cáo cũ</button>
                            <button type="button" className="duplicate-dialog-create" onClick={handleCreateDuplicateAnyway} disabled={submitting}>Vẫn tạo báo cáo mới</button>
                        </div>
                    </div>
                </div>
            )}

            {/* =================================================
                NÚT THAO TÁC
            ================================================= */}

            <div className="worker-action-group">

                <button

                    type="button"

                    className="worker-reset-button"

                    onClick={
                        handleReset
                    }

                    disabled={
                        submitting
                    }

                >

                    Làm mới

                </button>


                <button

                    type="button"

                    className="worker-floating-save"

                    onClick={
                        handleSubmit
                    }

                    disabled={
                        loadingWorker
                        ||
                        submitting
                    }

                >

                    {
                        submitting

                            ? "Đang lưu..."

                            : "Lưu"
                    }

                </button>

            </div>

        </main>

    );

}


export default ProcessPage;