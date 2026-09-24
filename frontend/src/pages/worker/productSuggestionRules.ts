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

type LongHandling = "MACHINE" | "MANUAL" | "BOTH";

const getLongHandling = (productCode: unknown): LongHandling => {
    const code = normalize(productCode);
    if (/-M$/i.test(code)) return "MACHINE";
    if (/(?:-LT|-L|-T)$/i.test(code)) return "MANUAL";
    return "BOTH";
};

export const getProductFamilyCode = (productCode: unknown): string =>
    normalize(productCode)
        .replace(/-(AUTO|AUTOMATIC|\d+)$/i, "")
        .replace(/(?:-LT|-L|-T|-M)$/i, "")
        .replace(/^C(?=\d)/, "");

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

const GC_AUTOMATIC_MACHINE_CODES = new Set(["C5", "C6", "C7", "C11"]);
const isGcAutomaticMachine = (machineCode: unknown): boolean =>
    GC_AUTOMATIC_MACHINE_CODES.has(normalize(machineCode).replace(/\s+/g, ""));

const AUTO_MACHINE_SUFFIXES = new Set(["5", "6", "11"]);

/** These five legacy GC products must remain selectable on both automatic and non-automatic cutting machines. */
const LEGACY_GC_AUTO_CODES = new Set([
    "C2556-AUTO",
    "C5770-AUTO",
    "CGYX-AUTO",
    "C3880-AUTO",
    "C8052-AUTO",
]);

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
        const longProducts = products.filter((product) => normalizeWorkType(product.work_type) === "LONG");
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
                if (hasExplicitMapping && mappedMachines.length > 0 && !mappedMachines.includes(selectedMachine)) return false;
                return true;
            });
        }
    }

    if (mode === "MANUAL") return products;
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
        if (hasExplicitMapping && mappedMachines.length > 0 && !mappedMachines.includes(selectedMachine)) return false;

        if (useEncodedMachineSuffix && gcWorkType === "CUT") {
            if (isAutomatic) {
                if (hint?.kind === "AUTO") return true;
                if (hint?.kind === "NUMBER") {
                    return AUTO_MACHINE_SUFFIXES.has(hint.value) && selectedNumber !== null && hint.value === selectedNumber;
                }
                return hasExplicitMapping && mappedMachines.includes(selectedMachine);
            }
            // The five legacy AUTO products are also valid on non-automatic cutting machines.
            // Keep their canonical `-AUTO` product_code internally; the autocomplete layer
            // displays only the encoded alias (e.g. C2556), never the `-AUTO` suffix.
            if (hint?.kind === "AUTO") return LEGACY_GC_AUTO_CODES.has(normalize(product.product_code));
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
 * Only the five legacy GC automatic products use a UI-only `-auto` code.
 * Keep their canonical product_code as the option value, but display exactly
 * the encoded code requested by the production list.
 */
const LEGACY_GC_AUTO_DISPLAY: Record<string, string> = {
    "C2556-AUTO": "C2556",
    "C5770-AUTO": "C5770",
    "CGYX-AUTO": "CGYX",
    "C3880-AUTO": "C3880",
    "C8052-AUTO": "C8052",
};

const displayAlias = (product: ProductStandardOption): string => {
    const explicitAlias = String(product.alias_code ?? "").trim();
    if (explicitAlias) return explicitAlias;

    const productCode = String(product.product_code ?? "").trim();
    const legacyAutoDisplay = LEGACY_GC_AUTO_DISPLAY[normalize(productCode)];
    return legacyAutoDisplay ?? productCode;
};

export const toProductAutocompleteOptions = (products: ProductStandardOption[]) => {
    const seen = new Set<string>();
    return products
        .filter((product) => {
            const label = displayAlias(product);
            const key = normalize(label);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .map((product) => ({
            value: String(product.product_code ?? "").trim(),
            label: displayAlias(product),
        }));
};