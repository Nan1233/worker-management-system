import type { MachineOption, ProductStandardOption } from "../../services/masterDataService";

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
const GC_AUTOMATIC_ALIAS_CODES = new Set(["C2556", "C5770", "CGYX", "C3880", "C8052"]);

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
const isGcLongMachine = (machineCode: unknown): boolean => {
    const raw = normalize(machineCode).replace(/\s+/g, "");
    return /^ML\d+$/i.test(raw) || /^\d+$/.test(normalizeMachineKey(raw));
};

export const filterProductsForSelection = ({ products, mode, machineCode, machineOptions, useEncodedMachineSuffix = false }: { products: ProductStandardOption[]; mode: ProductSuggestionMode; machineCode?: string; machineOptions?: MachineOption[]; useEncodedMachineSuffix?: boolean; }): ProductStandardOption[] => {
    const selectedMachine = normalizeMachineKey(machineCode);
    const selectedRawMachine = normalize(machineCode).replace(/\s+/g, "");

    if (useEncodedMachineSuffix) {
        const canonicalProducts = products.map((product) => ({ product, alias: getProductDisplayAlias(product) })).filter(({ alias }) => Boolean(alias));
        const productWorkTypes = new Set(products.map((product) => normalizeWorkType(product.work_type)).filter(Boolean));
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
            if (!selectedMachine || !isGcLongMachine(selectedRawMachine)) return [];
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
