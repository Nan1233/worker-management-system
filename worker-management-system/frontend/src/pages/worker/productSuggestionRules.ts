import type { MachineOption, ProductStandardOption } from "../../services/masterDataService";

export type ProductSuggestionMode = "MANUAL" | "MACHINE";

const normalize = (value: unknown) => String(value ?? "").trim().toUpperCase();

/**
 * Canonical machine key used only for matching master-data relations.
 * The DB may contain 1, 01, M1, MAY-1, MÁY 01, etc.; these all refer to
 * the same machine when the machine is numeric.
 */
export const normalizeMachineKey = (value: unknown): string => {
    const code = normalize(value).replace(/\s+/g, "");
    if (!code) return "";
    const numeric = code.match(/^(?:MÁY|MAY|MACHINE|M)[-_]?(\d{1,2})$/i) || code.match(/^(\d{1,2})$/);
    return numeric ? String(Number(numeric[1])) : code;
};

/**
 * Master data can carry Cắt/Lồng in either business-language or canonical
 * enum form. Normalize the values before applying the process scope.
 */
export const normalizeWorkType = (value: unknown): string => {
    const code = normalize(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (["CUT", "CAT", "CẮT"].includes(code)) return "CUT";
    if (["LONG", "LNG", "LỒNG"].includes(code)) return "LONG";
    return code;
};

/**
 * Some KTC product codes encode a machine target in the final suffix:
 *   C5770-1    -> machine 1
 *   C5770-9    -> machine 9
 *   C5770-auto -> automatic machine
 * Codes without one of these suffixes are treated as the base/manual variant.
 */
export const getProductMachineHint = (productCode: string): { kind: "AUTO" | "NUMBER"; value: string } | null => {
    const code = normalize(productCode);
    const match = code.match(/-(AUTO|AUTOMATIC|\d+)$/i);
    if (!match) return null;
    const suffix = normalize(match[1]);
    if (suffix === "AUTO" || suffix === "AUTOMATIC") return { kind: "AUTO", value: "AUTO" };
    return { kind: "NUMBER", value: String(Number(suffix)) };
};

export const getProductFamilyCode = (productCode: string): string =>
    normalize(productCode).replace(/-(AUTO|AUTOMATIC|\d+)$/i, "");

const machineNumber = (machineCode: string): string | null => {
    const key = normalizeMachineKey(machineCode);
    return /^\d+$/.test(key) ? key : null;
};

const eligibleMachineCodes = (product: ProductStandardOption): string[] =>
    String(product.eligible_machine_codes || "")
        .split(",")
        .map(normalizeMachineKey)
        .filter(Boolean);

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
    const familyHasMachineVariant = new Set(
        products.filter((product) => getProductMachineHint(product.product_code)).map((product) => getProductFamilyCode(product.product_code))
    );

    if (mode === "MANUAL") {
        return useEncodedMachineSuffix
            ? products.filter((product) => !getProductMachineHint(product.product_code))
            : products;
    }

    const selectedMachine = normalizeMachineKey(machineCode);
    if (!selectedMachine) return [];

    const machine = (machineOptions || []).find((item) => normalizeMachineKey(item.machine_code) === selectedMachine);
    const isAutomatic = Number(machine?.is_automatic || 0) === 1;
    const selectedNumber = machineNumber(selectedMachine);

    return products.filter((product) => {
        const hint = getProductMachineHint(product.product_code);
        const mappedMachines = eligibleMachineCodes(product);
        const hasExplicitMapping = Number(product.has_machine_specific_standard || 0) === 1 || mappedMachines.length > 0;

        // The product_machine_standards relation is authoritative when it exists.
        if (hasExplicitMapping && !mappedMachines.includes(selectedMachine)) return false;

        if (useEncodedMachineSuffix) {
            if (hint?.kind === "AUTO") return isAutomatic;
            if (hint?.kind === "NUMBER") return !isAutomatic && selectedNumber !== null && hint.value === selectedNumber;

            if (familyHasMachineVariant.has(getProductFamilyCode(product.product_code))) return false;
        }

        return true;
    });
};

export const toProductAutocompleteOptions = (products: ProductStandardOption[]) => {
    const seen = new Set<string>();
    return products
        .filter((product) => {
            const key = normalize(product.product_code);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .map((product) => ({ value: product.product_code, label: product.product_code }));
};
