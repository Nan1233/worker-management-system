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
    createTempReport
} from "../../services/productionService";

import {
    getWorkerByUserId
} from "../../services/workerService";


import type {
    User
} from "../../types/auth";

import type {
    WorkerProfile
} from "../../types/worker";
import {
    getMachinesByProcess,
    getProductStandardsByProcess
} from "../../services/masterDataService";

import type {
    MachineOption,
    ProductStandardOption
} from "../../services/masterDataService";

import AutocompleteInput from "../../components/common/AutocompleteInput";
import { useToast } from "../../components/feedback/ToastProvider";
import { getApiError } from "../../utils/apiError";

import type {
    AutocompleteOption
} from "../../components/common/AutocompleteInput";
// =====================================================
// KIỂU DỮ LIỆU FORM
// =====================================================

type FormState = {

    workDate: string;

    shift: string;

    workerCode: string;

    workerName: string;

    trainingPercent: string;

    machineNo: string;


    totalTime: string;

    actualTime: string;

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

type NgKey =
    | "kqdDapLai"
    | "kqdTuot"
    | "voDoLong"
    | "xuocDoLong"
    | "congGay"
    | "xoay"
    | "khongDut"
    | "baviaHut"
    | "ppcm"
    | "loiCaoSu"
    | "ngKichThuoc"
    | "catLem";


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

const ngOptions: Array<{

    key: NgKey;

    label: string;

}> = [

    {

        key:
            "kqdDapLai",

        label:
            "KQD dập lại"

    },

    {

        key:
            "kqdTuot",

        label:
            "KQD tuột"

    },

    {

        key:
            "voDoLong",

        label:
            "Vỡ do lồng"

    },

    {

        key:
            "xuocDoLong",

        label:
            "Xước do lồng"

    },

    {

        key:
            "congGay",

        label:
            "Cong gãy"

    },

    {

        key:
            "xoay",

        label:
            "Xoay"

    },

    {

        key:
            "khongDut",

        label:
            "Không đứt"

    },

    {

        key:
            "baviaHut",

        label:
            "Bavia hụt"

    },

    {

        key:
            "ppcm",

        label:
            "PPCM"

    },

    {

        key:
            "loiCaoSu",

        label:
            "Lỗi cao su"

    },

    {

        key:
            "ngKichThuoc",

        label:
            "NG kích thước"

    },

    {

        key:
            "catLem",

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
// HIỂN THỊ NGÀY DD/MM/YYYY
// =====================================================

const formatDisplayDate = (
    value: string
): string => {

    if (!value) {

        return "";

    }


    const [
        year,
        month,
        day
    ] = value.split("-");


    return `${day}/${month}/${year}`;

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

    const decimalHours =
        Math.max(
            0,
            Number(
                value || 0
            )
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


// =====================================================
// COMPONENT
// =====================================================

function ProcessPage() {

    const { showToast } = useToast();
    const submitLockRef = useRef(false);
    const clientRequestIdRef = useRef<string | null>(null);

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
                        machine.machine_name,

                    description:
                        `Mã máy: ${machine.machine_code}`

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
                        product.work_type
                        ===
                        "cat"

                            ? "Cắt"

                            : "Lồng",

                    description:
                        `Định mức: ${product.standard_output}`

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


                    const user: User =
                        JSON.parse(
                            savedUser
                        );


                    const userId =
                        Number(
                            user.id
                        );


                    if (
                        !Number.isInteger(
                            userId
                        )
                        ||
                        userId <= 0
                    ) {

                        throw new Error(
                            "Không tìm thấy ID tài khoản đăng nhập"
                        );

                    }


                    const workerData =
                        await getWorkerByUserId(
                            userId
                        );


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


                    alert(
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

    }, [navigate]);
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
                Khi thay đổi TT OK hoặc TT NG,
                tự động tính tổng sản phẩm thực tế.
            */

            if (
                name === "ttOk"
                ||
                name === "ttNg"
            ) {

                next.actualOutput =
                    String(

                        Number(
                            next.ttOk
                            ||
                            0
                        )

                        +

                        Number(
                            next.ttNg
                            ||
                            0
                        )

                    );

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


                const [
                    machines,
                    products
                ] =
                    await Promise.all([

                        getMachinesByProcess(
                            processInfo.id
                        ),

                        getProductStandardsByProcess(
                            processInfo.id
                        )

                    ]);


                setMachineOptions(
                    machines
                );


                setProductOptions(
                    products
                );

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


                alert(
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

}, [processInfo.id]);

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

const normalizeDecimalInput = (
    value: string
): string => {

    return value.replace(
        ",",
        "."
    );

};


const isValidDecimalInput = (
    value: string
): boolean => {

    const normalizedValue =
        normalizeDecimalInput(
            value
        );


    return (
        normalizedValue === ""
        ||
        /^\d*\.?\d*$/.test(
            normalizedValue
        )
    );

};
    // =====================================================
    // INPUT SỐ THỜI GIAN
    // =====================================================

const handleTimeInputChange = (
    event:
        React.ChangeEvent<HTMLInputElement>
) => {

    const {
        name,
        value
    } = event.target;


    const normalizedValue =
        normalizeDecimalInput(
            value
        );


    if (
        !isValidDecimalInput(
            normalizedValue
        )
    ) {

        return;

    }


    setForm((prev) => {

        const next = {

            ...prev,

            [name]:
                normalizedValue

        } as FormState;


        if (
            name ===
            "totalTime"
        ) {

            next.actualTime =
                String(
                    Math.max(
                        0,

                        Number(
                            normalizedValue
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
    // INPUT SẢN LƯỢNG / ĐỊNH MỨC
    // =====================================================

   
    // =====================================================
    // TÍNH TỔNG THỜI GIAN TRỪ
    // =====================================================

    const updateTotalDeduction = (
        data: DeductionState
    ) => {

        const total =
            Object.values(
                data
            )
                .reduce(

                    (
                        sum,
                        currentValue
                    ) =>

                        sum
                        +
                        Number(
                            currentValue
                            ||
                            0
                        ),

                    0

                );


        setForm((prev) => ({

            ...prev,

            deductionTime:
                String(
                    total
                ),

            actualTime:
                String(

                    Math.max(

                        0,

                        Number(
                            prev.totalTime
                            ||
                            0
                        )

                        -

                        total

                    )

                )

        }));

    };


    // =====================================================
    // CẬP NHẬT GIÁ TRỊ MỘT LOẠI TRỪ GIỜ
    // =====================================================

const updateDeductionValue = (
    key: DeductionKey,
    value: string
) => {

    const normalizedValue =
        normalizeDecimalInput(
            value
        );


    if (
        !isValidDecimalInput(
            normalizedValue
        )
    ) {

        return;

    }


    setDeductions((prev) => {

        const next = {

            ...prev,

            [key]:
                normalizedValue

        };


        updateTotalDeduction(
            next
        );


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
                        "1"

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
    // NHẬP 0 RỒI RỜI Ô:
    // BỎ CHỌN LOẠI TRỪ GIỜ
    // =====================================================

    const removeDeductionIfZero = (
        key: DeductionKey
    ) => {

        if (
            deductions[key] === ""
            ||
            Number(
                deductions[key]
            ) !== 0
        ) {

            return;

        }


        handleToggleDeduction(
            key,
            false
        );

    };


    // =====================================================
    // ENTER TẠI Ô TRỪ GIỜ
    // =====================================================

    const handleDeductionKeyDown = (

        event:
            React.KeyboardEvent<
                HTMLInputElement
            >,

        key: DeductionKey

    ) => {

        if (
            event.key !==
            "Enter"
        ) {

            return;

        }


        event.preventDefault();


        removeDeductionIfZero(
            key
        );

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
                ngOptions.reduce(

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


            next.actualOutput =
                String(

                    Number(
                        next.ttOk
                        ||
                        0
                    )

                    +

                    totalNg

                );


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
                        "1"

                };


                const totalNg =
                    ngOptions.reduce(

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


                next.actualOutput =
                    String(

                        Number(
                            next.ttOk
                            ||
                            0
                        )

                        +

                        totalNg

                    );


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
                ngOptions.reduce(

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


            next.actualOutput =
                String(

                    Number(
                        next.ttOk
                        ||
                        0
                    )

                    +

                    totalNg

                );


            return next;

        });

    };


    // =====================================================
    // NHẬP 0 RỒI RỜI Ô:
    // BỎ CHỌN LỖI NG
    // =====================================================

    const removeNgIfZero = (
        key: NgKey
    ) => {

        if (
            form[key] === ""
            ||
            Number(
                form[key]
            ) !== 0
        ) {

            return;

        }


        handleToggleNg(
            key,
            false
        );

    };


    // =====================================================
    // ENTER TẠI Ô LỖI NG
    // =====================================================

    const handleNgKeyDown = (

        event:
            React.KeyboardEvent<
                HTMLInputElement
            >,

        key: NgKey

    ) => {

        if (
            event.key !==
            "Enter"
        ) {

            return;

        }


        event.preventDefault();


        removeNgIfZero(
            key
        );

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
            event.target.value;


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

            actualOutput:
                String(

                    Number(
                        value
                        ||
                        0
                    )

                    +

                    Number(
                        prev.ttNg
                        ||
                        0
                    )

                )

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


        if (
            !form.shift
        ) {

            return "Vui lòng chọn ca làm việc";

        }


        if (
            !form.productName.trim()
        ) {

            return "Vui lòng nhập sản phẩm";

        }

        if (
            !form.machineNo.trim()
        ) {

            return "Vui lòng nhập số máy";

        }


        if (
            Number(
                form.totalTime
                ||
                0
            ) <= 0
        ) {

            return "Tổng thời gian phải lớn hơn 0";

        }


        if (
            Number(
                form.deductionTime
                ||
                0
            )
            >
            Number(
                form.totalTime
                ||
                0
            )
        ) {

            return "Thời gian trừ không được lớn hơn tổng thời gian";

        }


        if (
            Number(
                form.actualTime
                ||
                0
            )
            <
            0
        ) {

            return "Thời gian thực tế không hợp lệ";

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
            ngOptions.reduce(

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


        if (
            Number(
                form.actualOutput
                ||
                0
            )
            !==
            (
                Number(
                    form.ttOk
                    ||
                    0
                )
                +
                Number(
                    form.ttNg
                    ||
                    0
                )
            )
        ) {

            return "Thực tế phải bằng TT OK cộng TT NG";

        }



        return "";

    };


    // =====================================================
    // GỬI BÁO CÁO
    // =====================================================

    const handleSubmit =
        async () => {

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

                const response = await createTempReport({
                    client_request_id: clientRequestIdRef.current,

                    process_id:
                        processInfo.id,

                    work_date:
                        form.workDate,

                    shift:
                        form.shift,

                    machine_no:
                        form.machineNo.trim(),


                    total_time:
                        Number(
                            form.totalTime
                            ||
                            0
                        ),

                    actual_time:
                        Number(
                            form.actualTime
                            ||
                            0
                        ),

                    deduction_time:
                        Number(
                            form.deductionTime
                            ||
                            0
                        ),


                
                    product_name:
                        form.productName.trim(),

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
                        ngOptions

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

                                    Number(
                                        deductions[item.key]
                                        ||
                                        0
                                    )
                                    >
                                    0
                            )

                            .map(
                                (item) => ({

                                    deduction_name:
                                        item.label,

                                    hours:
                                        Number(
                                            deductions[item.key]
                                            ||
                                            0
                                        )

                                })
                            ),


                    note:
                        form.note.trim()

                });


                showToast(
                    response?.duplicate
                        ? "Báo cáo này đã được hệ thống ghi nhận trước đó"
                        : "Lưu báo cáo thành công",
                    response?.duplicate ? "info" : "success"
                );
                clientRequestIdRef.current = null;


                navigate(
                    "/worker",
                    {
                        replace:
                            true
                    }
                );

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


                    <div className="worker-form-identity">

    <span>

        <strong>
            {form.workerName || "Đang tải..."}
        </strong>

        {" - "}

        {form.workerCode || ""}

    </span>

    <span className="worker-training-percent">

        Học việc:

        {" "}

        {form.trainingPercent || 0}%

    </span>

</div>


                    <label className="worker-date-picker">

                        <span>

                            {
                                formatDisplayDate(
                                    form.workDate
                                )
                            }

                        </span>


                        <span>

                            ▼

                        </span>


                        <input

                            type="date"

                            name="workDate"

                            value={
                                form.workDate
                            }

                            onChange={
                                handleChange
                            }

                        />

                    </label>

                </header>


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
                            selectedProduct.standard_output
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
                            selectedProduct.standard_output
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
        label="Số máy (Tên máy)"
        value={form.machineNo}
        options={machineAutocompleteOptions}
        placeholder="Nhập mã hoặc tên máy"
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


                        {/* TỔNG THỜI GIAN */}

                        <div className="worker-time-item">

                            <label

                                htmlFor="totalTime"

                            >

                                Tổng thời gian

                            </label>


                            <input

                                id="totalTime"

                                name="totalTime"

                                value={
                                    form.totalTime
                                }

                                onChange={
                                    handleTimeInputChange
                                }

                                onBlur={
                                    handleNumberBlur
                                }

                                inputMode="decimal"

                                placeholder="0"

                                autoComplete="off"

                            />


                            <small>

                                {
                                    decimalHoursToText(
                                        form.totalTime
                                    )
                                }

                            </small>

                        </div>





                        {/* THỜI GIAN TRỪ */}

                        <div className="worker-time-item">

                            <label

                                htmlFor="deductionTime"

                            >

                                Thời gian trừ

                            </label>


                            <input

                                id="deductionTime"

                                name="deductionTime"

                                value={
                                    form.deductionTime
                                }

                                readOnly

                                placeholder="0"

                            />


                            <small>

                                {
                                    decimalHoursToText(
                                        form.deductionTime
                                    )
                                }

                            </small>

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

                                                        onBlur={() =>
                                                            removeDeductionIfZero(
                                                                item.key
                                                            )
                                                        }

                                                        onKeyDown={
                                                            (
                                                                event
                                                            ) =>

                                                                handleDeductionKeyDown(

                                                                    event,

                                                                    item.key

                                                                )
                                                        }

                                                        inputMode="decimal"

                                                        placeholder="0"

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
                                    form.ttOk
                                }

                                onChange={
                                    handleTtOkChange
                                }

                                onBlur={
                                    handleNumberBlur
                                }

                                inputMode="numeric"

                                placeholder="0"

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
                                    form.ttNg
                                }

                                readOnly

                                placeholder="0"

                            />

                        </div>

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
                                        ngOptions
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
                                    ngOptions

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

                                                        onBlur={() =>
                                                            removeNgIfZero(
                                                                item.key
                                                            )
                                                        }

                                                        onKeyDown={
                                                            (
                                                                event
                                                            ) =>

                                                                handleNgKeyDown(

                                                                    event,

                                                                    item.key

                                                                )
                                                        }

                                                        inputMode="numeric"

                                                        placeholder="0"

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
                        GHI CHÚ
                    ================================================= */}

                    <div className="worker-field-block worker-note-block">

                        <label

                            className="worker-field-label"

                            htmlFor="note"

                        >

                            Ghi chú

                        </label>


                        <textarea

                            id="note"

                            className="worker-note-input"

                            name="note"

                            value={
                                form.note
                            }

                            onChange={
                                handleChange
                            }

                            placeholder="Nhập ghi chú nếu có"

                        />

                    </div>

                </section>

            </div>


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