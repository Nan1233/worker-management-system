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
 * Lồng-specific suffix convention:
 *   -M          = Lồng Máy
 *   -LT/-L/-T   = Lồng Tay
 *   no suffix   = usable for both Tay and Máy
 */
type LongHandling = "MACHINE" | "MANUAL" | "BOTH";

const getLongHandling = (productCode: unknown): LongHandling => {
    const code = normalize(productCode);
    if (/-M$/i.test(code)) return "MACHINE";
    if (/(?:-LT|-L|-T)$/i.test(code)) return "MANUAL";
    return "BOTH";
};

/**
 * Canonical product family. Machine/handling suffixes are stripped only for
 * family matching; the original product code remains unchanged for display.
 */
export const getProductFamilyCode = (productCode: unknown): string =>
    normalize(productCode)
        .replace(/-(AUTO|AUTOMATIC|\d+)$/i, "")
        .replace(/(?:-LT|-L|-T|-M)$/i, "")
        .replace(/^C(?=\d)/, "");

/** Extract the physical machine number from both `C5` and `5` forms. */
const machineNumber = (machineCode: string): string | null => {
    const raw = normalize(machineCode).replace(/\s+/g, "");
    const cNumber = raw.match(/^C(\d{1,2})$/);
    if (cNumber) return String(Number(cNumber[1]));

    const key = normalizeMachineKey(raw);
    return /^\d+$/.test(key) ? key : null;
};

const eligibleMachineCodes = (product: ProductStandardOption): string[] =>
    String(product.eligible_machine_codes || "")
        .split(",")
        .map(normalizeMachineKey)
        .filter(Boolean);

// GC Cắt automatic machines.
// C7 is automatic even though there is no `-7` product-code variant.
const GC_AUTOMATIC_MACHINE_CODES = new Set(["C5", "C6", "C7", "C11"]);

const isGcAutomaticMachine = (machineCode: unknown): boolean =>
    GC_AUTOMATIC_MACHINE_CODES.has(normalize(machineCode).replace(/\s+/g, ""));

// Explicit numeric suffixes used by automatic GC Cắt variants.
// There is deliberately no -7 variant: C7 uses the generic `-auto` variant.
const AUTO_MACHINE_SUFFIXES = new Set(["5", "6", "11"]);

/**
 * GC uses one shared worker screen for Cắt/Lồng. The selected machine is the
 * source of truth for filtering the product master data.
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

    const selectedMachine = normalizeMachineKey(machineCode);
    const selectedRawMachine = normalize(machineCode).replace(/\s+/g, "");

    if (useEncodedMachineSuffix) {
        const longProducts = products.filter(
            (product) => normalizeWorkType(product.work_type) === "LONG"
        );

        if (longProducts.length > 0) {
            if (mode === "MANUAL") {
                return longProducts.filter((product) => {
                    const handling = getLongHandling(product.product_code);
                    return handling === "MANUAL" || handling === "BOTH";
                });
            }

            if (!selectedMachine) {
                return longProducts.filter((product) => {
                    const handling = getLongHandling(product.product_code);
                    return handling === "MACHINE" || handling === "BOTH";
                });
            }

            return longProducts.filter((product) => {
                const handling = getLongHandling(product.product_code);
                if (handling !== "MACHINE" && handling !== "BOTH") return false;

                const mappedMachines = eligibleMachineCodes(product);
                const hasExplicitMapping = Number(product.has_machine_specific_standard || 0) === 1 || mappedMachines.length > 0;
                if (hasExplicitMapping && mappedMachines.length > 0 && !mappedMachines.includes(selectedMachine)) {
                    return false;
                }
                return true;
            });
        }
    }

    if (mode === "MANUAL") {
        return products;
    }

    if (!selectedMachine) return [];

    const machine = (machineOptions || []).find(
        (item) => normalizeMachineKey(item.machine_code) === selectedMachine
    );

    const gcWorkType = useEncodedMachineSuffix ? getGcWorkTypeForMachine(selectedRawMachine) : null;
    const isAutomatic = useEncodedMachineSuffix
        ? isGcAutomaticMachine(selectedRawMachine)
        : Number(machine?.is_automatic || 0) === 1;
    const selectedNumber = machineNumber(selectedRawMachine);

    return products.filter((product) => {
        const hint = getProductMachineHint(product.product_code);
        const mappedMachines = eligibleMachineCodes(product);
        const hasExplicitMapping = Number(product.has_machine_specific_standard || 0) === 1 || mappedMachines.length > 0;
        const productWorkType = normalizeWorkType(product.work_type);

        if (useEncodedMachineSuffix && gcWorkType && productWorkType !== gcWorkType) return false;

        if (hasExplicitMapping && mappedMachines.length > 0 && !mappedMachines.includes(selectedMachine)) {
            return false;
        }

        if (useEncodedMachineSuffix && gcWorkType === "CUT") {
            if (isAutomatic) {
                if (hint?.kind === "AUTO") return true;
                if (hint?.kind === "NUMBER") {
                    return AUTO_MACHINE_SUFFIXES.has(hint.value)
                        && selectedNumber !== null
                        && hint.value === selectedNumber;
                }
                return hasExplicitMapping && mappedMachines.includes(selectedMachine);
            }

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

/**
 * Autocomplete displays the encoded/alias code only. The underlying value
 * remains the canonical full product_code so report submission and standard
 * resolution continue to use the existing master-data key.
 */
export const toProductAutocompleteOptions = (products: ProductStandardOption[]) => {
    const seen = new Set<string>();
    return products
        .filter((product) => {
            const alias = String(product.alias_code ?? "").trim();
            const productCode = String(product.product_code ?? "").trim();
            const key = normalize(alias || productCode);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .map((product) => {
            const alias = String(product.alias_code ?? "").trim();
            const productCode = String(product.product_code ?? "").trim();
            return {
                value: productCode,
                label: alias || productCode,
            };
        });
};
