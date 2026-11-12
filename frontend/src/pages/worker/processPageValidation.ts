import type { MachineLineState } from "./processPageConfig";
import { DEFAULT_MACHINE_REPORT_LINE_LIMIT, getMaxMachineCount } from "./processMachineLines";

const normalizeProduct = (value: unknown): string => String(value ?? "").trim().toUpperCase();
/** Common numeric invariants for GC, MAI, DO, K1, K2, CAN, EP, XLBV and SX3.
 * Machine-row totals are validated separately so shared machines are not double counted.
 */
export function validateSharedReportNumbers(args: {
  form: { [key:string]:string; ttOk:string; ttNg:string; actualOutput:string; standardOutput:string };
  deductions: Record<string,string>;
  activeNgOptions: Array<{ key:string }>;
  selectedNg: string[];
  selectedDeduction: string[];
  usesMachineLineAccounting: boolean;
  isCvkMode: boolean;
}): string | null {
  const {form,deductions,activeNgOptions,selectedNg,selectedDeduction,usesMachineLineAccounting,isCvkMode}=args;
  const nonNegativeInteger=(value:unknown)=>{
    const raw=String(value??"").trim();
    if(!raw)return true;
    const n=Number(raw);
    return /^\d+$/.test(raw) && Number.isSafeInteger(n) && n>=0;
  };
  if(!nonNegativeInteger(form.ttOk)||!nonNegativeInteger(form.ttNg))
    return "Sản lượng OK và NG phải là số nguyên không âm.";
  if(!nonNegativeInteger(form.actualOutput))
    return "Tổng sản lượng phải là số nguyên không âm.";
  for(const option of activeNgOptions){
    const key=option.key;
    if(!nonNegativeInteger(form[key]))return `Lỗi NG (${key}) phải là số nguyên không âm.`;
  }
  for(const key of selectedNg){
    if(!activeNgOptions.some(option=>option.key===key))return "Danh mục lỗi NG đã thay đổi. Vui lòng chọn lại loại lỗi.";
  }
  for(const key of selectedDeduction){
    if(!(key in deductions))return "Danh mục thời gian trừ đã thay đổi. Vui lòng chọn lại.";
  }
  if(!usesMachineLineAccounting){
    for(const [key,value] of Object.entries(deductions)){
      const raw=String(value??"").trim();
      if(!raw)continue;
      const n=Number(raw.replace(",","."));
      if(!Number.isFinite(n)||n<0)return `Thời gian trừ (${key}) phải là số không âm.`;
    }
  }
  if(!isCvkMode){
    const standard=Number(String(form.standardOutput??"").replace(",","."));
    if(!Number.isFinite(standard)||standard<=0)return "Định mức phải là số dương hợp lệ.";
  }
  return null;
}


export function validateMachineLines(args: {
  processCode?: string;
  machineLines: MachineLineState[];
  isMachineValid?: (code:string)=>boolean;
  isProductValid?: (machineCode:string, productCode:string)=>boolean;
  maxMachines?: number;
  allowZeroQuantity?: boolean;
}): string | null {
  // The UI keeps one empty placeholder row when the worker adds a machine
  // card. Ignore only rows that are completely untouched; a partially filled
  // row must still be validated so missing machine/product data is surfaced.
  const lines = (args.machineLines || []).filter((line) => {
    const hasText = (value: unknown) => String(value ?? "").trim().length > 0;
    const hasDefectInput = Object.values(line.defects || {}).some(hasText);
    const hasDeductionInput = Object.values(line.deductions || {}).some(hasText);
    return Boolean(
      hasText(line.machineCode)
      || hasText(line.productCode)
      || (String(args.processCode || "").trim().toUpperCase() === "CAN" && hasText(line.materialCode))
      || hasText(line.hours)
      || hasText(line.minutes)
      || hasText(line.actualQuantity)
      || hasText(line.okQuantity)
      || hasText(line.ngQuantity)
      || hasText(line.adjustmentCount)
      || (line.selectedDefects || []).length
      || (line.selectedDeductions || []).length
      || hasDefectInput
      || hasDeductionInput
    );
  });
  if (!lines.length) return String(args.processCode || "").trim().toUpperCase() === "MAI" || String(args.processCode || "").trim().toUpperCase() === "DO" ? "Vui lòng chọn mã sản phẩm và nhập sản lượng trước khi nộp báo cáo" : "Vui lòng nhập ít nhất một máy";
  const maxMachines = args.maxMachines ?? (args.processCode
    ? getMaxMachineCount(args.processCode, args.machineLines)
    : DEFAULT_MACHINE_REPORT_LINE_LIMIT);
  if (lines.length > maxMachines) return `Tối đa ${maxMachines} máy`;
  for (const [lineIndex, line] of lines.entries()) {
    const machineCode = line.machineCode.trim();
    const productCode = line.productCode.trim();
    const machineLabel = machineCode ? `Máy ${machineCode}` : `Máy ${lineIndex + 1}`;
    const manualWithoutMachine = !machineCode && !!productCode && !!args.isProductValid && args.isProductValid("", productCode);

    // Mirror the backend machine-line quantity and time invariants. This is
    // per-line validation, NOT the disabled cross-report daily-hours limit.
    const okRaw = String(line.okQuantity ?? "").trim();
    const ngRaw = String(line.ngQuantity ?? "").trim();
    const okValue = okRaw === "" ? 0 : Number(okRaw);
    const ngValue = ngRaw === "" ? 0 : Number(ngRaw);
    if (!/^\d*$/.test(okRaw) || !/^\d*$/.test(ngRaw) ||
        !Number.isSafeInteger(okValue) || okValue < 0 || !Number.isSafeInteger(ngValue) || ngValue < 0) {
      return `${machineLabel}: OK và NG phải là số nguyên không âm`;
    }
    if (machineCode) {
      const hoursRaw=String(line.hours??"").trim();
      const minutesRaw=String(line.minutes??"").trim();
      if((hoursRaw&&!/^\d+$/.test(hoursRaw))||(minutesRaw&&!/^\d+$/.test(minutesRaw)))
        return `${machineLabel}: giờ và phút phải là số nguyên không âm`;
      const hours = Number(line.hours || 0);
      const minutes = Number(line.minutes || 0);
      if (!Number.isFinite(hours) || !Number.isInteger(hours) || hours < 0 || hours > 12 ||
          !Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
        return `${machineLabel}: giờ phải không âm và phút phải từ 0 đến 59`;
      }
      const deductionValues = Object.values(line.deductions || {});
      if((line.selectedDeductions||[]).some(key=>!(key in (line.deductions||{}))))
        return `${machineLabel}: mục trừ giờ không còn trong danh mục, vui lòng chọn lại`;
      if (deductionValues.some((value) => String(value ?? "").trim() !== "" &&
          (!Number.isFinite(Number(value)) || Number(value) < 0))) {
        return `${machineLabel}: thời gian trừ phải không âm`;
      }
      const deductions = deductionValues.reduce(
        (total, value) => total + (Number(value) || 0), 0
      );
      const actualHours = hours + minutes / 60;
      const grossHours = actualHours + deductions / 60;
      if (!Number.isFinite(actualHours) || actualHours <= 0 || actualHours > 12) {
        return `${machineLabel}: thời gian thực tế phải lớn hơn 0 và không quá 12 giờ`;
      }
      if (!Number.isFinite(grossHours) || grossHours > 12) {
        return `${machineLabel}: thời gian thực tế cộng trừ giờ không được quá 12 giờ`;
      }
    }

    // GC Lồng tay is represented by a blank machine. The product validator is
    // the source of truth for whether that product is valid without a machine.
    // Other machine workflows still fail here because their product validator
    // returns false for an empty machine.
    if (machineCode && ["GC", "MAI", "DO", "CAN", "EP", "K1", "K2", "XLBV", "SX3"].includes(String(args.processCode || "").trim().toUpperCase())) {
      const ng = Math.max(0, Math.trunc(Number(line.ngQuantity) || 0));
      // Reject invalid defect counts rather than truncating silently.
      if (Object.values(line.defects || {}).some(value => {
        const raw=String(value??"").trim();
        return raw!=="" && (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)));
      })) return `Máy ${machineCode}: số lượng từng lỗi NG phải là số nguyên không âm`;
      const defectTotal = Object.values(line.defects || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
      if (defectTotal !== ng) return `Máy ${machineCode || "đang chọn"}: tổng chi tiết lỗi (${defectTotal}) phải bằng NG (${ng})`;
    }
    if (!args.allowZeroQuantity && Math.max(0, Number(line.okQuantity) || 0) + Math.max(0, Number(line.ngQuantity) || 0) <= 0) return `${machineLabel}: phải nhập OK hoặc NG lớn hơn 0`;
    if (!productCode && String(args.processCode || "").trim().toUpperCase() !== "CAN") return `${machineLabel}: thiếu mã sản phẩm`;
    if (!machineCode && !manualWithoutMachine && !["MAI", "DO", "CAN"].includes(String(args.processCode || "").trim().toUpperCase())) return "Thiếu số máy";
    if (machineCode && args.isMachineValid && !args.isMachineValid(machineCode)) return `Máy ${machineCode} không hợp lệ`;

    // Product selection and validation use the exact product_code from the process master.
    if (productCode && args.isProductValid) {
      const valid = args.isProductValid(machineCode, productCode)
        || args.isProductValid(machineCode, normalizeProduct(productCode));
      if (!valid) return `Sản phẩm ${productCode} không hợp lệ`;
    }
  }
  return null;
}
