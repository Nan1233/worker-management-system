import type { MachineOption, ProductStandardOption } from "../../services/masterDataService";
import type { FormState, MachineLineState } from "./processPageConfig";
import { getWorkerMinWorkDate, getWorkerMaxWorkDate } from "./processPageConfig";
import { validateWorkerWorkDate } from "./processWorkDateLogic";
import { validateSharedReportNumbers, validateMachineLines } from "./processPageValidation";
import {
  validateWorkerShift, validateCustomReasonNames, validateManualMachineData,
  validateReportTime, validateReportTotals, validateRequiredExtraFields,
} from "./processFormValidationRules";
import { filterProductsForSelection } from "./productSuggestionRules";

type ValidationInput = {
  loadingMasterData: boolean; loadingWorker: boolean; hasWorker: boolean;
  form: FormState; deductions: Record<string, string>;
  activeNgOptions: Array<{key:string}>; selectedNg: string[]; selectedDeduction: string[];
  usesMachineLineAccounting: boolean; isCvkMode: boolean;
  usesMultiMachineLines: boolean; usesSingleMachine: boolean;
  machineLines: MachineLineState[]; processCode: string; maxMachineCount: number;
  machineOptions: MachineOption[]; scopedProductOptions: ProductStandardOption[];
  getMachineProductOptions: (machineCode: string) => ProductStandardOption[];
  isManualOnlyProcess: boolean;
  currentExtraFields: ReadonlyArray<{key:string; label:string; required?:boolean}>;
  extraData: Record<string,string>;
  calculateActualOutput: (form:FormState)=>number;
};

/** Keep the original validation order so workers see the same first error. */
export function validateProcessForm({
  loadingMasterData, loadingWorker, hasWorker, form, deductions,
  activeNgOptions, selectedNg, selectedDeduction, usesMachineLineAccounting, isCvkMode,
  usesMultiMachineLines, usesSingleMachine, machineLines, processCode, maxMachineCount,
  machineOptions, scopedProductOptions, getMachineProductOptions, isManualOnlyProcess,
  currentExtraFields, extraData, calculateActualOutput,
}: ValidationInput): string {

        if (loadingMasterData) return "Danh mục sản phẩm, máy hoặc lỗi NG đang tải. Vui lòng chờ hoàn tất.";
        if (
            loadingWorker
        ) {

            return "Thông tin nhân viên đang được tải";

        }


        if (
            !hasWorker
            ||
            !form.workerCode
            ||
            !form.workerName
        ) {

            return "Không tìm thấy thông tin nhân viên";

        }


        const workDateError = validateWorkerWorkDate(
            form.workDate,
            getWorkerMinWorkDate(),
            getWorkerMaxWorkDate()
        );
        if (workDateError) return workDateError;


        const shiftError = validateWorkerShift(form.shift);
        if (shiftError) return shiftError;

        const sharedError = validateSharedReportNumbers({
            form,
            deductions,
            activeNgOptions,
            selectedNg,
            selectedDeduction,
            usesMachineLineAccounting,
            isCvkMode,
        });
        if (sharedError) return sharedError;
        const detailNamesError = validateCustomReasonNames(form, selectedNg, selectedDeduction, machineLines);
        if (detailNamesError) return detailNamesError;

        if (!isCvkMode && !usesMultiMachineLines) {
            if (!form.productName.trim()) {
                return "Vui lòng chọn sản phẩm";
            }

            const eligibleProducts = usesSingleMachine
                ? getMachineProductOptions(form.machineNo)
                : filterProductsForSelection({ products: scopedProductOptions, mode: "MANUAL", machineOptions, useEncodedMachineSuffix: processCode === "GC" });
            const matchedProduct = eligibleProducts.find(
                (item) => item.product_code.trim().toLowerCase() === form.productName.trim().toLowerCase()
            );
            if (!matchedProduct) {
                return "Sản phẩm không có trong danh mục. Vui lòng chọn lại từ danh sách gợi ý";
            }
        }

        if (usesMultiMachineLines) {
            const machineLinesError = validateMachineLines({
                processCode,
                machineLines,
                maxMachines: maxMachineCount,
                allowZeroQuantity: isCvkMode,
                isMachineValid: (machineCode) => machineOptions.some(
                    (item) => item.machine_code.trim().toLowerCase() === machineCode.trim().toLowerCase()
                ),
                isProductValid: (machineCode, productCode) => getMachineProductOptions(machineCode).some(
                    (item) => item.product_code.trim().toLowerCase() === productCode.trim().toLowerCase()
                ),
            });
            if (machineLinesError) return machineLinesError;
        } else if (usesSingleMachine) {
            if (!form.machineNo.trim() && processCode !== "DO") return "Vui lòng chọn số máy";
            const matchedMachine = machineOptions.find(
                (item) => item.machine_code.trim().toLowerCase() === form.machineNo.trim().toLowerCase()
            );
            if (form.machineNo.trim() && !matchedMachine) return "Máy không có trong danh mục. Vui lòng chọn lại từ danh sách gợi ý";
        }

        const manualError = validateManualMachineData(form, machineLines, isManualOnlyProcess);
        if (manualError) return manualError;

        const timeError = validateReportTime(form, usesMachineLineAccounting);
        if (timeError) return timeError;

        const totalsError = validateReportTotals(form, activeNgOptions, isCvkMode, usesMachineLineAccounting, calculateActualOutput);
        if (totalsError) return totalsError;

        const extraError = validateRequiredExtraFields(currentExtraFields, extraData);
        if (extraError) return extraError;

        return "";

    
}
