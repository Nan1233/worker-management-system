import kqdExclusionRegistry from "../../../../shared/kqdExclusionRegistry.json";
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

export type NgKey = string;
export type OperationType = "CUT" | "LONG";
export type OperationMode = "MANUAL" | "MACHINE";

export type MachineLineState = {
    machineCode: string;
    productCode: string;
    hours: string;
    minutes: string;
    adjustmentMinutes: string;
    adjustmentCount: string;
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
    adjustmentMinutes: "",
    adjustmentCount: "",
    okQuantity: "",
    ngQuantity: "",
    standardOutputPerHour: 0,
    standardTimeSeconds: null,
    standardSource: null,
    standardLoading: false,
    standardError: "",
    selectedDefects: [],
    defects: {},
});

// ...existing configuration below...
