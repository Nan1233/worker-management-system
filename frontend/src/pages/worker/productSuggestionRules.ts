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
    if (["CUT", "CAT", "CAT"].includes(code)) return "CUT";
    if (["LONG", "LNG", "LONG"].includes(code)) return "LONG";
    return code;
};

/**
 * Product suffixes are names, not machine numbers.
 * Only the explicit -auto suffix has machine-selection meaning for Cắt.
 * Examples:
 *   C5770-11   -> normal product code; NOT machine 11
 *   C5770-5    -> normal product code; NOT machine 5
 *   C5770-auto -> automatic cutting product code
 */
export const getProductMachineHint = (productCode: string): { kind: "AUTO"; value: "AUTO" } | null => {
    const code = normalize(productCode);
    const match = code.match(/-(AUTO|AUTOMATIC)$/i);
    if (!match) return null;
    return { kind: "AUTO", value: "AUTO" };
};

export const getProductFamilyCode = (productCode: string): string =>
    normalize(productCode).replace(/-(AUTO|AUTOMATIC)$/i, "");

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
    const workTypes = new Set(products.map((product) => normalizeWorkType(product.work_type)).filter(Boolean));
    const isCutSelection = workTypes.has("CUT");
    const selectedMachine = normalizeMachineKey(machineCode);
    const machine = (machineOptions || []).find((item) => normalizeMachineKey(item.machine_code) === selectedMachine);
    const isAutomaticMachine = Number(machine?.is_automatic || 0) === 1;

    // Suffix rules are intentionally applied ONLY to Cắt.
    // Lồng tay / máy / khí do not interpret -5, -6, -7, -11 or -auto as machine numbers.
    if (!useEncodedMachineSuffix || !isCutSelection) {
        if (mode === "MANUAL") return products;

        if (!selectedMachine) return [];
        return products.filter((product) => {
            const mappedMachines = eligibleMachineCodes(product);
            const hasExplicitMapping = Number(product.has_machine_specific_standard || 0) === 1 || mappedMachines.length > 0;
            return !hasExplicitMapping || mappedMachines.includes(selectedMachine);
        });
    }

    return products.filter((product) => {
        const hint = getProductMachineHint(product.product_code);
        const mappedMachines = eligibleMachineCodes(product);
        const hasExplicitMapping = Number(product.has_machine_specific_standard || 0) === 1 || mappedMachines.length > 0;

        // Cắt tự động: ONLY -auto. Any automatic machine can call the same -auto code.
        if (mode === "MACHINE" && isAutomaticMachine) {
            if (hint?.kind !== "AUTO") return false;
            return true;
        }

        // Cắt không tự động (including Tay): -auto is hidden.
        if (hint?.kind === "AUTO") return false;

        // Numeric suffixes are ordinary product names and never select a machine.
        if (mode === "MACHINE" && hasExplicitMapping && !mappedMachines.includes(selectedMachine)) return false;
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
