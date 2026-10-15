import type { MachineOption, ProductStandardOption } from "../../services/masterDataService";
import type { ProductionReport } from "../../types/production";
import type { DeductionState, FormState, MachineLineState, OperationType } from "./processPageConfig";
import { getFullProductCode, isNoStandardLongWork } from "./productSuggestionRules";

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
  ["kqdDapLai", "KQD", "KQD"], ["kqdTuot", "KQD", "KQD"], ["voDoLong", "VO_CAO_SU", "Vỡ cao su"],
  ["xuocDoLong", "K_XUOC_CONG_GAY", "K xước cong gãy"], ["congGay", "K_XUOC_CONG_GAY", "K xước cong gãy"],
  ["xoay", "XOAY", "Cao su xoay"], ["khongDut", "CAT_KHONG_DUT", "Cắt không đứt"], ["baviaHut", "BAVIA", "Bavia"],
  ["ppcm", "PPCM", "PPCM"], ["loiCaoSu", "LCS", "Lỗi cao su"], ["ngKichThuoc", "KT_LON", "KT kích thước"], ["catLem", "CAT_LEM", "Cắt lẹm"],
];

const normalizeCode = (value: unknown) => String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
const GC_AUTOMATIC_MACHINES = new Set(["C5", "C6", "C7", "C11", "5", "6", "7", "11"]);

const resolveSubmittedProductCode = (
  alias: string,
  machineCode: string,
  operationType: OperationType,
  products: ProductStandardOption[],
): string => {
  const resolved = String(getFullProductCode(alias, products) || alias || "").trim();
  if (operationType !== "CUT" || !GC_AUTOMATIC_MACHINES.has(normalizeCode(machineCode))) return resolved;
  if (!resolved) return resolved;
  const normalized = normalizeCode(resolved);
  if (normalized.endsWith("-AUTO")) return resolved;
  return `${resolved}-AUTO`;
};

export function buildProductionReportPayload(args: {
  clientRequestId: string|null; processId: number; form: FormState; extraData: Record<string,string>; operationType: OperationType;
  isCutLongProcess: boolean; isCvkMode?: boolean; processCode?: string; usesAnyMachine: boolean; usesMultiMachineLines: boolean; usesSingleMachine: boolean;
  machineLines: MachineLineState[]; machineOptions: MachineOption[]; productOptions: ProductStandardOption[];
  activeNgOptions: Option[]; deductions: DeductionState; activeDeductionOptions: Option[]; excludeKqdFromTt: boolean;
}): ProductionReport {
  const num=(v:unknown)=>Number(v)||0;
  const noStandardLongWork = args.isCutLongProcess && args.operationType === "LONG" && !args.usesAnyMachine && isNoStandardLongWork(args.form.productName);

  const resolvePositiveStandardOutput = (productCode: string, currentValue: unknown): number => {
    if (noStandardLongWork && isNoStandardLongWork(productCode)) return 0;
    const current = Number(currentValue);
    if (Number.isFinite(current) && current > 0) return current;
    const normalizedProduct = String(productCode || "").trim().toUpperCase();
    if (!normalizedProduct) return 0;
    const candidates = args.productOptions
      .filter((row) => [row?.product_code, row?.alias_code].some((value) => String(value || "").trim().toUpperCase() === normalizedProduct))
      .map((row) => Number(row?.standard_output)).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => b - a);
    return candidates[0] ?? 0;
  };

  const defectForOption = (option?: Option, quantity = 0) => ({
    defect_type_id:Number(option?.id || option?.defect_type_id || 0)||undefined,
    defect_code:String(option?.code || option?.defect_code || ""), defect_name:String(option?.label || option?.defect_name || ""), quantity:num(quantity)
  });
  const normalizeDefectIdentity = (code:string, name:string) => {
    const normalizedCode=String(code||"").trim().toUpperCase();
    if (normalizedCode === "CAO_SU_XOAY") return "XOAY";
    return normalizedCode || String(name||"").trim().toUpperCase();
  };

  const formDefects=args.activeNgOptions.map(o=>({ key:String(o.key||""), id:Number(o.id||o.defect_type_id||0)||undefined,
    code:String(o.code||o.defect_code||""), label:String(o.label||o.defect_name||"") })).filter(o=>o.key)
    .map(o=>({ defect_type_id:o.id, defect_code:o.code, defect_name:o.label, quantity:num(args.form[o.key]) })).filter(x=>x.quantity>0);

  for (const [field, code, name] of LEGACY_DEFECT_BINDINGS) {
    const quantity=num(args.form[String(field)]); if (quantity<=0) continue;
    const identity=normalizeDefectIdentity(code,name); const existing=formDefects.find(item=>normalizeDefectIdentity(item.defect_code,item.defect_name)===identity); if (existing) continue;
    const master=args.activeNgOptions.find(o=>normalizeDefectIdentity(String(o.code||o.defect_code||""),String(o.label||o.defect_name||""))===identity);
    formDefects.push({ defect_type_id:Number(master?.id||master?.defect_type_id||0)||undefined, defect_code:String(master?.code||master?.defect_code||code), defect_name:String(master?.label||master?.defect_name||name), quantity });
  }

  const lines=args.machineLines.filter(l=>l.machineCode.trim()||l.productCode.trim()).map(l=>{
    const defectKeys = new Set<string>([...(l.selectedDefects || []).map(String), ...Object.keys(l.defects || {}).filter((key) => num(l.defects[key]) > 0)]);
    const lineDefects = [...defectKeys].map((key) => {
      const option = args.activeNgOptions.find(o => String(o.key) === key || String(o.code || o.defect_code || "").trim().toUpperCase() === key.trim().toUpperCase() || String(o.id || o.defect_type_id || "") === key);
      return defectForOption(option, num(l.defects[key]));
    }).filter(x=>x.quantity>0);
    const lineDeductions = args.activeDeductionOptions.map(o=>({ deduction_type_id:Number(o.id||o.deduction_type_id||0)||undefined, deduction_code:String(o.code||""), deduction_name:String(o.label||o.deduction_name||o.key||""), hours:num(l.deductions?.[String(o.key||"")])/60 })).filter(x=>x.hours>0);
    const lineDeductionHours = lineDeductions.reduce((sum,item)=>sum+num(item.hours),0);
    const fullProductCode = resolveSubmittedProductCode(l.productCode, l.machineCode, args.operationType, args.productOptions);
    // Worker chỉ nhập thời gian chạy thực tế (actual_time_hours); "Tổng thời gian"
    // (machine_time_hours, giữ nguyên ý nghĩa "gross" cho kế toán giờ máy phía sau)
    // luôn được tự tính = thực tế + trừ giờ, không nhận input tổng trực tiếp từ Worker.
    // Backend tính lại machine_time_hours từ actual_time_hours + deduction_time_hours,
    // không tin tưởng giá trị client gửi lên.
    const lineActualTimeHours = num(l.hours)+num(l.minutes)/60;
    return {
      machine_code:l.machineCode.trim(), product_code:fullProductCode,
      actual_time_hours:lineActualTimeHours, machine_time_hours:lineActualTimeHours+lineDeductionHours, adjustment_minutes:lineDeductionHours*60, adjustment_count:num(l.adjustmentCount),
      deduction_time_hours:lineDeductionHours, deductions:lineDeductions,
      ok_quantity:num(l.okQuantity), ng_quantity:num(l.ngQuantity), standard_output:resolvePositiveStandardOutput(l.productCode, l.standardOutputPerHour),
      standard_time_seconds:l.standardTimeSeconds, standard_source:l.standardSource, defects:lineDefects
    };
  });

  let defects = formDefects;
  const workerNg = Math.max(0, Math.trunc(num(args.form.ttNg)));
  const formDefectTotal = formDefects.reduce((sum, item) => sum + Math.max(0, Math.trunc(num(item.quantity))), 0);
  if ((args.usesMultiMachineLines || args.usesSingleMachine) && workerNg > 0 && formDefects.length === 1 && formDefectTotal !== workerNg) {
    defects = [{ ...formDefects[0], quantity: workerNg }];
  }

  if (args.usesSingleMachine && !args.usesMultiMachineLines && args.form.machineNo.trim()) {
    const singleLineDefects = lines[0]?.defects?.length ? lines[0].defects.map((item) => ({
      defect_type_id:item.defect_type_id, defect_code:item.defect_code, defect_name:item.defect_name, quantity:item.quantity
    })) : defects.map((item) => ({
      defect_type_id:item.defect_type_id, defect_code:item.defect_code, defect_name:item.defect_name, quantity:item.quantity
    }));
    const fullProductCode = resolveSubmittedProductCode(args.form.productName, args.form.machineNo, args.operationType, args.productOptions);
    // For machine reports, the per-machine fields are the source of truth. The
    // parent form totals may lag behind the machine-line state (or be stale),
    // so do not overwrite a valid line quantity with form.ttOk/form.ttNg.
    const selectedMachineLine = lines.find((line) =>
      String(line.machine_code || "").trim().toUpperCase() === args.form.machineNo.trim().toUpperCase()
    );
    lines.splice(0, lines.length, {
      machine_code:args.form.machineNo.trim(), product_code:fullProductCode, actual_time_hours:parseHours(args.form.actualTime), machine_time_hours:parseHours(args.form.actualTime), adjustment_minutes:0,
      adjustment_count:num(args.form.adjustmentCount), deduction_time_hours:0, deductions:[],
      ok_quantity:selectedMachineLine ? num(selectedMachineLine.ok_quantity) : num(args.form.ttOk),
      ng_quantity:selectedMachineLine ? num(selectedMachineLine.ng_quantity) : num(args.form.ttNg),
      standard_output:resolvePositiveStandardOutput(args.form.productName,args.form.standardOutput), standard_time_seconds:null, standard_source:"DEFAULT", defects:singleLineDefects,
    });
  }

  const deductions=args.activeDeductionOptions.map(o=>({ deduction_type_id:Number(o.id||o.deduction_type_id||0)||undefined, deduction_code:String(o.code||""), deduction_name:String(o.label||o.deduction_name||o.key||""), hours:num(args.deductions[String(o.key||"")])/60 })).filter(x=>x.hours>0);
  const hasActualMachineLine=(args.usesMultiMachineLines||args.usesSingleMachine)&&lines.some((line)=>!!line.machine_code);
  const useMachineLinesPayload=(args.usesMultiMachineLines||args.usesSingleMachine)&&hasActualMachineLine;
  const isMachineLineAccounting = useMachineLinesPayload;
  if (isMachineLineAccounting && lines.length && deductions.length) {
    const hasLineDeductions = lines.some((line) => Array.isArray(line.deductions) && line.deductions.length);
    if (!hasLineDeductions) {
      const machineDeductionHours = deductions.reduce((sum, item) => sum + num(item.hours), 0);
      const lineActualHours = num((lines[0] as { actual_time_hours?: number }).actual_time_hours ?? lines[0].machine_time_hours);
      lines[0] = {
        ...lines[0],
        actual_time_hours: lineActualHours,
        machine_time_hours: lineActualHours + machineDeductionHours,
        deduction_time_hours: machineDeductionHours,
        deductions: deductions.map((item) => ({ ...item })),
        adjustment_minutes: machineDeductionHours * 60
      };
    }
  }
  const actualOutput=noStandardLongWork ? 0 : num(args.form.actualOutput);
  const actualTime=parseHours(args.form.actualTime), deductionTime=parseHours(args.form.deductionTime), totalTime=parseHours(args.form.totalTime);
  const normalizedMachine = String(args.form.machineNo || lines[0]?.machine_code || "").trim().toUpperCase();
  const automaticCutMachines = new Set<string>(["C5", "C6", "C7", "C11"]);
  const executionMethod = args.operationType === "CUT" ? (automaticCutMachines.has(normalizedMachine) ? "AUTO" : "NON_AUTO") : ((args.form.executionMethod === "MANUAL" || args.form.executionMethod === "MACHINE") ? args.form.executionMethod : (args.usesAnyMachine ? "MACHINE" : "MANUAL"));
  const cvkWorkType = String(args.form.workType || args.extraData?.work_type || "").trim();
  const normalizeWorkTypeCode = (value: string) => String(value || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const noStandardWorkType = new Set(["XUATNHAP", "KTCD", "TAIPP"]).has(normalizeWorkTypeCode(cvkWorkType));
  const isDedicatedCvkProcess = Number(args.processId) === 30002 || Number(args.processId) === 60006;
  // In a parent process (e.g. GC/Cắt-Lồng), "Công việc khác" is a work type,
  // not a separate process. Treat explicit non-product work types as such even
  // if the UI mode flag is stale/missing; otherwise standard_output=0 is rejected.
  const isNonProductWorkWithinProcess = !isDedicatedCvkProcess && (Boolean(args.isCvkMode) || noStandardWorkType);
  const isCvk = isDedicatedCvkProcess;
  const effectiveProcessId = isCvk ? 30002 : args.processId;
  const submittedMachineNo = isCvk || isNonProductWorkWithinProcess ? null : (useMachineLinesPayload ? lines.map(l=>l.machine_code).join(", ") : args.form.machineNo);
  const submittedProductName = isCvk || isNonProductWorkWithinProcess ? "" : (useMachineLinesPayload ? [...new Set(lines.map(l=>l.product_code).filter(Boolean))].join(", ") : resolveSubmittedProductCode(args.form.productName, args.form.machineNo, args.operationType, args.productOptions));
  const submittedOperationMode = isCvk || isNonProductWorkWithinProcess ? "MANUAL" : (useMachineLinesPayload ? "MACHINE" : (args.usesAnyMachine&&!args.isCutLongProcess ? "MACHINE" : "MANUAL"));

  return {
    process_id: effectiveProcessId, process_code: isDedicatedCvkProcess ? "CVK" : args.processCode, work_date:args.form.workDate, shift:args.form.shift,
    machine_no:submittedMachineNo,
    product_name:submittedProductName,
    work_type:(isCvk || isNonProductWorkWithinProcess) ? cvkWorkType : undefined,
    operation_type:isNonProductWorkWithinProcess ? null : args.operationType, operation_mode:submittedOperationMode,
    // Parent time fields represent the worker's shift time; machine_lines store per-machine time separately.
    // Keep actual_time for the backend daily 12-hour cap (deduction time is excluded from that cap).
    total_time:totalTime,
    actual_time:actualTime,
    deduction_time:deductionTime,
    standard_output:(isCvk || isNonProductWorkWithinProcess || noStandardLongWork) ? 0 : (useMachineLinesPayload?lines.reduce((sum,l)=>sum+num(l.standard_output),0):resolvePositiveStandardOutput(args.form.productName,args.form.standardOutput)),
    actual_output:(isCvk || isNonProductWorkWithinProcess || isMachineLineAccounting) ? 0 : actualOutput, tt_ok:(isCvk || isNonProductWorkWithinProcess || noStandardLongWork || isMachineLineAccounting) ? 0 : num(args.form.ttOk), tt_ng:(isCvk || isNonProductWorkWithinProcess || noStandardLongWork || isMachineLineAccounting) ? 0 : num(args.form.ttNg),
    kqd_dap_lai:(isCvk || isNonProductWorkWithinProcess) ? 0 : num(args.form.kqdDapLai), kqd_tuot:(isCvk || isNonProductWorkWithinProcess) ? 0 : num(args.form.kqdTuot), vo_do_long:(isCvk || isNonProductWorkWithinProcess) ? 0 : num(args.form.voDoLong), xuoc_do_long:(isCvk || isNonProductWorkWithinProcess) ? 0 : num(args.form.xuocDoLong), cong_gay:(isCvk || isNonProductWorkWithinProcess) ? 0 : num(args.form.congGay), xoay:(isCvk || isNonProductWorkWithinProcess) ? 0 : num(args.form.xoay), khong_dut:(isCvk || isNonProductWorkWithinProcess) ? 0 : num(args.form.khongDut), bavia_hut:(isCvk || isNonProductWorkWithinProcess) ? 0 : num(args.form.baviaHut), ppcm:(isCvk || isNonProductWorkWithinProcess) ? 0 : num(args.form.ppcm), loi_cao_su:(isCvk || isNonProductWorkWithinProcess) ? 0 : num(args.form.loiCaoSu), ng_kich_thuoc:(isCvk || isNonProductWorkWithinProcess) ? 0 : num(args.form.ngKichThuoc), cat_lem:(isCvk || isNonProductWorkWithinProcess) ? 0 : num(args.form.catLem),
    note:args.form.note||"", extra_data:{...args.extraData, ...(isCvk && cvkWorkType ? { work_type: cvkWorkType, non_product_work: true, process_code: "CVK" } : {}), ...(isNonProductWorkWithinProcess ? { work_type: cvkWorkType || "CÔNG VIỆC KHÁC", non_product_work: true, parent_process_id: args.processId, process_code: args.processCode || args.extraData?.process_code } : {}), ...(Number(args.processId) === 4 && String(args.form.k1DeductionWork || "").trim() ? { k1_deduction_work: String(args.form.k1DeductionWork).trim() } : {}), adjustment_count:num(args.form.adjustmentCount), execution_method:executionMethod}, defects:(isCvk || isNonProductWorkWithinProcess || noStandardLongWork) ? [] : defects, deductions:isMachineLineAccounting ? [] : deductions, machine_lines:(isCvk || isNonProductWorkWithinProcess) ? [] : (useMachineLinesPayload?lines:[]), client_request_id:args.clientRequestId||undefined, exclude_kqd_from_tt:args.excludeKqdFromTt?1:0
  } as ProductionReport;
}