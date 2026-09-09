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

export const getProductFamilyCode = (productCode: unknown): string =>
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

    const machine = (machineOptions || []).find((item) => normalizeMachineKey(item.machine_code) === selectedMachine);
    const isAutomatic = isGcAutomaticMachine(machineCode) || Number(machine?.is_automatic || 0) === 1;
    const selectedNumber = machineNumber(selectedMachine);

    return products.filter((product) => {
        const hint = getProductMachineHint(product.product_code);
        const mappedMachines = eligibleMachineCodes(product);
        const hasExplicitMapping = Number(product.has_machine_specific_standard || 0) === 1 || mappedMachines.length > 0;

        // A product may have explicit machine mappings. Keep strict machine
        // scoping only when such mappings actually exist.
        if (hasExplicitMapping && mappedMachines.length > 0 && !mappedMachines.includes(selectedMachine)) return false;

        // Only GC Cắt uses encoded product suffixes. GC Lồng uses the real
        // product code and machine mapping, so 2801-LT must not be hidden.
        const isCutProduct = normalizeWorkType(product.work_type) === "CUT";
        if (useEncodedMachineSuffix && isCutProduct) {
            if (isAutomatic) return hint?.kind === "AUTO";
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
