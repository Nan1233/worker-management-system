import {
    useEffect,
    useMemo,
    useState
} from "react";

import {
    useNavigate,
    useParams
} from "react-router-dom";

import axios from "axios";

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

import "./ProcessPage.css";


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
    | "catLem"
    | "catPham";


type FormState = {

    workDate: string;

    shift: string;

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

    catPham: string;

    note: string;

};


type ProductStandard = {

    workType:
        | "cat"
        | "long";

    productCode: string;

    standardOutput: number;

};


const productStandards: ProductStandard[] = [

    {
        workType: "cat",
        productCode: "c2556-2",
        standardOutput: 7200
    },

    {
        workType: "cat",
        productCode: "c2556-11",
        standardOutput: 6600
    },

    {
        workType: "cat",
        productCode: "c2556-8",
        standardOutput: 5600
    },

    {
        workType: "cat",
        productCode: "c2556-9",
        standardOutput: 5000
    },

    {
        workType: "cat",
        productCode: "C2556-auto",
        standardOutput: 5000
    },

    {
        workType: "cat",
        productCode: "c2821",
        standardOutput: 2400
    },

    {
        workType: "cat",
        productCode: "c2822",
        standardOutput: 2400
    },

    {
        workType: "cat",
        productCode: "c8484",
        standardOutput: 2400
    },

    {
        workType: "cat",
        productCode: "c8485",
        standardOutput: 2400
    },

    {
        workType: "cat",
        productCode: "c3880-2",
        standardOutput: 7200
    },

    {
        workType: "cat",
        productCode: "c0977",
        standardOutput: 1460
    },

    {
        workType: "cat",
        productCode: "c3880-8",
        standardOutput: 5600
    },

    {
        workType: "cat",
        productCode: "c3880-9",
        standardOutput: 5000
    },

    {
        workType: "cat",
        productCode: "c9149",
        standardOutput: 6000
    },

    {
        workType: "cat",
        productCode: "c0575",
        standardOutput: 1460
    },

    {
        workType: "cat",
        productCode: "c3438",
        standardOutput: 2600
    },

    {
        workType: "cat",
        productCode: "c1080",
        standardOutput: 1800
    },

    {
        workType: "long",
        productCode: "9740",
        standardOutput: 420
    },

    {
        workType: "long",
        productCode: "2801",
        standardOutput: 605
    },

    {
        workType: "long",
        productCode: "6262",
        standardOutput: 420
    },

    {
        workType: "long",
        productCode: "598",
        standardOutput: 420
    },

    {
        workType: "long",
        productCode: "7133",
        standardOutput: 605
    },

    {
        workType: "long",
        productCode: "8484",
        standardOutput: 540
    },

    {
        workType: "long",
        productCode: "8485",
        standardOutput: 570
    },

    {
        workType: "long",
        productCode: "4563",
        standardOutput: 605
    },

    {
        workType: "long",
        productCode: "3880",
        standardOutput: 400
    },

    {
        workType: "long",
        productCode: "7960",
        standardOutput: 300
    },

    {
        workType: "long",
        productCode: "9149",
        standardOutput: 360
    },

    {
        workType: "long",
        productCode: "575",
        standardOutput: 300
    },

    {
        workType: "long",
        productCode: "3438",
        standardOutput: 420
    },

    {
        workType: "long",
        productCode: "1080",
        standardOutput: 660
    },

    {
        workType: "long",
        productCode: "1090",
        standardOutput: 660
    },

    {
        workType: "long",
        productCode: "1657",
        standardOutput: 90
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
        label: "Cong, gãy..."
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
        label: "Bavia đứt hụt"
    },

    {
        key: "ppcm",
        label: "PPCMN"
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
    },

    {
        key: "catPham",
        label: "Cắt phạm"
    }

];


const processMap: Record<

    string,

    {
        id: number;
        title: string;
    }

> = {

    "cat-long": {
        id: 1,
        title: "Mẫu Cắt / Lồng"
    },

    "mai": {
        id: 2,
        title: "Mẫu Mài"
    },

    "kiem-1": {
        id: 3,
        title: "Mẫu Kiểm 1"
    },

    "kiem-2": {
        id: 4,
        title: "Mẫu Kiểm 2"
    },

    "ep": {
        id: 5,
        title: "Mẫu Ép"
    },

    "can": {
        id: 6,
        title: "Mẫu Cán"
    },

    "bavia": {
        id: 7,
        title: "Mẫu Bavia"
    }

};


const getCurrentLocalDate =
    (): string => {

        const now =
            new Date();


        return [
            now.getFullYear(),

            String(
                now.getMonth() + 1
            ).padStart(
                2,
                "0"
            ),

            String(
                now.getDate()
            ).padStart(
                2,
                "0"
            )

        ].join("-");

    };


const formatDisplayDate = (
    value: string
) => {

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


const minutesToText = (
    value: string
) => {

    const minutes =
        Math.max(
            0,
            Number(
                value || 0
            )
        );


    const hour =
        Math.floor(
            minutes / 60
        );


    const remain =
        Math.round(
            minutes % 60
        );


    return `${hour} giờ ${remain} phút`;

};


const initialForm: FormState = {

    workDate:
        getCurrentLocalDate(),

    shift:
        "Ca A",

    machineNo:
        "0",

    totalTime:
        "480",

    actualTime:
        "0",

    deductionTime:
        "0",

    productName:
        "",

    standardOutput:
        "",

    actualOutput:
        "0",

    ttOk:
        "0",

    ttNg:
        "0",

    kqdDapLai:
        "0",

    kqdTuot:
        "0",

    voDoLong:
        "0",

    xuocDoLong:
        "0",

    congGay:
        "0",

    xoay:
        "0",

    khongDut:
        "0",

    baviaHut:
        "0",

    ppcm:
        "0",

    loiCaoSu:
        "0",

    ngKichThuoc:
        "0",

    catLem:
        "0",

    catPham:
        "0",

    note:
        ""

};


function ProcessPage() {

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


    const [
        worker,
        setWorker
    ] = useState<WorkerProfile | null>(
        null
    );


    const [
        workType,
        setWorkType
    ] = useState<
        "cat"
        |
        "long"
    >(
        "cat"
    );


    const [
        form,
        setForm
    ] = useState<FormState>(
        initialForm
    );


    const [
        loadingWorker,
        setLoadingWorker
    ] = useState(true);


    const [
        submitting,
        setSubmitting
    ] = useState(false);


    const availableProducts =
        useMemo(
            () =>
                productStandards.filter(
                    (item) =>
                        item.workType
                        ===
                        workType
                ),
            [workType]
        );


    useEffect(() => {

        const loadWorker =
            async () => {

                try {

                    setLoadingWorker(true);


                    const savedUser =
                        localStorage.getItem(
                            "user"
                        );


                    if (!savedUser) {

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


                    const workerData =
                        await getWorkerByUserId(
                            Number(
                                user.id
                            )
                        );


                    setWorker(
                        workerData
                    );

                }
                catch (error) {

                    console.error(
                        error
                    );


                    alert(
                        "Không lấy được thông tin nhân viên"
                    );

                }
                finally {

                    setLoadingWorker(false);

                }

            };


        void loadWorker();

    }, [navigate]);


    const handleFieldChange = (

        event:
            React.ChangeEvent<
                HTMLInputElement
                |
                HTMLTextAreaElement
                |
                HTMLSelectElement
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


            if (
                name
                ===
                "totalTime"
                ||
                name
                ===
                "deductionTime"
            ) {

                next.actualTime =
                    String(
                        Math.max(
                            0,

                            Number(
                                name
                                ===
                                "totalTime"

                                    ? value

                                    : next.totalTime
                            )

                            -

                            Number(
                                name
                                ===
                                "deductionTime"

                                    ? value

                                    : next.deductionTime
                            )
                        )
                    );

            }


            return next;

        });

    };


    const handleProductChange = (
        event:
            React.ChangeEvent<
                HTMLSelectElement
            >
    ) => {

        const productCode =
            event.target.value;


        const selected =
            productStandards.find(
                (item) =>
                    item.workType
                    ===
                    workType

                    &&

                    item.productCode
                    ===
                    productCode
            );


        setForm((prev) => ({

            ...prev,

            productName:
                productCode,

            standardOutput:
                selected
                    ? String(
                        selected.standardOutput
                    )
                    : ""

        }));

    };


    const handleNgChange = (
        key: NgKey,
        value: string
    ) => {

        if (
            value !== ""
            &&
            !/^\d*$/.test(
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


    const handleOkChange = (
        value: string
    ) => {

        if (
            value !== ""
            &&
            !/^\d*$/.test(
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


    const validateForm = () => {

        if (loadingWorker) {

            return "Đang tải thông tin nhân viên";

        }


        if (!worker) {

            return "Không tìm thấy thông tin nhân viên";

        }


        if (!form.machineNo.trim()) {

            return "Vui lòng nhập số máy";

        }


        if (!form.productName) {

            return "Vui lòng chọn sản phẩm";

        }


        return "";

    };


    const handleSubmit =
        async () => {

            const error =
                validateForm();


            if (error) {

                alert(
                    error
                );

                return;

            }


            try {

                setSubmitting(true);


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

                    stop_reason:
                        "",

                    product_name:
                        form.productName,

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
                                    item.key
                                    !==
                                    "catPham"

                                    &&

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
                                        item.label
                                        ===
                                        "PPCMN"

                                            ? "PPCM"

                                            : item.label
                                                ===
                                                "Bavia đứt hụt"

                                                ? "Bavia hụt"

                                                : item.label
                                                    ===
                                                    "Cong, gãy..."

                                                    ? "Cong gãy"

                                                    : item.label,

                                    quantity:
                                        Number(
                                            form[item.key]
                                            ||
                                            0
                                        )

                                })
                            ),

                    deductions:
                        [],

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
                    error
                );


                alert(

                    axios.isAxiosError(
                        error
                    )

                        ? error.response
                            ?.data
                            ?.message

                            ||

                            "Lưu báo cáo thất bại"

                        : "Lưu báo cáo thất bại"

                );

            }
            finally {

                setSubmitting(false);

            }

        };


    return (

        <main className="worker-form-page">

            <div className="worker-form-shell">

                <header className="worker-form-header">

                    <div className="worker-form-title-row">

                        <button
                            type="button"
                            className="worker-form-back"
                            onClick={() =>
                                navigate(-1)
                            }
                        >
                            ←
                        </button>


                        <h1>
                            {processInfo.title}
                        </h1>

                    </div>


                    <p className="worker-form-identity">

                        {
                            worker?.full_name
                            ||
                            "Đang tải..."
                        }

                        {" - "}

                        {
                            worker?.worker_code
                            ||
                            ""
                        }

                    </p>


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
                                handleFieldChange
                            }
                        />

                    </label>

                </header>


                <section className="worker-form-card">

                    <h2 className="worker-card-title">

                        <span>ⓘ</span>

                        Thông tin cơ bản

                    </h2>


                    <div className="worker-field-block">

                        <label className="worker-field-label">

                            Ca làm việc

                            <em>*</em>

                        </label>


                        <div className="worker-shift-list">

                            {
                                [
                                    "Ca A",
                                    "Ca B",
                                    "Ca C",
                                    "Ca D"
                                ].map(
                                    (shift) => (

                                        <label
                                            key={shift}
                                            className="worker-shift-item"
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
                                                    handleFieldChange
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


                    <div className="worker-field-block">

                        <label
                            className="worker-field-label"
                            htmlFor="machineNo"
                        >

                            Số máy cắt (lồng)

                            <em>*</em>

                        </label>


                        <input
                            id="machineNo"
                            className="worker-text-input"
                            name="machineNo"
                            value={
                                form.machineNo
                            }
                            onChange={
                                handleFieldChange
                            }
                            inputMode="numeric"
                        />

                    </div>


                    <div className="worker-field-block">

                        <label className="worker-field-label">

                            % học việc

                        </label>


                        <input
                            className="worker-text-input readonly"
                            value={
                                `${worker?.training_percent ?? 100}%`
                            }
                            readOnly
                        />

                    </div>

                </section>


                <section className="worker-form-card">

                    <h2 className="worker-card-title">

                        <span>◷</span>

                        Hiệu suất &amp; Thời gian

                    </h2>


                    <div className="worker-time-grid">

                        <div className="worker-time-item">

                            <label>
                                Tổng thời gian
                                <br />
                                (phút)
                            </label>

                            <input
                                name="totalTime"
                                value={
                                    form.totalTime
                                }
                                onChange={
                                    handleFieldChange
                                }
                                inputMode="decimal"
                            />

                            <small>
                                {
                                    minutesToText(
                                        form.totalTime
                                    )
                                }
                            </small>

                        </div>


                        <div className="worker-time-item">

                            <label>
                                Thực tế làm việc
                                <br />
                                (phút)
                            </label>

                            <input
                                name="actualTime"
                                value={
                                    form.actualTime
                                }
                                onChange={
                                    handleFieldChange
                                }
                                inputMode="decimal"
                            />

                            <small>
                                {
                                    minutesToText(
                                        form.actualTime
                                    )
                                }
                            </small>

                        </div>


                        <div className="worker-time-item">

                            <label>
                                Thời gian trừ giờ
                                <br />
                                (phút)
                            </label>

                            <input
                                name="deductionTime"
                                value={
                                    form.deductionTime
                                }
                                onChange={
                                    handleFieldChange
                                }
                                inputMode="decimal"
                            />

                            <small>
                                {
                                    minutesToText(
                                        form.deductionTime
                                    )
                                }
                            </small>

                        </div>

                    </div>

                </section>


                <section className="worker-form-card">

                    <h2 className="worker-card-title">

                        <span>⬡</span>

                        Sản phẩm

                    </h2>


                    <div className="worker-type-switch">

                        <button
                            type="button"
                            className={
                                workType
                                ===
                                "cat"

                                    ? "active"

                                    : ""
                            }
                            onClick={() => {

                                setWorkType(
                                    "cat"
                                );

                                setForm(
                                    (prev) => ({

                                        ...prev,

                                        productName:
                                            "",

                                        standardOutput:
                                            ""

                                    })
                                );

                            }}
                        >
                            Cắt
                        </button>


                        <button
                            type="button"
                            className={
                                workType
                                ===
                                "long"

                                    ? "active"

                                    : ""
                            }
                            onClick={() => {

                                setWorkType(
                                    "long"
                                );

                                setForm(
                                    (prev) => ({

                                        ...prev,

                                        productName:
                                            "",

                                        standardOutput:
                                            ""

                                    })
                                );

                            }}
                        >
                            Lồng
                        </button>

                    </div>


                    <div className="worker-field-block">

                        <label className="worker-field-label">

                            Sản phẩm (công việc)

                            <em>*</em>

                        </label>


                        <select
                            className="worker-select-input"
                            value={
                                form.productName
                            }
                            onChange={
                                handleProductChange
                            }
                        >

                            <option value="">

                                Chọn sản phẩm...

                            </option>


                            {
                                availableProducts.map(
                                    (item) => (

                                        <option
                                            key={
                                                item.productCode
                                            }
                                            value={
                                                item.productCode
                                            }
                                        >
                                            {
                                                item.productCode
                                            }
                                        </option>

                                    )
                                )
                            }

                        </select>

                    </div>


                    <div className="worker-field-block">

                        <label className="worker-field-label">

                            Định mức (tính toán)

                        </label>


                        <input
                            className="worker-text-input readonly"
                            value={
                                form.standardOutput

                                    ? `${Number(
                                        form.standardOutput
                                    ).toLocaleString(
                                        "en-US"
                                    )} pcs/hr`

                                    : ""
                            }
                            placeholder="Định mức tự động"
                            readOnly
                        />

                    </div>


                    <div className="worker-field-block">

                        <label className="worker-field-label">

                            Thực tích sản xuất

                            <em>*</em>

                        </label>


                        <input
                            className="worker-text-input"
                            name="actualOutput"
                            value={
                                form.actualOutput
                            }
                            onChange={
                                handleFieldChange
                            }
                            inputMode="numeric"
                        />

                    </div>

                </section>


                <section className="worker-form-card">

                    <h2 className="worker-card-title">

                        <span>▣</span>

                        Báo cáo Chất lượng

                    </h2>


                    <div className="worker-quality-summary">

                        <div className="worker-quality-card ok">

                            <label>
                                TT OK
                            </label>

                            <input
                                value={
                                    form.ttOk
                                }
                                onChange={
                                    (event) =>
                                        handleOkChange(
                                            event.target.value
                                        )
                                }
                                inputMode="numeric"
                            />

                        </div>


                        <div className="worker-quality-card ng">

                            <label>
                                TT NG
                            </label>

                            <input
                                value={
                                    form.ttNg
                                }
                                readOnly
                            />

                        </div>

                    </div>


                    <div className="worker-defect-grid">

                        {
                            ngOptions.map(
                                (item) => (

                                    <div
                                        key={item.key}
                                        className={
                                            item.key
                                            ===
                                            "catPham"

                                                ? "worker-defect-field full"

                                                : "worker-defect-field"
                                        }
                                    >

                                        <label>
                                            {item.label}
                                        </label>

                                        <input
                                            value={
                                                form[item.key]
                                            }
                                            onChange={
                                                (event) =>
                                                    handleNgChange(
                                                        item.key,
                                                        event.target.value
                                                    )
                                            }
                                            inputMode="numeric"
                                        />

                                    </div>

                                )
                            )
                        }

                    </div>


                    <div className="worker-field-block worker-note-block">

                        <label className="worker-field-label">

                            Ghi chú

                        </label>


                        <textarea
                            name="note"
                            value={
                                form.note
                            }
                            onChange={
                                handleFieldChange
                            }
                        />

                    </div>

                </section>

            </div>


            <button
                type="button"
                className="worker-floating-save"
                disabled={
                    submitting
                    ||
                    loadingWorker
                }
                onClick={
                    handleSubmit
                }
            >

                {
                    submitting
                        ? "Đang lưu..."
                        : "Lưu"
                }

            </button>

        </main>

    );

}


export default ProcessPage;