import { PROCESS_FORM_SCHEMAS } from "./processFormSchemas";

export type FormState = {

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

export type DeductionState = {

    [key: string]: string;

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

export type NgKey = string;

export type OperationType = "CUT" | "LONG";
export type OperationMode = "MANUAL" | "MACHINE";

export type MachineLineState = {
    machineCode: string;
    productCode: string;
    hours: string;
    minutes: string;
    okQuantity: string;
    ngQuantity: string;
    standardOutputPerHour: number;
    standardTimeSeconds: number | null;
    standardSource: "MACHINE" | "DEFAULT" | null;
    standardLoading: boolean;
    standardError: string;
    selectedDefects: string[];
    defects: Record<string, string>;
};

export const createEmptyMachineLine = (): MachineLineState => ({
    machineCode: "",
    productCode: "",
    hours: "",
    minutes: "",
    okQuantity: "",
    ngQuantity: "",
    standardOutputPerHour: 0,
    standardTimeSeconds: null,
    standardSource: null,
    standardLoading: false,
    standardError: "",
    selectedDefects: [],
    defects: {}
});


// =====================================================
// KEY CÁC LOẠI TRỪ GIỜ
// =====================================================

export type DeductionKey =
    Extract<keyof DeductionState, string>;


// =====================================================
// THÔNG TIN CÔNG ĐOẠN
// ID PHẢI KHỚP BẢNG processes TRONG DATABASE
// =====================================================

export const processMap: Record<
    string,
    {
        id: number;
        title: string;
        machineLabel: string;
    }
> = Object.fromEntries(
    Object.entries(PROCESS_FORM_SCHEMAS).map(([slug, schema]) => [
        slug,
        {
            id: schema.processId,
            title: schema.title,
            machineLabel: schema.machineLabel,
        },
    ])
);


// =====================================================
// DANH SÁCH LOẠI TRỪ GIỜ
// TÊN PHẢI KHỚP deduction_types TRONG DATABASE
// =====================================================

export const deductionOptions: Array<{
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

export const allNgOptions: Array<{

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

export const getCurrentLocalDate =
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

export const shiftLocalDate = (dateValue: string, dayOffset: number): string => {

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

export const getWorkerMaxWorkDate = (): string => getCurrentLocalDate();

export const getWorkerMinWorkDate = (): string =>
    shiftLocalDate(getCurrentLocalDate(), -14);

export const clampWorkerWorkDate = (dateValue: string): string => {
    const minDate = getWorkerMinWorkDate();
    const maxDate = getWorkerMaxWorkDate();

    if (!dateValue) return maxDate;
    if (dateValue < minDate) return minDate;
    if (dateValue > maxDate) return maxDate;
    return dateValue;
};

export const getWorkerAllowedWorkDates = (): Array<{ value: string; label: string }> => {
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

export const decimalHoursToText = (
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

export const initialForm: FormState = {

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

export const initialDeduction: DeductionState = {

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




export const KQD_CODES = new Set(["KQD_DL", "KQD_DAP_LAI", "KQD_TUOT"]);

// =====================================================
// COMPONENT
// =====================================================

