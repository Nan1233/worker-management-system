import type { MachineOption, ProductStandardOption } from "../../services/masterDataService";

export type ProductSuggestionMode = "MANUAL" | "MACHINE";

const normalize = (value: unknown) => String(value ?? "").trim().toUpperCase();

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

const eligibleMachineCodes = (product: ProductStandardOption): string[] =>
    String(product.eligible_machine_codes || "")
        .split(",")
        .map(normalizeMachineKey)
        .filter(Boolean);

const GC_AUTOMATIC_MACHINE_CODES = new Set(["C5", "C6", "C7", "C11"]);
const GC_AUTOMATIC_ALIAS_CODES = new Set(["C2556", "C5770", "CGYX", "C3880", "C8052"]);

/** Canonical worker-facing alias for GC. Never expose legacy `-auto` labels. */
export const normalizeGcAlias = (value: unknown): string => {
    const alias = normalize(value);
    if (!alias) return "";
    const legacyAuto = alias.match(/^(?:C)?(2556|5770|GYX|3880|8052)-AUTO$/i);
    if (legacyAuto) {
        const suffix = legacyAuto[1].toUpperCase();
        return suffix === "GYX" ? "CGYX" : `C${suffix}`;
    }
    return alias;
};

/** Alias is the only worker-facing value. */
export const getProductDisplayAlias = (product: ProductStandardOption): string =>
    normalizeGcAlias(product.alias_code || product.product_code);

/** Full DB product code corresponding to a worker-facing alias. */
export const getFullProductCode = (
    productAlias: string,
    products: ProductStandardOption[],
): string => {
    const normalizedAlias = normalizeGcAlias(productAlias);
    const match = products.find((product) =>
        getProductDisplayAlias(product) === normalizedAlias
    );
    return String(match?.product_code || productAlias || "").trim();
};

const isGcCutAlias = (aliasCode: string): boolean => aliasCode.startsWith("C");
const isGcAutomaticMachine = (machineCode: unknown): boolean =>
    GC_AUTOMATIC_MACHINE_CODES.has(normalize(machineCode).replace(/\s+/g, ""));

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

    if (useEncodedMachineSuffix) {
        // GC is controlled by the alias master. Full product codes and legacy
        // `-auto` labels are never exposed in the worker dropdown.
        const canonicalProducts = products
            .map((product) => ({ product, alias: getProductDisplayAlias(product) }))
            .filter(({ alias }) => Boolean(alias));

        const cutProducts = canonicalProducts.filter(({ alias }) => isGcCutAlias(alias));
        const longProducts = canonicalProducts.filter(({ alias }) => !isGcCutAlias(alias));

        if (!selectedMachine) {
            return mode === "MANUAL" ? longProducts.map(({ product }) => product) : [];
        }

        // Cắt/Lồng is already separated by operationType/work_type before this
        // function. Lồng Tay and Lồng Máy intentionally share all Lồng aliases.
        if (longProducts.length && cutProducts.length) {
            // A machine code alone must never switch Cắt/Lồng. The scoped list
            // supplied by ProcessPage is the authoritative operation scope.
        }

        if (isGcAutomaticMachine(selectedRawMachine)) {
            return cutProducts
                .filter(({ alias }) => GC_AUTOMATIC_ALIAS_CODES.has(alias))
                .map(({ product }) => product);
        }

        // For non-automatic Cắt machines, all Cắt aliases are allowed, including
        // the five automatic aliases as requested.
        return cutProducts.map(({ product }) => product);
    }

    if (mode === "MANUAL") return products;
    if (!selectedMachine) return [];

    const machine = (machineOptions || []).find(
        (item) => normalizeMachineKey(item.machine_code) === selectedMachine
    );

    return products.filter((product) => {
        const mappedMachines = eligibleMachineCodes(product);
        const hasExplicitMapping = Number(product.has_machine_specific_standard || 0) === 1 || mappedMachines.length > 0;
        if (hasExplicitMapping && mappedMachines.length > 0 && !mappedMachines.includes(selectedMachine)) return false;

        if (Number(machine?.is_automatic || 0) === 1) {
            return hasExplicitMapping && mappedMachines.includes(selectedMachine);
        }
        return true;
    });
};

export const toProductAutocompleteOptions = (products: ProductStandardOption[]) => {
    const seen = new Set<string>();
    return products
        .map((product) => ({
            value: getProductDisplayAlias(product),
            label: getProductDisplayAlias(product),
        }))
        .filter((option) => {
            const key = normalize(option.label);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
};
