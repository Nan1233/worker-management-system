import type { MachineOption, ProductStandardOption } from "../../services/masterDataService";

export type ProductSuggestionMode = "MANUAL" | "MACHINE";
const normalize = (value: unknown) => String(value ?? "").trim().toUpperCase();

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

const eligibleMachineCodes = (product: ProductStandardOption): string[] =>
    String(product.eligible_machine_codes || "").split(",").map(normalizeMachineKey).filter(Boolean);

// Cắt tự động: máy 5, 6, 7, 11. Accept both numeric and legacy C-prefixed forms.
const GC_AUTOMATIC_MACHINE_CODES = new Set(["5", "6", "7", "11", "C5", "C6", "C7", "C11"]);
const GC_AUTOMATIC_ALIAS_CODES = new Set(["C2556", "C5770", "CGYX", "C3880", "C8052"]);

/** Canonical worker-facing alias. Legacy `-auto` values are never displayed. */
export const normalizeGcAlias = (value: unknown): string => {
    const alias = normalize(value);
    if (!alias) return "";
    const legacyAuto = alias.match(/^(?:C)?(2556|5770|GYX|3880|8052)-AUTO$/i);
    if (!legacyAuto) return alias;
    const suffix = legacyAuto[1].toUpperCase();
    return suffix === "GYX" ? "CGYX" : `C${suffix}`;
};

/** Only this value is shown in the worker product dropdown/report UI. */
export const getProductDisplayAlias = (product: ProductStandardOption): string =>
    normalizeGcAlias(product.alias_code || product.product_code);

/** Full product code kept for persistence/standard lookup. */
export const getFullProductCode = (alias: string, products: ProductStandardOption[]): string => {
    const normalizedAlias = normalizeGcAlias(alias);
    const match = products.find((product) => getProductDisplayAlias(product) === normalizedAlias);
    return String(match?.product_code || alias || "").trim();
};

const isGcAutomaticMachine = (machineCode: unknown): boolean =>
    GC_AUTOMATIC_MACHINE_CODES.has(normalize(machineCode).replace(/\s+/g, ""));

export const filterProductsForSelection = ({
    products,
    mode,
    machineCode,
    machineOptions,
    useEncodedMachineSuffix = false,
}: {
    products: ProductStandardOption[];
    mode: ProductSuggestionMode;
    machineCode?: string;
    machineOptions?: MachineOption[];
    useEncodedMachineSuffix?: boolean;
}): ProductStandardOption[] => {
    const selectedMachine = normalizeMachineKey(machineCode);
    const selectedRawMachine = normalize(machineCode).replace(/\s+/g, "");

    if (useEncodedMachineSuffix) {
        const canonicalProducts = products
            .map((product) => ({ product, alias: getProductDisplayAlias(product) }))
            .filter(({ alias }) => Boolean(alias));

        // IMPORTANT: ProcessPage already filters GC products by work_type.
        // Never infer Cắt/Lồng from the alias prefix: Lồng aliases can also
        // legitimately be C-prefixed in legacy/master data.
        const productWorkTypes = new Set(
            products.map((product) => normalizeWorkType(product.work_type)).filter(Boolean)
        );

        // Lồng Tay and Lồng Máy MUST show exactly the same Lồng master list.
        if (productWorkTypes.size === 1 && productWorkTypes.has("LONG")) {
            return canonicalProducts.map(({ product }) => product);
        }

        // Cắt: automatic machines only get the five automatic aliases.
        // Cắt không tự động still gets the complete Cắt list, including those five.
        if (productWorkTypes.size === 1 && productWorkTypes.has("CUT")) {
            if (!selectedMachine) return [];
            if (isGcAutomaticMachine(selectedRawMachine)) {
                return canonicalProducts
                    .filter(({ alias }) => GC_AUTOMATIC_ALIAS_CODES.has(alias))
                    .map(({ product }) => product);
            }
            return canonicalProducts.map(({ product }) => product);
        }

        // Defensive fallback for old rows with missing work_type.
        // If all aliases are C-prefixed, treat them as Cắt; otherwise expose
        // the scoped list without re-classifying individual aliases.
        if (!selectedMachine && mode === "MACHINE") return [];
        return canonicalProducts.map(({ product }) => product);
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
    return products
        .map((product) => ({ value: getProductDisplayAlias(product), label: getProductDisplayAlias(product) }))
        .filter((option) => {
            const key = normalize(option.label);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
};
