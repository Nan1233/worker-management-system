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
export const getProductDisplayAlias = (product: ProductStandardOption): string => normalize(product.product_code);

/** GC gửi đúng mã sản phẩm chuẩn; không đổi qua alias, encoding_code hoặc hậu tố tự sinh. */
export const getFullProductCode = (productCode: string, products: ProductStandardOption[]): string => {
    const canonical = normalize(productCode);
    if (!canonical) return "";
    const matches = products.filter((product) => normalize(product.product_code) === canonical);
    return matches.length === 1 ? normalize(matches[0].product_code) : canonical;
};

const isGcAutomaticMachine = (machineCode: unknown): boolean => GC_AUTOMATIC_MACHINE_CODES.has(normalize(machineCode).replace(/\s+/g, ""));
const isGcLongMachine = (machineCode: unknown, machineOptions?: MachineOption[]): boolean => {
    const raw = normalize(machineCode).replace(/\s+/g, "");
    // Machine master (gc_work_type) decides Lồng when the API supplies it. The
    // prefix rule below is only the legacy fallback for an API without the column.
    if ((machineOptions || []).some((item) => item?.gc_work_type !== undefined)) {
        return gcWorkTypeOfMachine(machineOptions, raw) === "LONG";
    }
    return /^ML\d+$/i.test(raw) || /^\d+$/.test(normalizeMachineKey(raw));
};

export const filterProductsForSelection = ({ products, mode, machineCode, machineOptions, useEncodedMachineSuffix = false }: { products: ProductStandardOption[]; mode: ProductSuggestionMode; machineCode?: string; machineOptions?: MachineOption[]; useEncodedMachineSuffix?: boolean; }): ProductStandardOption[] => {
    const selectedMachine = normalizeMachineKey(machineCode);
    const selectedRawMachine = normalize(machineCode).replace(/\s+/g, "");

    if (useEncodedMachineSuffix) {
        // GC uses canonical product_code only. The selected machine master determines
        // CUT/LONG; aliases and encoding codes are not product identifiers.
        const canonicalProducts = products
            .filter((product) => {
                const type = normalizeWorkType(product.work_type);
                return type === "CUT" || type === "LONG";
            })
            .map((product) => ({ product, alias: normalize(product.product_code) }))
            .filter(({ alias }) => Boolean(alias));
        const workerSelectionProducts = (rows: Array<{ product: ProductStandardOption; alias: string }>): ProductStandardOption[] =>
            rows.map(({ product }) => ({ ...product, product_code: normalize(product.product_code), alias_code: null, encoding_code: null }));

        if (mode === "MANUAL") {
            const longProducts = canonicalProducts.filter(({ product }) => normalizeWorkType(product.work_type) === "LONG");
            const specialProducts: Array<{ product: ProductStandardOption; alias: string }> = NO_STANDARD_LONG_WORK_CODES.map((code) => ({
                alias: code,
                product: {
                    ...(canonicalProducts[0]?.product || {} as ProductStandardOption),
                    product_code: code,
                    alias_code: null,
                    encoding_code: null,
                    work_type: "LONG",
                    standard_output: 1,
                } as ProductStandardOption,
            }));
            const existing = new Set(longProducts.map(({ alias }) => alias));
            return workerSelectionProducts([...longProducts, ...specialProducts.filter(({ alias }) => !existing.has(alias))]);
        }

        if (!selectedMachine) return [];
        const selectedType = isGcLongMachine(selectedRawMachine, machineOptions) ? "LONG" : "CUT";
        return workerSelectionProducts(canonicalProducts.filter(({ product }) => normalizeWorkType(product.work_type) === selectedType));
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
    const seen = new Set<string>();
    return products.map((product) => ({ value: getProductDisplayAlias(product), label: getProductDisplayAlias(product) })).filter((option) => {
        const key = normalize(option.label);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};
