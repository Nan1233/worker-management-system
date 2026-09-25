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
    String(product.eligible_machine_codes || "")
        .split(",")
        .map(normalizeMachineKey)
        .filter(Boolean);

const GC_AUTOMATIC_MACHINE_CODES = new Set(["C5", "C6", "C7", "C11"]);
const GC_AUTOMATIC_ALIAS_CODES = new Set(["C2556", "C5770", "CGYX", "C3880", "C8052"]);

/**
 * Normalize legacy GC aliases at the UI boundary.
 * Old master rows used `2556-auto`, `5770-auto`, etc. These are NOT valid
 * worker-facing aliases. They are the five automatic Cắt aliases and must be
 * canonicalized before deciding whether an item belongs to Cắt or Lồng.
 */
const normalizeGcAlias = (value: unknown): string => {
    const alias = normalize(value);
    const legacyAuto = alias.match(/^(2556|5770|GYX|3880|8052)-AUTO$/);
    if (legacyAuto) {
        const suffix = legacyAuto[1];
        return suffix === "GYX" ? "CGYX" : `C${suffix}`;
    }
    return alias;
};

const getGcAlias = (product: ProductStandardOption): string => normalizeGcAlias(product.alias_code);
const isGcCutAlias = (aliasCode: string): boolean => aliasCode.startsWith("C");
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
        // GC suggestion data is alias-master driven. Legacy product_standards
        // values are never allowed to become worker-facing labels.
        const aliasedProducts = products.filter((product) => Boolean(getGcAlias(product)));
        const cutProducts = aliasedProducts.filter((product) => isGcCutAlias(getGcAlias(product)));
        const longProducts = aliasedProducts.filter((product) => !isGcCutAlias(getGcAlias(product)));

        if (!selectedMachine) return mode === "MANUAL" ? longProducts : [];

        const isCut = selectedRawMachine.startsWith("C");
        if (!isCut) {
            // Lồng Tay and Lồng Máy intentionally share the complete Lồng list.
            return longProducts;
        }

        if (isGcAutomaticMachine(selectedRawMachine)) {
            return cutProducts.filter((product) => GC_AUTOMATIC_ALIAS_CODES.has(getGcAlias(product)));
        }

        // Cắt không tự động vẫn includes the five automatic aliases.
        return cutProducts;
    }

    if (mode === "MANUAL") return products;
    if (!selectedMachine) return [];

    const machine = (machineOptions || []).find(
        (item) => normalizeMachineKey(item.machine_code) === selectedMachine
    );

    return products.filter((product) => {
        const mappedMachines = eligibleMachineCodes(product);
        const hasExplicitMapping = Number(product.has_machine_specific_standard || 0) === 1 || mappedMachines.length > 0;
        if (hasExplicitMapping && mappedMachines.length > 0 && !mappedMachines.includes(selectedMachine)) return false;

        if (Number(machine?.is_automatic || 0) === 1) {
            return hasExplicitMapping && mappedMachines.includes(selectedMachine);
        }
        return true;
    });
};

const displayAlias = (product: ProductStandardOption): string =>
    normalizeGcAlias(product.alias_code) || String(product.product_code || "").trim();

export const toProductAutocompleteOptions = (products: ProductStandardOption[]) => {
    const seen = new Set<string>();
    return products
        .map((product) => ({
            value: displayAlias(product),
            label: displayAlias(product),
        }))
        .filter((option) => {
            const key = normalize(option.label);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
};
