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

export const normalizeWorkType = (value: unknown): string => {
    const code = normalize(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (["CUT", "CAT", "CAT"].includes(code)) return "CUT";
    if (["LONG", "LNG", "LONG"].includes(code)) return "LONG";
    return code;
};

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

// GC automatic machines are explicitly C5/C6/C7/C11.
const GC_AUTOMATIC_MACHINE_CODES = new Set(["C5", "C6", "C7", "C11"]);

const isGcAutomaticMachine = (machineCode: unknown): boolean =>
    GC_AUTOMATIC_MACHINE_CODES.has(normalize(machineCode));

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
    const isAutomatic = isGcAutomaticMachine(machineCode) || Number(machine?.is_automatic || 0) === 1;
    const selectedNumber = machineNumber(selectedMachine);

    return products.filter((product) => {
        const hint = getProductMachineHint(product.product_code);
        const mappedMachines = eligibleMachineCodes(product);
        const hasExplicitMapping = Number(product.has_machine_specific_standard || 0) === 1 || mappedMachines.length > 0;

        if (hasExplicitMapping && !mappedMachines.includes(selectedMachine)) return false;

        if (useEncodedMachineSuffix) {
            // Automatic machine => ONLY -AUTO products.
            if (isAutomatic) return hint?.kind === "AUTO";

            // Non-automatic machine => NEVER an -AUTO product.
            if (hint?.kind === "AUTO") return false;
            if (hint?.kind === "NUMBER") return selectedNumber !== null && hint.value === selectedNumber;

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