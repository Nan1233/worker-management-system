import type { MachineOption, ProductStandardOption } from "../../services/masterDataService";

export type ProductSuggestionMode = "MANUAL" | "MACHINE";
export type ProductCodeFamily = "CUT_AUTO" | "CUT" | "LONG_MACHINE" | "LONG";

const normalize = (value: unknown) => String(value ?? "").trim().toUpperCase();

/** Canonical machine key used only for matching master-data relations. */
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

/**
 * Canonical KTC product-code classification.
 *
 * Rules for the GC Cắt/Lồng screen:
 *   - Cắt tự động: product code ends with -AUTO / -AUTOMATIC
 *   - Cắt thường: product code starts with C + digit and is not automatic
 *   - Lồng máy: product code ends with -M
 *   - Lồng: product code ends with -L
 *   - Other non-Cắt codes remain Lồng for backward compatibility.
 *
 * This function is intentionally based on product_code, not work_type from a
 * stale master-data row, so the worker selector and persisted product_code use
 * the same canonical convention.
 */
export const classifyProductCode = (productCode: unknown): ProductCodeFamily => {
    const code = normalize(productCode).replace(/\s+/g, "");
    if (!code) return "LONG";
    if (/-AUTO(?:MATIC)?$/i.test(code)) return "CUT_AUTO";
    if (/^C\d/.test(code)) return "CUT";
    if (/-M$/i.test(code)) return "LONG_MACHINE";
    if (/-L$/i.test(code)) return "LONG";
    return "LONG";
};

export const isCutProductCode = (productCode: unknown): boolean => {
    const family = classifyProductCode(productCode);
    return family === "CUT" || family === "CUT_AUTO";
};

export const isAutomaticCutProductCode = (productCode: unknown): boolean =>
    classifyProductCode(productCode) === "CUT_AUTO";

export const isMachineLongProductCode = (productCode: unknown): boolean =>
    classifyProductCode(productCode) === "LONG_MACHINE";

export const getProductMachineHint = (productCode: unknown): { kind: "AUTO" | "NUMBER"; value: string } | null => {
    const code = normalize(productCode);
    const match = code.match(/-(AUTO|AUTOMATIC|\d+)$/i);
    if (!match) return null;
    const suffix = normalize(match[1]);
    if (suffix === "AUTO" || suffix === "AUTOMATIC") return { kind: "AUTO", value: "AUTO" };
    return { kind: "NUMBER", value: String(Number(suffix)) };
};

/** Canonical product family used only for matching machine-specific variants. */
export const getProductFamilyCode = (productCode: unknown): string =>
    normalize(productCode)
        .replace(/-(AUTO|AUTOMATIC|\d+)$/i, "")
        .replace(/-M$/i, "")
        .replace(/^C(?=\d)/, "");

const eligibleMachineCodes = (product: ProductStandardOption): string[] =>
    String(product.eligible_machine_codes || "")
        .split(",")
        .map(normalizeMachineKey)
        .filter(Boolean);

// GC Cắt automatic machines.
const GC_AUTOMATIC_MACHINE_CODES = new Set(["C5", "C6", "C7", "C11"]);

const isGcAutomaticMachine = (machineCode: unknown): boolean =>
    GC_AUTOMATIC_MACHINE_CODES.has(normalize(machineCode).replace(/\s+/g, ""));

/** GC shared Cắt/Lồng screen: selected machine remains the machine source of truth. */
const getGcWorkTypeForMachine = (machineCode: unknown): "CUT" | "LONG" | null => {
    const key = normalize(machineCode).replace(/\s+/g, "");
    if (!key) return null;
    if (key === "C" || /^C\d+$/.test(key)) return "CUT";
    if (/^\d+$/.test(normalizeMachineKey(key))) return "LONG";
    return null;
};

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
    const machine = (machineOptions || []).find(
        (item) => normalizeMachineKey(item.machine_code) === selectedMachine
    );
    const gcWorkType = useEncodedMachineSuffix ? getGcWorkTypeForMachine(selectedRawMachine) : null;
    const isAutomatic = useEncodedMachineSuffix
        ? isGcAutomaticMachine(selectedRawMachine)
        : Number(machine?.is_automatic || 0) === 1;

    // Non-GC processes keep their master-data work_type/machine mapping rules.
    if (!useEncodedMachineSuffix) {
        if (mode === "MANUAL") return products;
        if (!selectedMachine) return [];
        return products.filter((product) => {
            const mappedMachines = eligibleMachineCodes(product);
            const hasExplicitMapping = Number(product.has_machine_specific_standard || 0) === 1 || mappedMachines.length > 0;
            if (hasExplicitMapping && mappedMachines.length > 0 && !mappedMachines.includes(selectedMachine)) return false;
            return true;
        });
    }

    // GC without a machine = Lồng tay. Only canonical LONG codes are shown.
    if (!selectedMachine) {
        return products.filter((product) => classifyProductCode(product.product_code) === "LONG");
    }

    return products.filter((product) => {
        const code = String(product.product_code || "").trim();
        const family = classifyProductCode(code);
        const mappedMachines = eligibleMachineCodes(product);
        const hasExplicitMapping = Number(product.has_machine_specific_standard || 0) === 1 || mappedMachines.length > 0;

        // Explicit machine mappings always win over code inference.
        if (hasExplicitMapping && mappedMachines.length > 0 && !mappedMachines.includes(selectedMachine)) {
            return false;
        }

        // Selected C machine = Cắt.
        if (gcWorkType === "CUT") {
            // Cắt tự động: CHỈ mã kết thúc bằng -AUTO/-AUTOMATIC.
            if (isAutomatic) return family === "CUT_AUTO";

            // Cắt không tự động: CHỈ mã C + số và KHÔNG có -AUTO.
            return family === "CUT";
        }

        // Numeric machine = Lồng. -M means Lồng máy; -L means Lồng.
        // Other non-Cut codes remain Lồng for backward compatibility.
        if (gcWorkType === "LONG") {
            if (family === "CUT" || family === "CUT_AUTO") return false;
            return true;
        }

        return false;
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
