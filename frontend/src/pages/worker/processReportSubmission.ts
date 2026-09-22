import type { MachineOption, ProductStandardOption } from "../../services/masterDataService";
import type { ProductionReport } from "../../types/production";
import type { DeductionState, FormState, MachineLineState, OperationType } from "./processPageConfig";

type Option = { key?: string; id?: number; code?: string; defect_code?: string; label?: string; defect_type_id?: number; deduction_type_id?: number; defect_name?: string; deduction_name?: string };

const parseHours = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "").trim().toLowerCase().replace(",", ".");
  if (!normalized) return 0;
  const match = normalized.match(/^(\d{1,3})\s*(?:h|g|:)\s*(\d{1,2})$/);
  if (match) {
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return minutes >= 0 && minutes <= 59 ? hours + minutes / 60 : 0;
  }
  const hoursOnly = normalized.match(/^(\d{1,3})\s*(?:h|g)$/);
  if (hoursOnly) return Number(hoursOnly[1]) || 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const LEGACY_DEFECT_BINDINGS: Array<[keyof FormState, string, string]> = [
  ["kqdDapLai", "KQD", "KQD"],
  ["kqdTuot", "KQD", "KQD"],
  ["voDoLong", "VO_CAO_SU", "Vỡ cao su"],
  ["xuocDoLong", "K_XUOC_CONG_GAY", "K xước cong gãy"],
  ["congGay", "K_XUOC_CONG_GAY", "K xước cong gãy"],
  ["xoay", "XOAY", "Cao su xoay"],
  ["khongDut", "CAT_KHONG_DUT", "Cắt không đứt"],
  ["baviaHut", "BAVIA", "Bavia"],
  ["ppcm", "PPCM", "PPCM"],
  ["loiCaoSu", "LCS", "Lỗi cao su"],
  ["ngKichThuoc", "KT_LON", "KT kích thước"],
  ["catLem", "CAT_LEM", "Cắt lẹm"],
];

export function buildProductionReportPayload(args: {
  clientRequestId: string|null;
  processId: number;
  form: FormState;
  extraData: Record<string,string>;
  operationType: OperationType;
  isCutLongProcess: boolean;
  usesAnyMachine: boolean;
  usesMultiMachineLines: boolean;
  usesSingleMachine: boolean;
  machineLines: MachineLineState[];
  machineOptions: MachineOption[];
  productOptions: ProductStandardOption[];
  activeNgOptions: Option[];
  deductions: DeductionState;
  activeDeductionOptions: Option[];
  excludeKqdFromTt: boolean;
}): ProductionReport {
  const num=(v:unknown)=>Number(v)||0;

  const resolvePositiveStandardOutput = (productCode: string, currentValue: unknown): number => {
    const current = Number(currentValue);
    if (Number.isFinite(current) && current > 0) return current;
    const normalizedProduct = String(productCode || "").trim().toUpperCase();
    if (!normalizedProduct) return 0;
    const candidates = args.productOptions
      .filter((row) => String(row?.product_code || "").trim().toUpperCase() === normalizedProduct)
      .map((row) => Number(row?.standard_output))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => b - a);
    return candidates[0] ?? 0;
  };

  const defectForOption = (option?: Option, quantity = 0) => ({
    defect_type_id:Number(option?.id || option?.defect_type_id || 0)||undefined,
    defect_code:String(option?.code || option?.defect_code || ""),
    defect_name:String(option?.label || option?.defect_name || ""),
    quantity:num(quantity)
  });

  const normalizeDefectIdentity = (code:string, name:string) => {
    const normalizedCode=String(code||"").trim().toUpperCase();
    if (normalizedCode === "CAO_SU_XOAY") return "XOAY";
    return normalizedCode || String(name||"").trim().toUpperCase();
  };

  const formDefects=args.activeNgOptions.map(o=>({
    key:String(o.key||""),
    id:Number(o.id||o.defect_type_id||0)||undefined,
    code:String(o.code||o.defect_code||""),
    label:String(o.label||o.defect_name||"")
  })).filter(o=>o.key).map(o=>({
    defect_type_id:o.id,
    defect_code:o.code,
    defect_name:o.label,
    quantity:num(args.form[o.key])
  })).filter(x=>x.quantity>0);

  for (const [field, code, name] of LEGACY_DEFECT_BINDINGS) {
    const quantity=num(args.form[String(field)]);
    if (quantity<=0) continue;
    const identity=normalizeDefectIdentity(code,name);
    const existing=formDefects.find(item=>normalizeDefectIdentity(item.defect_code,item.defect_name)===identity);
    if (existing) continue;
    const master=args.activeNgOptions.find(o=>normalizeDefectIdentity(String(o.code||o.defect_code||""),String(o.label||o.defect_name||""))===identity);
    formDefects.push({
      defect_type_id:Number(master?.id||master?.defect_type_id||0)||undefined,
      defect_code:String(master?.code||master?.defect_code||code),
      defect_name:String(master?.label||master?.defect_name||name),
      quantity,
    });
  }

  const lines=args.machineLines.filter(l=>l.machineCode.trim()||l.productCode.trim()).map(l=>{
    const defectKeys = new Set<string>([
      ...(l.selectedDefects || []).map(String),
      ...Object.keys(l.defects || {}).filter((key) => num(l.defects[key]) > 0),
    ]);
    const lineDefects = [...defectKeys].map((key) => {
      const option = args.activeNgOptions.find(o =>
        String(o.key) === key ||
        String(o.code || o.defect_code || "").trim().toUpperCase() === key.trim().toUpperCase() ||
        String(o.id || o.defect_type_id || "") === key
      );
      return defectForOption(option, num(l.defects[key]));
    }).filter(x=>x.quantity>0);

    return {
      machine_code:l.machineCode.trim(),
      product_code:l.productCode.trim(),
      machine_time_hours:num(l.hours)+num(l.minutes)/60,
      adjustment_minutes:num(l.adjustmentMinutes),
      adjustment_count:num(l.adjustmentCount),
      ok_quantity:num(l.okQuantity),
      ng_quantity:num(l.ngQuantity),
      standard_output:resolvePositiveStandardOutput(l.productCode, l.standardOutputPerHour),
      standard_time_seconds:l.standardTimeSeconds,
      standard_source:l.standardSource,
      defects:lineDefects
    };
  });

  const machineDefects = lines.flatMap((line) => line.defects || []);
  const defects = machineDefects.length > 0
    ? machineDefects.reduce<Array<{defect_type_id?:number;defect_code:string;defect_name:string;quantity:number}>>((acc, item) => {
        const key = item.defect_type_id ? `id:${item.defect_type_id}` : `code:${normalizeDefectIdentity(item.defect_code,item.defect_name)}`;
        const existing = acc.find((x) => (x.defect_type_id ? `id:${x.defect_type_id}` : `code:${normalizeDefectIdentity(x.defect_code,x.defect_name)}`) === key);
        if (existing) existing.quantity += item.quantity;
        else acc.push({ ...item });
        return acc;
      }, [])
    : formDefects;

  if (args.usesSingleMachine && !args.usesMultiMachineLines && args.form.machineNo.trim()) {
    const singleLineDefects = defects.map((item) => ({
      defect_type_id:item.defect_type_id,
      defect_code:item.defect_code,
      defect_name:item.defect_name,
      quantity:item.quantity,
    }));
    lines.splice(0, lines.length, {
      machine_code:args.form.machineNo.trim(),
      product_code:args.form.productName.trim(),
      machine_time_hours:parseHours(args.form.actualTime),
      adjustment_minutes:0,
      adjustment_count:num(args.form.adjustmentCount),
      ok_quantity:num(args.form.ttOk),
      ng_quantity:num(args.form.ttNg),
      standard_output:resolvePositiveStandardOutput(args.form.productName, args.form.standardOutput),
      standard_time_seconds:null,
      standard_source:"DEFAULT",
      defects:singleLineDefects,
    });
  }

  const deductions=args.activeDeductionOptions.map(o=>({
    deduction_type_id:Number(o.id||o.deduction_type_id||0)||undefined,
    deduction_code:String(o.code||""), deduction_name:String(o.label||o.deduction_name||o.key||""),
    hours:num(args.deductions[String(o.key||"")])/60
  })).filter(x=>x.hours>0);
  const actualOutput=num(args.form.actualOutput);
  const actualTime=parseHours(args.form.actualTime);
  const deductionTime=parseHours(args.form.deductionTime);
  const totalTime=parseHours(args.form.totalTime);
  const hasActualMachineLine=(args.usesMultiMachineLines||args.usesSingleMachine)&&lines.some((line)=>!!line.machine_code);
  const useMachineLinesPayload=(args.usesMultiMachineLines||args.usesSingleMachine)&&hasActualMachineLine;

  const normalizedMachine = String(args.form.machineNo || lines[0]?.machine_code || "").trim().toUpperCase();
  const automaticCutMachines = new Set<string>(["C5", "C6", "C7", "C11"]);
  const executionMethod = args.operationType === "CUT"
    ? (automaticCutMachines.has(normalizedMachine) ? "AUTO" : "NON_AUTO")
    : ((args.form.executionMethod === "MANUAL" || args.form.executionMethod === "MACHINE")
      ? args.form.executionMethod
      : (args.usesAnyMachine ? "MACHINE" : "MANUAL"));

  return {
    process_id:args.processId, work_date:args.form.workDate, shift:args.form.shift,
    machine_no:useMachineLinesPayload?lines.map(l=>l.machine_code).join(", "):args.form.machineNo,
    product_name:useMachineLinesPayload?[...new Set(lines.map(l=>l.product_code))].join(", "):args.form.productName,
    operation_type:args.operationType,
    operation_mode:useMachineLinesPayload?"MACHINE":(args.usesAnyMachine&&!args.isCutLongProcess?"MACHINE":"MANUAL"),
    total_time:totalTime, actual_time:actualTime, deduction_time:deductionTime,
    standard_output:useMachineLinesPayload?lines.reduce((sum,l)=>sum+num(l.standard_output),0):resolvePositiveStandardOutput(args.form.productName,args.form.standardOutput),
    actual_output:actualOutput, tt_ok:num(args.form.ttOk), tt_ng:num(args.form.ttNg),
    kqd_dap_lai:num(args.form.kqdDapLai), kqd_tuot:num(args.form.kqdTuot), vo_do_long:num(args.form.voDoLong),
    xuoc_do_long:num(args.form.xuocDoLong), cong_gay:num(args.form.congGay), xoay:num(args.form.xoay),
    khong_dut:num(args.form.khongDut), bavia_hut:num(args.form.baviaHut), ppcm:num(args.form.ppcm),
    loi_cao_su:num(args.form.loiCaoSu), ng_kich_thuoc:num(args.form.ngKichThuoc), cat_lem:num(args.form.catLem),
    note:args.form.note||"",
    extra_data:{...args.extraData, adjustment_count:num(args.form.adjustmentCount), execution_method:executionMethod},
    defects, deductions, machine_lines:useMachineLinesPayload?lines:[], client_request_id:args.clientRequestId||undefined,
    exclude_kqd_from_tt:args.excludeKqdFromTt?1:0
  } as ProductionReport;
}
