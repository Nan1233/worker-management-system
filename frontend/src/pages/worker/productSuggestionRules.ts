import type { MachineOption, ProductStandardOption } from "../../services/masterDataService";

export type ProductSuggestionMode = "MANUAL" | "MACHINE";
export type ProductCodeFamily = "CUT_AUTO" | "CUT" | "LONG_MACHINE" | "LONG";

const normalize = (value: unknown) => String(value ?? "").trim().toUpperCase();

/** Canonical GC product-code groups used by the test branch. */
const GC_CUT_PRODUCT_CODES = new Set(["CAT01", "CAT02", "CAT03", "CAT04"]);
const GC_LONG_PRODUCT_CODES = new Set(["LONG01", "LONG02"]);

/**
 * Returns the GC operation represented by a product code when the master row
 * does not provide work_type. Explicit master work_type remains authoritative.
 */
export const getGcProductWorkType = (productCode: unknown): "CUT" | "LONG" | null => {
    const code = normalize(productCode).replace(/\s+/g, "");
    if (GC_CUT_PRODUCT_CODES.has(code)) return "CUT";
    if (GC_LONG_PRODUCT_CODES.has(code)) return "LONG";
    if (/^CAT\d+$/.test(code)) return "CUT";
    if (/^LONG\d+$/.test(code)) return "LONG";
    return null;
};

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
 * Canonical product-code classification used only as a legacy fallback.
 *
 * IMPORTANT: for GC Cắt/Lồng selection, product.work_type from master data is
 * the source of truth when present. Product-code inference is used only when
 * work_type is empty, including the explicit CAT01–CAT04 / LONG01–LONG02 test
 * groups.
 */
export const classifyProductCode = (productCode: unknown): ProductCodeFamily => {
    const code = normalize(productCode).replace(/\s+/g, "");
    if (!code) return "LONG";
    if (/(?:-AUTO|-AUTOMATIC|-5|-6|-7|-11)$/i.test(code)) return "CUT_AUTO";
    if (/^CAT\d+$/.test(code) || /^C\d/.test(code)) return "CUT";
    if (/-M$/i.test(code)) return "LONG_MACHINE";
    if (/^LONG\d+$/.test(code) || /-L$/i.test(code)) return "LONG";
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

/**
 * Resolve the GC operation from the selected machine.
 * C* machines are Cắt; numeric machines are Lồng.
 * The actual product split is still taken from product.work_type below.
 */
const getGcWorkTypeForMachine = (machineCode: unknown): "CUT" | "LONG" | null => {
    const key = normalize(machineCode).replace(/\s+/g, "");
    if (!key) return null;
    if (key === "C" || /^C\d+$/.test(key)) return "CUT";
    if (/^\d+$/.test(normalizeMachineKey(key))) return "LONG";
    return null;
};

const matchesGcWorkType = (product: ProductStandardOption, operation: "CUT" | "LONG"): boolean => {
    const masterWorkType = normalizeWorkType(product.work_type);
    if (masterWorkType === operation) return true;

    // When work_type is empty, use the explicit test-branch product groups:
    // CAT01/CAT02/CAT03/CAT04 => Cắt; LONG01/LONG02 => Lồng.
    if (!masterWorkType) {
        const inferred = getGcProductWorkType(product.product_code);
        if (inferred) return inferred === operation;

        const family = classifyProductCode(product.product_code);
        return operation === "CUT"
            ? family === "CUT" || family === "CUT_AUTO"
            : family === "LONG" || family === "LONG_MACHINE";
    }

    return false;
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

    // GC manual Lồng: no machine is valid. The process-scope filter has already
    // selected LONG rows, but keep the work_type/code guard here as a boundary.
    if (!selectedMachine) {
        if (mode === "MACHINE") return [];
        return products.filter((product) => matchesGcWorkType(product, "LONG"));
    }

    return products.filter((product) => {
        const mappedMachines = eligibleMachineCodes(product);
        const hasExplicitMapping = Number(product.has_machine_specific_standard || 0) === 1 || mappedMachines.length > 0;

        if (hasExplicitMapping && mappedMachines.length > 0 && !mappedMachines.includes(selectedMachine)) {
            return false;
        }

        if (gcWorkType) {
            if (!matchesGcWorkType(product, gcWorkType)) return false;
        } else {
            return false;
        }

        // For automatic Cắt machines, machine-specific numeric product suffixes
        // remain constrained to their corresponding machine. Generic -AUTO rows
        // can be used by all GC automatic Cắt machines.
        if (gcWorkType === "CUT" && isAutomatic) {
            const hint = getProductMachineHint(product.product_code);
            if (hint?.kind === "NUMBER") {
                return hint.value === selectedMachine.replace(/^C/, "");
            }
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
