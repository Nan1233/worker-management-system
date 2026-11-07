import type { MachineOption, ProductStandardOption } from "../../services/masterDataService";
import { gcWorkTypeOfMachine } from "../../services/gcMachineWorkType";

export type ProductSuggestionMode = "MANUAL" | "MACHINE";
const normalize = (value: unknown) => String(value ?? "").trim().toUpperCase();

/** Các công việc Lồng tay không có định mức/sản lượng OK-NG. */
export const NO_STANDARD_LONG_WORK_CODES = ["XUATNHAP", "KTCD", "TAIPP"] as const;
export const NO_STANDARD_LONG_WORK_SET = new Set<string>(NO_STANDARD_LONG_WORK_CODES);
export const isNoStandardLongWork = (value: unknown): boolean => NO_STANDARD_LONG_WORK_SET.has(normalize(value));

export const normalizeMachineKey = (value: unknown): string => {
    const code = normalize(value).replace(/\s+/g, "");
    if (!code) return "";
    const numeric = code.match(/^(?:MÁY|MAY|MACHINE|M)[-_]?(\d{1,2})$/i) || code.match(/^(\d{1,2})$/);
    return numeric ? String(Number(numeric[1])) : code;
};

export const normalizeWorkType = (value: unknown): string => {
    const code = normalize(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (["CUT", "CAT"].includes(code)) return "CUT";
    if (["LONG", "LNG"].includes(code)) return "LONG";
    return code;
};

const eligibleMachineCodes = (product: ProductStandardOption): string[] => String(product.eligible_machine_codes || "").split(",").map(normalizeMachineKey).filter(Boolean);
const GC_AUTOMATIC_MACHINE_CODES = new Set(["5", "6", "7", "11", "C5", "C6", "C7", "C11"]);

/** Resolve machine-only suffixes in product codes (for example C9149-1 and C9149-AUTO). */
export const getProductMachineHint = (value: unknown): { kind: "AUTO" | "NUMBER"; value: string } | null => {
    const code = normalize(value).replace(/\s+/g, "");
    const match = code.match(/^(?:C\d[0-9A-Z]*?)-(AUTO|AUTOMATIC|\d+)$/i);
    if (!match) return null;
    const suffix = normalize(match[1]);
    if (suffix === "AUTO" || suffix === "AUTOMATIC") return { kind: "AUTO", value: "AUTO" };
    return { kind: "NUMBER", value: String(Number(suffix)) };
};

const isAutomaticGcMachine = (machineCode: string, machineOptions?: MachineOption[]): boolean => {
    const selected = normalize(machineCode).replace(/\s+/g, "");
    const machine = (machineOptions || []).find((item) => normalize(item.machine_code).replace(/\s+/g, "") === selected
        || normalizeMachineKey(item.machine_code) === normalizeMachineKey(selected));
    return Number(machine?.is_automatic || 0) === 1 || GC_AUTOMATIC_MACHINE_CODES.has(selected)
        || GC_AUTOMATIC_MACHINE_CODES.has(normalizeMachineKey(selected));
};

const filterC9149FamilyForMachine = (
    rows: Array<{ product: ProductStandardOption; alias: string }>,
    machineCode: string,
    machineOptions?: MachineOption[],
): Array<{ product: ProductStandardOption; alias: string }> => {
    const selected = normalizeMachineKey(machineCode);
    const isAuto = isAutomaticGcMachine(machineCode, machineOptions);
    const selectedNumber = /^\d+$/.test(selected) ? String(Number(selected)) : null;
    const isMachineOne = selectedNumber === "1" && !isAuto;
    return rows.filter(({ product }) => {
        const fields = [product.product_code].map((value) => normalize(value));
        const isC9149Family = fields.some((value) => /^C9149(?:-1|-AUTO)?$/.test(value));
        if (!isC9149Family) {
            const hint = getProductMachineHint(product.product_code);
            if (!hint) return true;
            return hint.kind === "AUTO" ? isAuto : !isAuto && hint.value === selectedNumber;
        }
        const isNumberOne = fields.some((value) => value === "C9149-1");
        const isAutoVariant = fields.some((value) => value === "C9149-AUTO");
        if (isNumberOne) return isMachineOne;
        if (isAutoVariant) return isAuto;
        return !isMachineOne && !isAuto;
    });
};

export const normalizeProductCode = (value: unknown): string => normalize(value);

// Alias is not an independent product identifier in KTC; use product_code only.
export const getProductCode = (product: ProductStandardOption): string => normalizeProductCode(product.product_code);

export const getFullProductCode = (productCode: string, products: ProductStandardOption[]): string => {
    const normalizedCode = normalizeProductCode(productCode);
    if (!normalizedCode) return "";
    const exact = products.find((product) => normalize(product.product_code) === normalizedCode);
    return String(exact?.product_code || normalizedCode).trim();
};

const isGcAutomaticMachine = (machineCode: unknown): boolean => GC_AUTOMATIC_MACHINE_CODES.has(normalize(machineCode).replace(/\s+/g, ""));
export const filterProductsForSelection = ({ products, mode, machineCode, machineOptions, useEncodedMachineSuffix = false }: { products: ProductStandardOption[]; mode: ProductSuggestionMode; machineCode?: string; machineOptions?: MachineOption[]; useEncodedMachineSuffix?: boolean; }): ProductStandardOption[] => {
    const selectedMachine = normalizeMachineKey(machineCode);
    const selectedRawMachine = normalize(machineCode).replace(/\s+/g, "");

    if (useEncodedMachineSuffix) {
        let canonicalProducts = products.map((product) => ({ product, alias: getProductCode(product) })).filter(({ alias }) => Boolean(alias));
        // Only the selected machine's configured master-data type is authoritative.
        // Missing/unknown metadata fails closed instead of guessing from C/ML/numeric
        // machine or product-code prefixes.
        const selectedMachineWorkType = selectedRawMachine
            ? gcWorkTypeOfMachine(machineOptions, selectedRawMachine)
            : null;
        // The API may merge CUT and LONG standards. Scope by the selected machine's
        // master work type before rendering suggestions; never leak other-process-type products.
        if (selectedRawMachine) {
            if (!selectedMachineWorkType) return [];
            canonicalProducts = canonicalProducts.filter(({ product, alias }) => {
                // KTC work type is an explicit master-data property. A product-code
                // prefix (including "C") does not identify Cắt versus Lồng.
                return normalizeWorkType(product.work_type) === selectedMachineWorkType;
            });
            canonicalProducts = filterC9149FamilyForMachine(canonicalProducts, selectedRawMachine, machineOptions);
        }
        const productWorkTypes = new Set(canonicalProducts.map(({ product }) => normalizeWorkType(product.work_type)).filter(Boolean));
        const workerSelectionProducts = (rows: Array<{ product: ProductStandardOption; alias: string }>): ProductStandardOption[] => rows.map(({ product, alias }) => ({ ...product, product_code: alias }));

        if (productWorkTypes.size === 1 && productWorkTypes.has("LONG")) {
            if (mode === "MANUAL") {
                const specialProducts: Array<{ product: ProductStandardOption; alias: string }> = NO_STANDARD_LONG_WORK_CODES.map((code) => ({
                    alias: code,
                    product: {
                        ...(canonicalProducts[0]?.product || {} as ProductStandardOption),
                        product_code: code,
                        work_type: "LONG",
                        // Positive UI placeholder only so the existing client-side
                        // required-standard validation can accept this selectable
                        // work. Submission converts these codes back to standard=0.
                        standard_output: 1,
                    } as ProductStandardOption,
                }));
                const existingAliases = new Set(canonicalProducts.map(({ alias }) => alias));
                return workerSelectionProducts([
                    ...canonicalProducts,
                    ...specialProducts.filter(({ alias }) => !existingAliases.has(alias)),
                ]);
            }
            if (!selectedMachine || selectedMachineWorkType !== "LONG") return [];
            return workerSelectionProducts(canonicalProducts);
        }
        if (productWorkTypes.size === 1 && productWorkTypes.has("CUT")) {
            if (!selectedMachine) return [];
            if (isGcAutomaticMachine(selectedRawMachine)) {
                // Only offer automatic products that have real rows in the API.
                // Never fabricate product standards by cloning another product.
                const automaticProducts = canonicalProducts.filter(({ product }) =>
                    getProductMachineHint(product.product_code)?.kind === "AUTO");
                return workerSelectionProducts(automaticProducts);
            }
            return workerSelectionProducts(canonicalProducts);
        }
        if (!selectedMachine && mode === "MACHINE") return [];
        return workerSelectionProducts(canonicalProducts);
    }

    if (mode === "MANUAL") return products;
    if (!selectedMachine) return [];
    const machine = (machineOptions || []).find((item) => normalizeMachineKey(item.machine_code) === selectedMachine);
    return products.filter((product) => {
        const mappedMachines = eligibleMachineCodes(product);
        const hasExplicitMapping = Number(product.has_machine_specific_standard || 0) === 1 || mappedMachines.length > 0;
        if (hasExplicitMapping && mappedMachines.length > 0 && !mappedMachines.includes(selectedMachine)) return false;
        if (Number(machine?.is_automatic || 0) === 1) return hasExplicitMapping && mappedMachines.includes(selectedMachine);
        return true;
    });
};

export const toProductAutocompleteOptions = (products: ProductStandardOption[]) => {
    const uniqueCodes = Array.from(new Set(
        products.map((product) => String(product.product_code || "").trim()).filter(Boolean)
    ));
    return uniqueCodes.map((value) => ({ value, label: value }));
};
