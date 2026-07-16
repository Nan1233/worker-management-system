import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";

import "./ProcessPage.css";

import { createTempReport } from "../../services/productionService";
import { getWorkerByUserId } from "../../services/workerService";

import FormSection from "../../components/process/FormSection";
import InputField from "../../components/process/InputField";
import NumberField from "../../components/process/NumberField";
import SelectField from "../../components/process/SelectField";
import TextAreaField from "../../components/process/TextAreaField";

import type { User } from "../../types/auth";


type FormState = {

    workDate: string;

    shift: string;

    workerCode: string;

    workerName: string;

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


type DeductionState = {

    vsk: string;

    fiveS: string;

    hamKhuon: string;

    suaKhuon: string;

    suaMay: string;

    dungMay: string;

};


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


type DeductionKey =
    keyof DeductionState;

const getCurrentLocalDate = (): string => {

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

const initialForm: FormState = {

    workDate:
        getCurrentLocalDate(),

    shift:
        "Ca 1",

    workerCode:
        "",

    workerName:
        "",

    machineNo: "",

    totalTime: "",

    actualTime: "",

    deductionTime: "",

    productName: "",

    standardOutput: "",

    actualOutput: "",

    ttOk: "",

    ttNg: "",

    kqdDapLai: "",

    kqdTuot: "",

    voDoLong: "",

    xuocDoLong: "",

    congGay: "",

    xoay: "",

    khongDut: "",

    baviaHut: "",

    ppcm: "",

    loiCaoSu: "",

    ngKichThuoc: "",

    catLem: "",

    note: ""

};


const initialDeduction: DeductionState = {

    vsk: "",

    fiveS: "",

    hamKhuon: "",

    suaKhuon: "",

    suaMay: "",

    dungMay: ""

};


const deductionOptions: Array<{

    key: DeductionKey;

    label: string;

}> = [

    {
        key: "vsk",
        label: "Số giờ VSK"
    },

    {
        key: "fiveS",
        label: "Số giờ 5S + gia ca"
    },

    {
        key: "hamKhuon",
        label: "Số giờ hâm khuôn"
    },

    {
        key: "suaKhuon",
        label: "Số giờ sửa khuôn"
    },

    {
        key: "suaMay",
        label: "Số giờ sửa máy"
    },

    {
        key: "dungMay",
        label: "Số giờ dừng máy"
    }

];


const ngOptions: Array<{

    key: NgKey;

    label: string;

}> = [

    {
        key: "kqdDapLai",
        label: "KQD dập lại"
    },

    {
        key: "kqdTuot",
        label: "KQD tuột"
    },

    {
        key: "voDoLong",
        label: "Vỡ do lồng"
    },

    {
        key: "xuocDoLong",
        label: "Xước do lồng"
    },

    {
        key: "congGay",
        label: "Cong gãy"
    },

    {
        key: "xoay",
        label: "Xoay"
    },

    {
        key: "khongDut",
        label: "Không đứt"
    },

    {
        key: "baviaHut",
        label: "Bavia hụt"
    },

    {
        key: "ppcm",
        label: "PPCM"
    },

    {
        key: "loiCaoSu",
        label: "Lỗi cao su"
    },

    {
        key: "ngKichThuoc",
        label: "NG kích thước"
    },

    {
        key: "catLem",
        label: "Cắt lẹm"
    }

];


/*
    ID phải khớp với bảng processes trong database.
*/

const processMap: Record<

    string,

    {
        id: number;
        title: string;
    }

> = {

    "gia-cong": {
        id: 1,
        title: "BÁO CÁO GIA CÔNG"
    },

    "mai": {
        id: 2,
        title: "BÁO CÁO MÀI"
    },

    "kiem-1": {
        id: 3,
        title: "BÁO CÁO KIỂM 1"
    },

    "kiem-2": {
        id: 4,
        title: "BÁO CÁO KIỂM 2"
    },

    "ep": {
        id: 5,
        title: "BÁO CÁO ÉP"
    },

    "can": {
        id: 6,
        title: "BÁO CÁO CÁN"
    },

    "bavia": {
        id: 7,
        title: "BÁO CÁO BAVIA"
    }

};


function ProcessPage() {

    const navigate =
        useNavigate();


    const {
        process = "gia-cong"
    } = useParams();


    const processInfo =
        useMemo(
            () =>
                processMap[process]
                ??
                processMap["gia-cong"],
            [process]
        );


    const [
        showDeduction,
        setShowDeduction
    ] = useState(false);


    const [
        showNg,
        setShowNg
    ] = useState(false);


    const [
        form,
        setForm
    ] = useState<FormState>(
        initialForm
    );


    const [
        deductions,
        setDeductions
    ] = useState<DeductionState>(
        initialDeduction
    );


    const [
        selectedDeduction,
        setSelectedDeduction
    ] = useState<string[]>([]);


    const [
        selectedNg,
        setSelectedNg
    ] = useState<string[]>([]);


    const [
        stopReason,
        setStopReason
    ] = useState("");


    const [
        loadingWorker,
        setLoadingWorker
    ] = useState(true);


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

                setLoadingWorker(true);


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
                    JSON.parse(savedUser);


                const userId =
                    Number(user.id);


                if (
                    !Number.isInteger(userId)
                    ||
                    userId <= 0
                ) {

                    throw new Error(
                        "Không tìm thấy ID tài khoản đăng nhập"
                    );

                }


                const worker =
                    await getWorkerByUserId(
                        userId
                    );


                setForm((prev) => ({

                    ...prev,

                    workerCode:
                        worker.worker_code
                        ||
                        "",

                    workerName:
                        worker.full_name
                        ||
                        ""

                }));

            }
            catch (error: unknown) {

                console.error(
                    "Không lấy được thông tin nhân viên:",
                    error
                );


                if (
                    axios.isAxiosError(error)
                    &&
                    error.response?.status === 401
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

                    axios.isAxiosError(error)

                        ? error.response?.data?.message
                            ||
                            "Không lấy được thông tin nhân viên"

                        : error instanceof Error

                            ? error.message

                            : "Không lấy được thông tin nhân viên";


                alert(message);

            }
            finally {

                setLoadingWorker(false);

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

                [name]: value

            } as FormState;


            if (
                name === "ttOk"
                ||
                name === "ttNg"
            ) {

                next.actualOutput =
                    String(

                        Number(
                            next.ttOk || 0
                        )

                        +

                        Number(
                            next.ttNg || 0
                        )

                    );

            }


            /*
                Khi thay tổng thời gian,
                tự tính thời gian thực tế.
            */

            if (name === "totalTime") {

                next.actualTime =
                    String(

                        Math.max(

                            0,

                            Number(value || 0)

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
    // TÍNH THỜI GIAN TRỪ
    // =====================================================

    const updateTotalDeduction = (

        data: DeductionState

    ) => {

        const total =
            Object.values(data)
                .reduce(

                    (
                        sum,
                        value
                    ) =>

                        sum
                        +
                        Number(
                            value || 0
                        ),

                    0

                );


        setForm((prev) => ({

            ...prev,

            deductionTime:
                String(total),

            actualTime:
                String(

                    Math.max(

                        0,

                        Number(
                            prev.totalTime || 0
                        )

                        -

                        total

                    )

                )

        }));

    };




    const updateDeductionValue = (
    key: DeductionKey,
    value: string
) => {

    /*
        Cho phép:
        ""
        "0"
        "1"
        "0.5"
        "1.25"

        Không cho phép chữ hoặc nhiều dấu chấm.
    */
    if (
        value !== ""
        &&
        !/^\d*\.?\d*$/.test(value)
    ) {
        return;
    }


    setDeductions((prev) => {

        const next = {
            ...prev,
            [key]: value
        };

        updateTotalDeduction(next);

        return next;

    });

};

const removeDeductionIfZero = (
    key: DeductionKey
) => {

    if (
        Number(deductions[key]) !== 0
        ||
        deductions[key] === ""
    ) {
        return;
    }


    const nextSelected =
        selectedDeduction.filter(
            (selectedKey) =>
                selectedKey !== key
        );


    const nextDeductions = {
        ...deductions,
        [key]: ""
    };


    setSelectedDeduction(
        nextSelected
    );

    setDeductions(
        nextDeductions
    );

    updateTotalDeduction(
        nextDeductions
    );


    if (key === "dungMay") {
        setStopReason("");
    }

};
const handleDeductionKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    key: DeductionKey
) => {

    if (event.key !== "Enter") {
        return;
    }


    event.preventDefault();

    removeDeductionIfZero(key);

};
    // =====================================================
    // LỖI NG
    // =====================================================



    const handleNgValue = (
    key: NgKey,
    value: string
) => {

    /*
        NG chỉ cho phép số nguyên.
        Cho phép rỗng để người dùng nhập lại.
    */
    if (
        value !== ""
        &&
        !/^\d*$/.test(value)
    ) {
        return;
    }


    setForm((prev) => {

        const next = {
            ...prev,
            [key]: value
        };


        next.ttNg =
            String(
                ngOptions.reduce(
                    (sum, item) =>
                        sum
                        +
                        Number(
                            next[item.key] || 0
                        ),
                    0
                )
            );


        next.actualOutput =
            String(
                Number(next.ttOk || 0)
                +
                Number(next.ttNg || 0)
            );


        return next;

    });

};

const removeNgIfZero = (
    key: NgKey
) => {

    if (
        Number(form[key]) !== 0
        ||
        form[key] === ""
    ) {
        return;
    }


    const nextSelected =
        selectedNg.filter(
            (selectedKey) =>
                selectedKey !== key
        );


    setSelectedNg(
        nextSelected
    );


    setForm((prev) => {

        const next = {
            ...prev,
            [key]: ""
        };


        next.ttNg =
            String(
                ngOptions.reduce(
                    (sum, item) =>
                        sum
                        +
                        Number(
                            next[item.key] || 0
                        ),
                    0
                )
            );


        next.actualOutput =
            String(
                Number(next.ttOk || 0)
                +
                Number(next.ttNg || 0)
            );


        return next;

    });

};
const handleNgKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    key: NgKey
) => {

    if (event.key !== "Enter") {
        return;
    }


    event.preventDefault();

    removeNgIfZero(key);

};
    // =====================================================
    // KIỂM TRA FORM
    // =====================================================

    const validateForm = () => {

    if (loadingWorker) {

        return "Thông tin nhân viên đang được tải";

    }


    if (
        !form.workerName
        ||
        !form.workerCode
    ) {

        return "Không tìm thấy thông tin nhân viên";

    }


    if (!form.workDate) {

        return "Vui lòng chọn ngày làm việc";

    }


        if (!form.machineNo.trim()) {

            return "Vui lòng nhập số máy";

        }


        if (!form.productName.trim()) {

            return "Vui lòng nhập tên sản phẩm";

        }


        if (
            Number(
                form.totalTime || 0
            ) <= 0
        ) {

            return "Tổng thời gian phải lớn hơn 0";

        }


        if (

            Number(
                form.actualTime || 0
            )

            +

            Number(
                form.deductionTime || 0
            )

            >

            Number(
                form.totalTime || 0
            )

        ) {

            return "Thời gian thực tế và thời gian trừ không hợp lệ";

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


            if (validationMessage) {

                alert(
                    validationMessage
                );

                return;

            }


            try {

                setSubmitting(true);


                /*
                    Không gửi worker_id.

                    Backend lấy worker_id từ token:
                    req.user.worker_id
                */

                await createTempReport({

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
                            form.totalTime || 0
                        ),

                    actual_time:
                        Number(
                            form.actualTime || 0
                        ),

                    deduction_time:
                        Number(
                            form.deductionTime || 0
                        ),

                    stop_reason:
                        stopReason,

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
                            form.ttOk || 0
                        ),

                    tt_ng:
                        Number(
                            form.ttNg || 0
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
                            form.xoay || 0
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
                            form.ppcm || 0
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
                            form.catLem || 0
                        ),


                    defects:
                        ngOptions

                            .filter(
                                ({
                                    key
                                }) =>

                                    Number(
                                        form[key]
                                        ||
                                        0
                                    ) > 0
                            )

                            .map(
                                ({
                                    key,
                                    label
                                }) => ({

                                    defect_name:
                                        label,

                                    quantity:
                                        Number(
                                            form[key]
                                            ||
                                            0
                                        )

                                })
                            ),


                    deductions:
                        deductionOptions

                            .filter(
                                ({
                                    key
                                }) =>

                                    Number(
                                        deductions[key]
                                        ||
                                        0
                                    ) > 0
                            )

                            .map(
                                ({
                                    key,
                                    label
                                }) => ({

                                    deduction_name:
                                        label,

                                    hours:
                                        Number(
                                            deductions[key]
                                            ||
                                            0
                                        )

                                })
                            ),


                    note:
                        form.note.trim()

                });


                alert(
                    "Lưu báo cáo thành công"
                );


                navigate(
                    "/worker",
                    {
                        replace: true
                    }
                );

            }
            catch (error: unknown) {

                console.error(
                    "Lưu báo cáo thất bại:",
                    error
                );


                alert(

                    axios.isAxiosError(error)

                        ? error.response?.data?.message
                            ||
                            "Lưu báo cáo thất bại"

                        : "Lưu báo cáo thất bại"

                );

            }
            finally {

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
            prev.workerName

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


    setStopReason("");


    setShowDeduction(
        false
    );


    setShowNg(
        false
    );

};


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


        if (value === "0") {

            setForm((prev) => ({

                ...prev,

                [name]: ""

            }));

        }

    };


    return (

        <div className="container">

            <h1>
                {processInfo.title}
            </h1>


            <FormSection title="Thông tin chung">

                <InputField

    type="date"

    label="Ngày làm việc"

    name="workDate"

    value={form.workDate}

    onChange={handleChange}

/>


                <div className="shift-group">

                    <label className="shift-label">

                        Ca làm việc

                    </label>


                    <div className="radio-list">

                        {
                            [
                                "Ca A",
                                "Ca B",
                                "Ca C",
                                "Ca D"
                            ]
                                .map(
                                    (
                                        shift
                                    ) => (

                                        <label

                                            key={shift}

                                            className="radio-item"

                                        >

                                            <input

                                                type="radio"

                                                name="shift"

                                                value={shift}

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
                                                {shift}
                                            </span>

                                        </label>

                                    )
                                )
                        }

                    </div>

                </div>

{/* <InputField

    label="Tên nhân viên"

    name="workerName"

    value={
        loadingWorker
            ? "Đang tải..."
            : form.workerName
    }

    readOnly

/> */}
                <InputField

    label="Mã nhân viên"

    name="workerCode"

    value={
        loadingWorker
            ? "Đang tải..."
            : form.workerCode
    }

    readOnly

/>


                <InputField

                    label="Số máy"

                    name="machineNo"

                    value={form.machineNo}

                    onChange={handleChange}

                />

            </FormSection>


            <FormSection title="Thời gian">

                <NumberField

                    label="Tổng thời gian"

                    name="totalTime"

                    value={form.totalTime}

                    allowDecimal

                    onChange={handleChange}

                    onBlur={handleNumberBlur}

                />


                <NumberField

                    label="Thời gian thực tế"

                    name="actualTime"

                    value={form.actualTime}

                    allowDecimal

                    onChange={handleChange}

                    onBlur={handleNumberBlur}

                />


                <NumberField

                    label="Thời gian trừ"

                    name="deductionTime"

                    value={form.deductionTime}

                    allowDecimal

                    onChange={handleChange}

                    onBlur={handleNumberBlur}

                />


                <div className="select-box">

    <button
        type="button"
        className="select-title"
        onClick={() =>
            setShowDeduction(
                (prev) => !prev
            )
        }
    >

        <span>
            ⏱ Chọn loại trừ thời gian
        </span>

        <span>
            {showDeduction ? "▲" : "▼"}
        </span>

    </button>


    {showDeduction && (

        <div className="select-options">

            {deductionOptions.map((item) => {

                const checked =
                    selectedDeduction.includes(
                        item.key
                    );

                return (

                    <label
                        key={item.key}
                        className="select-option-item"
                    >

                        <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {

                                const isChecked =
                                    event.target.checked;

                                const nextSelected =
                                    isChecked
                                        ? [
                                            ...selectedDeduction,
                                            item.key
                                        ]
                                        : selectedDeduction.filter(
                                            (key) =>
                                                key !== item.key
                                        );

                                setSelectedDeduction(
                                    nextSelected
                                );

                                const next = {
                                    ...deductions
                                };

                                next[item.key] =
                                    isChecked
                                        ? "1"
                                        : "";

                                setDeductions(next);

                                updateTotalDeduction(
                                    next
                                );

                            }}
                        />

                        <span>
                            {item.label}
                        </span>

                    </label>

                );

            })}

        </div>

    )}

</div>


                <div className="quality-grid">

                    {
                        deductionOptions
    .filter(({ key }) =>
        selectedDeduction.includes(key)
    )

                            .map(
                                (
                                    item
                                ) => (

                                    <NumberField
    key={item.key}
    label={item.label}
    name={item.key}
    value={deductions[item.key]}
    allowDecimal
    onChange={(event) =>
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
    onKeyDown={(event) =>
        handleDeductionKeyDown(
            event,
            item.key
        )
    }
/>

                                )
                            )
                    }

                </div>


                {
    selectedDeduction.includes("dungMay")
    && (

                        <SelectField

                            label="Lý do dừng máy"

                            name="stopReason"

                            value={stopReason}

                            onChange={(
                                event
                            ) =>

                                setStopReason(
                                    event.target.value
                                )

                            }

                            options={[

                                "Hỏng máy",

                                "Thiếu nguyên liệu",

                                "Chờ kỹ thuật",

                                "Khác"

                            ]}

                        />

                    )
                }

            </FormSection>


            <FormSection title="Sản xuất">

                <InputField

                    label="Sản phẩm"

                    name="productName"

                    value={
                        form.productName
                    }

                    onChange={
                        handleChange
                    }

                />


                <NumberField

                    label="Định mức"

                    name="standardOutput"

                    value={
                        form.standardOutput
                    }

                    onChange={
                        handleChange
                    }

                />


                <NumberField

                    label="Thực tế"

                    name="actualOutput"

                    value={
                        form.actualOutput
                    }

                    onChange={
                        handleChange
                    }

                />

            </FormSection>


            <FormSection title="Báo cáo chất lượng">

                <NumberField

                    label="TT OK"

                    name="ttOk"

                    value={form.ttOk}

                    onChange={
                        handleChange
                    }

                    onBlur={
                        handleNumberBlur
                    }

                />


                <div className="select-box">

    <button
        type="button"
        className="select-title"
        onClick={() =>
            setShowNg(
                (prev) => !prev
            )
        }
    >

        <span>
            ⚠️ Chọn lỗi NG
        </span>

        <span>
            {showNg ? "▲" : "▼"}
        </span>

    </button>


    {showNg && (

        <div className="select-options">

            {ngOptions.map((item) => {

                const checked =
                    selectedNg.includes(
                        item.key
                    );

                return (

                    <label
                        key={item.key}
                        className="select-option-item"
                    >

                        <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {

                                const isChecked =
                                    event.target.checked;

                                const nextSelected =
                                    isChecked
                                        ? [
                                            ...selectedNg,
                                            item.key
                                        ]
                                        : selectedNg.filter(
                                            (key) =>
                                                key !== item.key
                                        );

                                setSelectedNg(
                                    nextSelected
                                );

                                setForm((prev) => {

                                    const next = {
                                        ...prev,
                                        [item.key]:
                                            isChecked
                                                ? "1"
                                                : ""
                                    };

                                    next.ttNg =
                                        String(
                                            ngOptions.reduce(
                                                (
                                                    sum,
                                                    ngItem
                                                ) =>
                                                    sum +
                                                    Number(
                                                        next[
                                                            ngItem.key
                                                        ] || 0
                                                    ),
                                                0
                                            )
                                        );

                                    next.actualOutput =
                                        String(
                                            Number(
                                                next.ttOk || 0
                                            ) +
                                            Number(
                                                next.ttNg || 0
                                            )
                                        );

                                    return next;

                                });

                            }}
                        />

                        <span>
                            {item.label}
                        </span>

                    </label>

                );

            })}

        </div>

    )}

</div>


                <div className="quality-grid">

                    {
                        ngOptions
    .filter(({ key }) =>
        selectedNg.includes(key)
    )

                            .map(
                                (
                                    item
                                ) => (

                                    <NumberField
    key={item.key}
    label={item.label}
    name={item.key}
    value={form[item.key]}
    onChange={(event) =>
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
    onKeyDown={(event) =>
        handleNgKeyDown(
            event,
            item.key
        )
    }
/>

                                )
                            )
                    }

                </div>


                <TextAreaField

                    label="Ghi chú"

                    name="note"

                    value={form.note}

                    onChange={
                        handleChange
                    }

                />

            </FormSection>


            <div className="button-group">

                <button

                    type="button"

                    className="save-btn"

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
                            : "Lưu báo cáo"
                    }

                </button>


                <button

                    type="button"

                    className="reset-btn"

                    onClick={
                        handleReset
                    }

                    disabled={
                        submitting
                    }

                >

                    Làm mới

                </button>

            </div>

        </div>

    );

}


export default ProcessPage;