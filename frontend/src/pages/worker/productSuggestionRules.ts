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
const GC_AUTOMATIC_ALIAS_CODES = new Set(["C2556", "C5770", "CGYX", "C3880", "C8052", "C9149"]);

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
    const isMachineOne = selected === "1" && !isAuto;
    return rows.filter(({ product }) => {
        const fields = [product.product_code, product.encoding_code, product.alias_code].map((value) => normalize(value));
        const isC9149Family = fields.some((value) => /^C9149(?:-1|-AUTO)?$/.test(value));
        if (!isC9149Family) {
            const hint = getProductMachineHint(product.product_code) || getProductMachineHint(product.alias_code);
            if (!hint) return true;
            return hint.kind === "AUTO" ? isAuto : !isAuto && selected === hint.value;
        }
        const isNumberOne = fields.some((value) => value === "C9149-1");
        const isAutoVariant = fields.some((value) => value === "C9149-AUTO");
        if (isNumberOne) return isMachineOne;
        if (isAutoVariant) return isAuto;
        return !isMachineOne && !isAuto;
    });
};

export const normalizeGcAlias = (value: unknown): string => {
    const alias = normalize(value);
    if (!alias) return "";
    const legacyAuto = alias.match(/^(?:C)?(2556|5770|GYX|3880|8052)-AUTO$/i);
    if (!legacyAuto) return alias;
    const suffix = legacyAuto[1].toUpperCase();
    return suffix === "GYX" ? "CGYX" : `C${suffix}`;
};

export const getProductDisplayAlias = (product: ProductStandardOption): string => normalizeGcAlias(product.alias_code || product.product_code);

export const getFullProductCode = (alias: string, products: ProductStandardOption[]): string => {
    const normalizedAlias = normalizeGcAlias(alias);
    if (!normalizedAlias) return "";

    const positive = (row: ProductStandardOption | undefined) => {
        if (!row || Number(row.standard_output) <= 0) return "";
        return String(row.encoding_code || row.product_code || "").trim();
    };

    const exactDisplayRows = products.filter((product) => getProductDisplayAlias(product) === normalizedAlias && Number(product.standard_output) > 0);
    if (exactDisplayRows.length === 1) {
        const value = positive(exactDisplayRows[0]);
        if (value) return value;
    }

    const exactCodeRows = products.filter((product) => normalize(product.product_code) === normalizedAlias && Number(product.standard_output) > 0);
    if (exactCodeRows.length === 1) {
        const value = positive(exactCodeRows[0]);
        if (value) return value;
    }

    if (GC_AUTOMATIC_ALIAS_CODES.has(normalizedAlias)) {
        const automaticCode = normalizedAlias === "CGYX" ? "CGYX-AUTO" : `${normalizedAlias}-AUTO`;
        const automatic = products.find((product) => normalize(product.product_code) === automaticCode && Number(product.standard_output) > 0);
        const automaticStandard = positive(automatic);
        if (automaticStandard) return automaticStandard;
    }

    if (normalizedAlias.startsWith("C")) {
        const stripped = normalizedAlias.slice(1);
        const strippedRows = products.filter((product) => normalize(product.product_code) === stripped && Number(product.standard_output) > 0);
        if (strippedRows.length === 1) {
            const strippedStandard = positive(strippedRows[0]);
            if (strippedStandard) return strippedStandard;
        }
    }

    const match = products.find((product) => getProductDisplayAlias(product) === normalizedAlias);
    return String(match?.product_code || alias || "").trim();
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
        let canonicalProducts = products.map((product) => ({ product, alias: getProductDisplayAlias(product) })).filter(({ alias }) => Boolean(alias));
        const hasMachineTypeMetadata = (machineOptions || []).some((item) => item?.gc_work_type !== undefined);
        const selectedMachineWorkType = hasMachineTypeMetadata
            ? gcWorkTypeOfMachine(machineOptions, selectedRawMachine)
            : selectedRawMachine
                ? (isGcLongMachine(selectedRawMachine, machineOptions) ? "LONG" : "CUT")
                : null;
        // The API may merge CUT and LONG standards. Scope by the selected machine's
        // master work type before rendering suggestions; never leak other-process-type products.
        if (selectedRawMachine) {
            if (!selectedMachineWorkType) return [];
            canonicalProducts = canonicalProducts.filter(({ product }) => normalizeWorkType(product.work_type) === selectedMachineWorkType);
            canonicalProducts = filterC9149FamilyForMachine(canonicalProducts, selectedRawMachine, machineOptions);
        }
        const productWorkTypes = new Set(canonicalProducts.map(({ product }) => normalizeWorkType(product.work_type)).filter(Boolean));
        // Apply the C13/C7236 compatibility option before branching on work_type:
        // merged product APIs can return mixed CUT/LONG rows, so the CUT-only
        // branch below is not guaranteed to run even when the selected form is CUT.
        if (selectedRawMachine === "C13" && mode === "MACHINE" && !canonicalProducts.some(({ alias }) => alias === "C7236")) {
            const template = canonicalProducts.find(({ alias }) => alias === "C7630")?.product
                || canonicalProducts.find(({ alias }) => alias.startsWith("C"))?.product
                || canonicalProducts[0]?.product;
            if (template) {
                canonicalProducts.push({
                    alias: "C7236",
                    product: {
                        ...template,
                        product_code: "R7236",
                        alias_code: "C7236",
                        encoding_code: "R7236",
                        standard_output: 690,
                        work_type: "CUT",
                    },
                });
            }
        }
        const workerSelectionProducts = (rows: Array<{ product: ProductStandardOption; alias: string }>): ProductStandardOption[] => rows.map(({ product, alias }) => ({ ...product, product_code: alias }));

        if (productWorkTypes.size === 1 && productWorkTypes.has("LONG")) {
            if (mode === "MANUAL") {
                const specialProducts: Array<{ product: ProductStandardOption; alias: string }> = NO_STANDARD_LONG_WORK_CODES.map((code) => ({
                    alias: code,
                    product: {
                        ...(canonicalProducts[0]?.product || {} as ProductStandardOption),
                        product_code: code,
                        alias_code: code,
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
            if (!selectedMachine || !isGcLongMachine(selectedRawMachine, machineOptions)) return [];
            return workerSelectionProducts(canonicalProducts);
        }
        if (productWorkTypes.size === 1 && productWorkTypes.has("CUT")) {
            if (!selectedMachine) return [];
            if (isGcAutomaticMachine(selectedRawMachine)) {
                const automaticProducts = canonicalProducts.filter(({ alias }) => GC_AUTOMATIC_ALIAS_CODES.has(alias));
                const presentAliases = new Set(automaticProducts.map(({ alias }) => alias));
                const template = automaticProducts[0]?.product || canonicalProducts[0]?.product;
                if (template) {
                    for (const alias of GC_AUTOMATIC_ALIAS_CODES) {
                        if (presentAliases.has(alias)) continue;
                        automaticProducts.push({ product: { ...template, product_code: alias, alias_code: alias }, alias });
                    }
                }
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
    const seen = new Set<string>();
    return products.map((product) => ({ value: getProductDisplayAlias(product), label: getProductDisplayAlias(product) })).filter((option) => {
        const key = normalize(option.label);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};
