import type { MachineOption, ProductStandardOption } from "../../services/masterDataService";
import type { ProductionReport } from "../../types/production";
import type { DeductionState, FormState, MachineLineState, OperationType } from "./processPageConfig";

type Option = { key?: string; id?: number; code?: string; label?: string; defect_type_id?: number; deduction_type_id?: number; defect_name?: string; deduction_name?: string };

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
  const lines=args.machineLines.filter(l=>l.machineCode.trim()||l.productCode.trim()).map(l=>({
    machine_code:l.machineCode.trim(),
    product_code:l.productCode.trim(),
    machine_time_hours:num(l.hours)+num(l.minutes)/60,
    ok_quantity:num(l.okQuantity),
    ng_quantity:num(l.ngQuantity),
    standard_output:num(l.standardOutputPerHour),
    standard_time_seconds:l.standardTimeSeconds,
    standard_source:l.standardSource,
    defects:(l.selectedDefects||[]).map(key=>({
      defect_type_id:Number(args.activeNgOptions.find(o=>o.key===key)?.id || 0)||undefined,
      defect_code:String(args.activeNgOptions.find(o=>o.key===key)?.code || key),
      defect_name:String(args.activeNgOptions.find(o=>o.key===key)?.label || key),
      quantity:num(l.defects[key])
    })).filter(x=>x.quantity>0)
  }));
  const defects=args.activeNgOptions.map(o=>({
    key:String(o.key||""),
    id:Number(o.id||o.defect_type_id||0)||undefined,
    code:String(o.code||""),
    label:String(o.label||o.defect_name||o.key||"")
  })).filter(o=>o.key).map(o=>({defect_type_id:o.id,defect_code:o.code,defect_name:o.label,quantity:num(args.form[o.key])})).filter(x=>x.quantity>0);
  const deductions=args.activeDeductionOptions.map(o=>({
    deduction_type_id:Number(o.id||o.deduction_type_id||0)||undefined,
    deduction_code:String(o.code||""),
    deduction_name:String(o.label||o.deduction_name||o.key||""),
    hours:num(args.deductions[String(o.key||"")])
  })).filter(x=>x.hours>0);
  const actualOutput=num(args.form.actualOutput);
  const actualTime=parseHours(args.form.actualTime);
  const deductionTime=parseHours(args.form.deductionTime);
  const totalTime=parseHours(args.form.totalTime);
  return {
    process_id:args.processId,
    work_date:args.form.workDate,
    shift:args.form.shift,
    machine_no:args.usesMultiMachineLines ? lines.map(l=>l.machine_code).join(", ") : args.form.machineNo,
    product_name:args.usesMultiMachineLines ? [...new Set(lines.map(l=>l.product_code))].join(", ") : args.form.productName,
    operation_type:args.operationType,
    operation_mode:args.usesAnyMachine ? "MACHINE" : "MANUAL",
    total_time:totalTime,
    actual_time:actualTime,
    deduction_time:deductionTime,
    standard_output:args.usesMultiMachineLines ? lines.reduce((sum,l)=>sum+num(l.standard_output),0) : num(args.form.standardOutput),
    actual_output:actualOutput,
    tt_ok:num(args.form.ttOk),
    tt_ng:num(args.form.ttNg),
    kqd_dap_lai:num(args.form.kqdDapLai),
    kqd_tuot:num(args.form.kqdTuot),
    vo_do_long:num(args.form.voDoLong),
    xuoc_do_long:num(args.form.xuocDoLong),
    cong_gay:num(args.form.congGay),
    xoay:num(args.form.xoay),
    khong_dut:num(args.form.khongDut),
    bavia_hut:num(args.form.baviaHut),
    ppcm:num(args.form.ppcm),
    loi_cao_su:num(args.form.loiCaoSu),
    ng_kich_thuoc:num(args.form.ngKichThuoc),
    cat_lem:num(args.form.catLem),
    note:args.form.note || "",
    extra_data:args.extraData,
    defects,
    deductions,
    machine_lines:lines,
    client_request_id:args.clientRequestId || undefined,
    exclude_kqd_from_tt:args.excludeKqdFromTt ? 1 : 0
  } as ProductionReport;
}
