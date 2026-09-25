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

// Cắt tự động: máy 5, 6, 7, 11. Accept both "5" and legacy "C5" forms.
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
    operationType,
    useEncodedMachineSuffix = false,
}: {
    products: ProductStandardOption[];
    mode: ProductSuggestionMode;
    machineCode?: string;
    machineOptions?: MachineOption[];
    operationType?: string;
    useEncodedMachineSuffix?: boolean;
}): ProductStandardOption[] => {
    const selectedMachine = normalizeMachineKey(machineCode);
    const selectedRawMachine = normalize(machineCode).replace(/\s+/g, "");

    if (useEncodedMachineSuffix) {
        const canonicalProducts = products
            .map((product) => ({ product, alias: getProductDisplayAlias(product) }))
            .filter(({ alias }) => Boolean(alias));

        // ProcessPage already scopes productOptions by operationType/work_type.
        // Lồng Tay and Lồng Máy MUST use exactly the same Lồng master list.
        if (normalizeWorkType(operationType) === "LONG") {
            return canonicalProducts.map(({ product }) => product);
        }

        // Cắt: automatic machines only get the five automatic aliases.
        // Non-automatic Cắt machines get the complete Cắt list, including those five.
        if (normalizeWorkType(operationType) === "CUT") {
            if (!selectedMachine) return [];
            if (isGcAutomaticMachine(selectedRawMachine)) {
                return canonicalProducts
                    .filter(({ alias }) => GC_AUTOMATIC_ALIAS_CODES.has(alias))
                    .map(({ product }) => product);
            }
            return canonicalProducts.map(({ product }) => product);
        }

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
