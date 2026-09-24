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

/** Exactly the five automatic cutting aliases required by the authoritative GC list. */
const GC_AUTOMATIC_ALIAS_CODES = new Set([
    "C2556",
    "C5770",
    "CGYX",
    "C3880",
    "C8052",
]);

const getGcAlias = (product: ProductStandardOption): string =>
    normalize(product.alias_code);

const isGcCutAlias = (aliasCode: string): boolean => aliasCode.startsWith("C");

/**
 * GC uses one authoritative encoded-code list for the worker UI:
 * - C-prefixed aliases = Cắt
 * - non-C aliases = Lồng
 *
 * The underlying product_code is deliberately retained as the option value so
 * standard resolution and report storage continue to use the backend product.
 * The UI label is alias_code only; legacy `-AUTO` is never displayed.
 */
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

    // GC is now driven by product_aliases, not by legacy product_code suffixes.
    // This prevents stale C502/127-T/etc. master rows from leaking into the UI.
    if (useEncodedMachineSuffix) {
        const aliasedProducts = products.filter((product) => Boolean(getGcAlias(product)));
        if (!aliasedProducts.length) return [];

        const cutProducts = aliasedProducts.filter((product) => isGcCutAlias(getGcAlias(product)));
        const longProducts = aliasedProducts.filter((product) => !isGcCutAlias(getGcAlias(product)));

        if (mode === "MANUAL") {
            return longProducts;
        }

        if (!selectedMachine) return [];

        const gcWorkType = normalize(selectedRawMachine).startsWith("C") ? "CUT" : "LONG";
        if (gcWorkType === "LONG") {
            // Lồng Tay and Lồng Máy intentionally use the same authoritative
            // non-C alias list; machine-specific legacy filtering is not used.
            return longProducts;
        }

        // Both automatic and non-automatic Cắt machines use encoded aliases.
        // Automatic machines are restricted to exactly the five required codes.
        if (isGcAutomaticMachine(selectedRawMachine)) {
            return cutProducts.filter((product) => GC_AUTOMATIC_ALIAS_CODES.has(getGcAlias(product)));
        }

        // Non-automatic Cắt still keeps the same five automatic aliases, plus
        // every other authoritative C-prefixed cutting alias.
        return cutProducts;
    }

    if (mode === "MANUAL") return products;
    if (!selectedMachine) return [];

    const machine = (machineOptions || []).find(
        (item) => normalizeMachineKey(item.machine_code) === selectedMachine
    );
    const selectedNumber = machineNumber(selectedRawMachine);

    return products.filter((product) => {
        const hint = getProductMachineHint(product.product_code);
        const mappedMachines = eligibleMachineCodes(product);
        const hasExplicitMapping = Number(product.has_machine_specific_standard || 0) === 1 || mappedMachines.length > 0;
        const productWorkType = normalizeWorkType(product.work_type);
        if (hasExplicitMapping && mappedMachines.length > 0 && !mappedMachines.includes(selectedMachine)) return false;

        if (Number(machine?.is_automatic || 0) === 1) {
            if (hint?.kind === "AUTO") return true;
            if (hint?.kind === "NUMBER") {
                return selectedNumber !== null && hint.value === selectedNumber;
            }
            return hasExplicitMapping && mappedMachines.includes(selectedMachine);
        }

        if (hint?.kind === "NUMBER") {
            return selectedNumber !== null && hint.value === selectedNumber;
        }
        return productWorkType !== "";
    });
};

const displayAlias = (product: ProductStandardOption): string => {
    const explicitAlias = String(product.alias_code ?? "").trim();
    if (explicitAlias) return explicitAlias;
    return String(product.product_code ?? "").trim();
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
