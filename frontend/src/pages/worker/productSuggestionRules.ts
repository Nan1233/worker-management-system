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
 * Machine-specific Cắt variants may be written as C7630-11 while the base
 * product in the master list is 7630. Treat the optional leading C as the
 * same family so the base product is not hidden on normal machines.
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

// Canonical GC Cắt automatic machines from the factory sample/rules.
// Machine 7 IS an automatic machine, but there is deliberately NO "-7"
// automatic product suffix. Product suffixes are handled separately below.
const GC_AUTOMATIC_MACHINE_CODES = new Set(["5", "6", "7", "11"]);

const isGcAutomaticMachine = (machineCode: unknown): boolean =>
    GC_AUTOMATIC_MACHINE_CODES.has(normalizeMachineKey(machineCode));

// Product-code suffixes that explicitly represent automatic GC Cắt machines.
// Do NOT add -7: machine 7 is automatic, but the sample has no -7 rule.
const AUTO_MACHINE_SUFFIXES = new Set(["5", "6", "11"]);

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
        // Product scope is already separated by GC Cắt/Lồng via work_type.
        // Do not special-case 2801-LT here: it is a valid Lồng product and
        // must remain selectable in all Lồng modes.
        return products.filter((product) => useEncodedMachineSuffix
            ? normalizeWorkType(product.work_type) !== "CUT" || !getProductMachineHint(product.product_code)
            : true);
    }

    const selectedMachine = normalizeMachineKey(machineCode);
    if (!selectedMachine) return [];

    const machine = (machineOptions || []).find(
        (item) => normalizeMachineKey(item.machine_code) === selectedMachine
    );

    // For GC Cắt, the factory rule is canonical: 5/6/7/11 are automatic.
    // Do not trust a stale/incorrect is_automatic flag in the machine master
    // to turn another machine (for example 10) into an automatic machine.
    // Other processes still use the machine master's is_automatic flag.
    const isAutomatic = useEncodedMachineSuffix
        ? isGcAutomaticMachine(machineCode)
        : Number(machine?.is_automatic || 0) === 1;
    const selectedNumber = machineNumber(selectedMachine);

    return products.filter((product) => {
        const hint = getProductMachineHint(product.product_code);
        const mappedMachines = eligibleMachineCodes(product);
        const hasExplicitMapping = Number(product.has_machine_specific_standard || 0) === 1 || mappedMachines.length > 0;
        const isCutProduct = normalizeWorkType(product.work_type) === "CUT";

        // Only GC Cắt uses encoded product suffixes. Apply this rule before
        // generic machine mapping so a base product such as 7630 remains
        // available on normal machines even when its machine-specific sibling
        // (for example C7630-11) has an explicit mapping.
        if (useEncodedMachineSuffix && isCutProduct) {
            if (isAutomatic) {
                // Automatic variants are ONLY -AUTO, -5, -6 and -11.
                // A numeric suffix is valid only for its matching automatic machine.
                if (hint?.kind === "AUTO") return true;
                if (hint?.kind === "NUMBER") {
                    return AUTO_MACHINE_SUFFIXES.has(hint.value)
                        && selectedNumber !== null
                        && hint.value === selectedNumber;
                }
                return false;
            }

            // All other machines are non-automatic. They never use -AUTO,
            // -5, -6 or -11 variants. A normal numeric suffix is allowed only
            // when it explicitly targets the selected non-automatic machine.
            if (hint?.kind === "AUTO") return false;
            if (hint?.kind === "NUMBER") {
                if (AUTO_MACHINE_SUFFIXES.has(hint.value)) return false;
                return selectedNumber !== null && hint.value === selectedNumber;
            }

            // A base product with a machine-specific sibling is the normal
            // machine form (7630 ↔ C7630-11, 5770 ↔ C5770-auto, ...).
            if (familyHasMachineVariant.has(getProductFamilyCode(product.product_code))) return true;
        }

        // A product may have explicit machine mappings. Keep strict machine
        // scoping only when such mappings actually exist.
        if (hasExplicitMapping && mappedMachines.length > 0 && !mappedMachines.includes(selectedMachine)) return false;

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
