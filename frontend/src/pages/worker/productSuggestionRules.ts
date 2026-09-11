import type { MachineOption, ProductStandardOption } from "../../services/masterDataService";

export type ProductSuggestionMode = "MANUAL" | "MACHINE";

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

export const getProductMachineHint = (productCode: unknown): { kind: "AUTO" | "NUMBER"; value: string } | null => {
    const code = normalize(productCode);
    const match = code.match(/-(AUTO|AUTOMATIC|\d+)$/i);
    if (!match) return null;
    const suffix = normalize(match[1]);
    if (suffix === "AUTO" || suffix === "AUTOMATIC") return { kind: "AUTO", value: "AUTO" };
    return { kind: "NUMBER", value: String(Number(suffix)) };
};

/**
 * Canonical product family. C7630-11 and 7630 belong to the same family.
 * This is used only for matching machine-specific variants.
 */
export const getProductFamilyCode = (productCode: unknown): string =>
    normalize(productCode)
        .replace(/-(AUTO|AUTOMATIC|\d+)$/i, "")
        .replace(/^C(?=\d)/, "");

const machineNumber = (machineCode: string): string | null => {
    const key = normalizeMachineKey(machineCode);
    return /^\d+$/.test(key) ? key : null;
};

const eligibleMachineCodes = (product: ProductStandardOption): string[] =>
    String(product.eligible_machine_codes || "")
        .split(",")
        .map(normalizeMachineKey)
        .filter(Boolean);

// GC Cắt automatic machines. C7 is automatic as a MACHINE even though the
// product-code convention has no -7 suffix.
const GC_AUTOMATIC_MACHINE_CODES = new Set(["C5", "C6", "C7", "C11"]);

const isGcAutomaticMachine = (machineCode: unknown): boolean =>
    GC_AUTOMATIC_MACHINE_CODES.has(normalize(machineCode).replace(/\s+/g, ""));

// Product-code suffixes that explicitly represent automatic GC Cắt variants.
// There is deliberately no -7 variant.
const AUTO_MACHINE_SUFFIXES = new Set(["5", "6", "11"]);

/**
 * GC uses one shared worker screen for Cắt/Lồng. The worker no longer chooses
 * "Cắt/Lồng" or "Tự động/Tay/Máy". The selected machine is the source of truth
 * when a machine is entered. If the machine is blank, KTC treats the entry as
 * Lồng tay, so the product list must remain selectable from LONG master data.
 */
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
    const familyHasMachineVariant = new Set(
        products
            .filter((product) => normalizeWorkType(product.work_type) === "CUT")
            .filter((product) => getProductMachineHint(product.product_code))
            .map((product) => getProductFamilyCode(product.product_code))
    );

    if (mode === "MANUAL") {
        if (!useEncodedMachineSuffix) return products;

        // GC without a machine means Lồng tay. Only show LONG products that
        // are not tied to a specific machine/variant; do not leak Cắt or
        // machine-specific products into the manual Lồng selector.
        return products.filter((product) => {
            if (normalizeWorkType(product.work_type) !== "LONG") return false;
            const mappedMachines = eligibleMachineCodes(product);
            const hasExplicitMapping = Number(product.has_machine_specific_standard || 0) === 1 || mappedMachines.length > 0;
            if (hasExplicitMapping) return false;
            return !getProductMachineHint(product.product_code);
        });
    }

    const selectedMachine = normalizeMachineKey(machineCode);
    const selectedRawMachine = normalize(machineCode).replace(/\s+/g, "");

    // GC: blank machine is explicitly interpreted as Lồng tay. This is
    // intentionally handled here too because the GC screen uses MACHINE mode
    // for its machine workspace even before a machine has been selected.
    if (!selectedMachine && useEncodedMachineSuffix) {
        return products.filter((product) => {
            if (normalizeWorkType(product.work_type) !== "LONG") return false;
            const mappedMachines = eligibleMachineCodes(product);
            const hasExplicitMapping = Number(product.has_machine_specific_standard || 0) === 1 || mappedMachines.length > 0;
            if (hasExplicitMapping) return false;
            return !getProductMachineHint(product.product_code);
        });
    }

    if (!selectedMachine) return [];

    const machine = (machineOptions || []).find(
        (item) => normalizeMachineKey(item.machine_code) === selectedMachine
    );

    const gcWorkType = useEncodedMachineSuffix ? getGcWorkTypeForMachine(selectedRawMachine) : null;

    // For GC, C/C5/C6/C7/C11 are Cắt machines. C5/C6/C7/C11 are automatic;
    // numeric machine codes are Lồng machines. Do not trust a stale generic
    // is_automatic flag to determine the GC work type.
    const isAutomatic = useEncodedMachineSuffix
        ? isGcAutomaticMachine(selectedRawMachine)
        : Number(machine?.is_automatic || 0) === 1;
    const selectedNumber = machineNumber(selectedMachine);

    return products.filter((product) => {
        const hint = getProductMachineHint(product.product_code);
        const mappedMachines = eligibleMachineCodes(product);
        const hasExplicitMapping = Number(product.has_machine_specific_standard || 0) === 1 || mappedMachines.length > 0;
        const productWorkType = normalizeWorkType(product.work_type);

        // GC must first respect the work type implied by the selected machine.
        // This is the key guard against Lồng products leaking into Cắt and vice versa.
        if (useEncodedMachineSuffix && gcWorkType && productWorkType !== gcWorkType) return false;

        // Explicit machine mappings are authoritative. If a product is mapped
        // to machines, never show it for another machine even if its code looks
        // like a generic/base product.
        if (hasExplicitMapping && mappedMachines.length > 0 && !mappedMachines.includes(selectedMachine)) {
            return false;
        }

        if (useEncodedMachineSuffix && gcWorkType === "CUT") {
            if (isAutomatic) {
                // Automatic variants are -AUTO plus matching numeric variants.
                // Base Cắt products remain valid when they have no explicit
                // machine mapping; the work type already guarantees Cắt scope.
                if (hint?.kind === "AUTO") return true;
                if (hint?.kind === "NUMBER") {
                    return AUTO_MACHINE_SUFFIXES.has(hint.value)
                        && selectedNumber !== null
                        && hint.value === selectedNumber;
                }
                return true;
            }

            // Machine C (non-auto) and other non-automatic Cắt machines do not
            // use automatic variants. Other numeric suffixes are only valid when
            // they explicitly target the selected machine.
            if (hint?.kind === "AUTO") return false;
            if (hint?.kind === "NUMBER") {
                if (AUTO_MACHINE_SUFFIXES.has(hint.value)) return false;
                return selectedNumber !== null && hint.value === selectedNumber;
            }

            if (familyHasMachineVariant.has(getProductFamilyCode(product.product_code))) return true;
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
