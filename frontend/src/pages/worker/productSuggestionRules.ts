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

/**
 * Resolve the worker-facing alias to the product-standard code that actually
 * exists in the current master. Prefer a row with a positive standard. This
 * prevents an alias-master display row (which may intentionally have no
 * standard itself) from being persisted as an unresolvable product code.
 */
export const getFullProductCode = (alias: string, products: ProductStandardOption[]): string => {
    const normalizedAlias = normalizeGcAlias(alias);
    if (!normalizedAlias) return "";

    const positive = (row: ProductStandardOption | undefined) =>
        row && Number(row.standard_output) > 0 ? String(row.product_code || "").trim() : "";

    const exactDisplayStandardRow = products.find(
        (product) => getProductDisplayAlias(product) === normalizedAlias && Number(product.standard_output) > 0
    );
    const exactDisplayStandard = positive(exactDisplayStandardRow);
    if (exactDisplayStandard) return exactDisplayStandard;

    const exactCodeStandardRow = products.find(
        (product) => normalize(product.product_code) === normalizedAlias && Number(product.standard_output) > 0
    );
    const exactCodeStandard = positive(exactCodeStandardRow);
    if (exactCodeStandard) return exactCodeStandard;

    // GC automatic worker aliases have legacy standard rows with -auto suffixes.
    if (GC_AUTOMATIC_ALIAS_CODES.has(normalizedAlias)) {
        const automaticCode = normalizedAlias === "CGYX"
            ? "CGYX-AUTO"
            : `${normalizedAlias}-AUTO`;
        const automatic = products.find((product) => normalize(product.product_code) === automaticCode && Number(product.standard_output) > 0);
        const automaticStandard = positive(automatic);
        if (automaticStandard) return automaticStandard;
    }

    // Some C-prefixed aliases correspond to the ordinary standard code without C.
    if (normalizedAlias.startsWith("C")) {
        const stripped = normalizedAlias.slice(1);
        const strippedRow = products.find((product) => normalize(product.product_code) === stripped && Number(product.standard_output) > 0);
        const strippedStandard = positive(strippedRow);
        if (strippedStandard) return strippedStandard;
    }

    // Last resort: retain the canonical alias-master target for compatibility.
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

        const productWorkTypes = new Set(
            products.map((product) => normalizeWorkType(product.work_type)).filter(Boolean)
        );

        if (productWorkTypes.size === 1 && productWorkTypes.has("LONG")) {
            return canonicalProducts.map(({ product }) => product);
        }

        if (productWorkTypes.size === 1 && productWorkTypes.has("CUT")) {
            if (!selectedMachine) return [];
            if (isGcAutomaticMachine(selectedRawMachine)) {
                return canonicalProducts
                    .filter(({ alias }) => GC_AUTOMATIC_ALIAS_CODES.has(alias))
                    .map(({ product }) => product);
            }
            return canonicalProducts.map(({ product }) => product);
        }

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
