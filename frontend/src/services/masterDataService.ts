import api from "./api";
import { gcWorkTypeOfMachine, type GcWorkType } from "./gcMachineWorkType";

export interface MachineOption {
    id: number;
    process_id: number;
    machine_code: string;
    machine_name: string;
    is_automatic?: number;
    max_workers_per_machine?: number;
    output_basis?: "MACHINE" | "PRODUCT";
    /** Cắt/Lồng type from the machine master (migration 059); null when not configured. */
    gc_work_type?: "CUT" | "LONG" | string | null;
}

export interface ProductStandardOption {
    id: number;
    process_id: number;
    process_code?: string;
    work_type: string;
    product_code: string;
    has_machine_specific_standard?: number;
    eligible_machine_codes?: string;
    standard_output: number;
}

export const getMachinesByProcess = async (processId: number): Promise<MachineOption[]> => {
    const response = await api.get("/machines", { params: { process_id: processId } });
    const payload = response.data?.data ?? response.data;
    return Array.isArray(payload) ? payload : [];
};

const PROCESS_PRODUCT_CACHE_TTL_MS = 30_000;
const processProductRowsCache = new Map<number, { expiresAt: number; rows: ProductStandardOption[] }>();

export const getProductStandardsByProcess = async (processId: number, _processCode?: string): Promise<ProductStandardOption[]> => {
    // The process ID is the canonical selector. Do not merge process_id and
    // process_code responses: that can duplicate rows and silently replace a
    // product's real standard with the highest value from another row.
    const response = await api.get("/product-standards", { params: { process_id: processId } });
    const payload = response.data?.data ?? response.data;
    const sourceRows = Array.isArray(payload) ? payload as ProductStandardOption[] : [];

    // The API already returns active master data. Keep each DB row/alias distinct
    // and preserve its own work_type + standard_output without guessing a winner.
    const uniqueRows = new Map<string, ProductStandardOption>();
    for (const row of sourceRows) {
        if (!row || !String(row.product_code || "").trim()) continue;
        const key = [
            Number(row.id || 0),
            String(row.product_code || "").trim().toUpperCase(),
            String(row.work_type || "").trim().toUpperCase(),
        ].join("|");
        if (!uniqueRows.has(key)) uniqueRows.set(key, row);
    }

    const rows = Array.from(uniqueRows.values());
    processProductRowsCache.set(Number(processId), { expiresAt: Date.now() + PROCESS_PRODUCT_CACHE_TTL_MS, rows });
    return rows;
};

export interface ResolvedProductStandard {
    product_standard_id: number;
    process_id: number;
    product_code: string;
    machine_id: number | null;
    machine_code: string;
    standard_time_seconds: number | null;
    machine_standard_output: number | null;
    default_standard_output: number;
    resolved_output_per_hour: number;
    standard_source: "MACHINE" | "DEFAULT";
}

const processProductCache = new Map<number, { expiresAt: number; codes: Set<string> }>();

const getCachedProcessProductRows = async (processId: number): Promise<ProductStandardOption[]> => {
    const now = Date.now();
    const rowsCache = processProductRowsCache.get(Number(processId));
    if (rowsCache && rowsCache.expiresAt > now) return rowsCache.rows;
    const response = await api.get("/product-standards", { params: { process_id: processId } });
    const payload = response.data?.data ?? response.data;
    const rows = Array.isArray(payload) ? payload as ProductStandardOption[] : [];
    processProductRowsCache.set(Number(processId), { expiresAt: now + PROCESS_PRODUCT_CACHE_TTL_MS, rows });
    return rows;
};

const getAutomaticAliasProduct = async (processId: number, machineCode: string, productCode: string, rows: ProductStandardOption[]): Promise<ProductStandardOption | undefined> => {
    if (Number(processId) !== 1) return undefined;
    const normalizedMachine = String(machineCode || "").trim().toUpperCase();
    if (!normalizedMachine) return undefined;
    const machines = await getMachinesByProcess(processId);
    const machine = machines.find((item) => String(item.machine_code || "").trim().toUpperCase() === normalizedMachine);
    if (Number(machine?.is_automatic || 0) !== 1) return undefined;
    const normalizedProduct = String(productCode || "").trim().toUpperCase();
    if (!normalizedProduct || /-AUTO$/.test(normalizedProduct)) return undefined;
    const autoCode = `${normalizedProduct}-AUTO`;
    return rows.find((row) => String(row?.product_code || "").trim().toUpperCase() === autoCode && Number(row?.standard_output) > 0);
};

const hasExactProcessProduct = async (processId: number, productCode: string, machineCode = ""): Promise<boolean> => {
    const normalized = String(productCode || "").trim().toUpperCase();
    if (!normalized) return false;
    const rows = await getCachedProcessProductRows(processId);
    const codes = new Set(rows.map((row) => String(row?.product_code || "").trim().toUpperCase()).filter(Boolean));
    processProductCache.set(Number(processId), { expiresAt: Date.now() + PROCESS_PRODUCT_CACHE_TTL_MS, codes });
    if (codes.has(normalized)) return true;
    return Boolean(await getAutomaticAliasProduct(processId, machineCode, normalized, rows));
};

const resolveCanonicalProductCode = async (processId: number, productCode: string, machineCode = ""): Promise<string> => {
    const normalized = String(productCode || "").trim().toUpperCase();
    if (!normalized) return "";
    const rows = await getCachedProcessProductRows(processId);
    const exact = rows.find((row) => String(row?.product_code || "").trim().toUpperCase() === normalized);
    if (exact?.product_code) return String(exact.product_code).trim();
    const automatic = await getAutomaticAliasProduct(processId, machineCode, normalized, rows);
    return String(automatic?.product_code || productCode).trim();
};

const findPositiveLocalStandard = (rows: ProductStandardOption[], normalizedProduct: string, canonicalProduct: string, workType: GcWorkType | null = null): ProductStandardOption | undefined => {
    const normalizedCanonical = String(canonicalProduct || "").trim().toUpperCase();
    const normalizedInput = String(normalizedProduct || "").trim().toUpperCase();
    const isPositive = (row: ProductStandardOption) => Number.isFinite(Number(row?.standard_output)) && Number(row.standard_output) > 0;
    const hasExactCode = (row: ProductStandardOption) => [row?.product_code, row?.alias_code]
        .some((value) => String(value || "").trim().toUpperCase() === normalizedInput);
    const byWorkType = (candidates: ProductStandardOption[]) => {
        if (!workType) return candidates;
        return candidates.filter((row) => {
            const type = String(row?.work_type || "").trim().toUpperCase();
            return workType === "LONG"
                ? type === "LỒNG" || type === "LONG"
                : type === "CẮT" || type === "CUT" || type === "CAT";
        });
    };

    // AUTO code must win over a canonical/base-product fallback. Otherwise C2556
    // can be considered alongside C2556-AUTO and create a false ambiguity.
    const exactCandidates = byWorkType(rows.filter((row) => hasExactCode(row) && isPositive(row)));
    if (exactCandidates.length > 0) {
        return exactCandidates.slice().sort((a, b) => Number(b.standard_output) - Number(a.standard_output) || Number(a.id) - Number(b.id))[0];
    }

    const canonicalCandidates = byWorkType(rows.filter((row) =>
        String(row?.product_code || "").trim().toUpperCase() === normalizedCanonical && isPositive(row)
    ));
    if (canonicalCandidates.length > 0) {
        return canonicalCandidates.slice().sort((a, b) => Number(b.standard_output) - Number(a.standard_output) || Number(a.id) - Number(b.id))[0];
    }
    return undefined;
};

const toLocalResolvedStandard = (row: ProductStandardOption, processId: number, machineCode: string, requestedProductCode?: string): ResolvedProductStandard => {
    const output = Number(row.standard_output);
    return {
        product_standard_id: Number(row.id), process_id: Number(row.process_id || processId), product_code: String(row.product_code),
        machine_id: null, machine_code: machineCode, standard_time_seconds: null, machine_standard_output: null,
        default_standard_output: output,
        resolved_output_per_hour: output,
        standard_source: "DEFAULT",
    };
};

const NO_STANDARD_LONG_WORK_CODES = new Set(["XUATNHAP", "KTCD", "TAIPP"]);

export const resolveProductStandard = async (processId: number, machineCode: string, productCode: string, workDate?: string): Promise<ResolvedProductStandard> => {
    const normalizedMachine = String(machineCode || "").trim();
    const normalizedProduct = String(productCode || "").trim();
    if (!normalizedProduct) throw new Error("Thiếu mã sản phẩm để tra định mức");

    if (Number(processId) === 1 && NO_STANDARD_LONG_WORK_CODES.has(normalizedProduct.toUpperCase())) {
        return {
            product_standard_id: 0,
            process_id: Number(processId),
            product_code: normalizedProduct,
            machine_id: null,
            machine_code: normalizedMachine,
            standard_time_seconds: null,
            machine_standard_output: null,
            default_standard_output: 0,
            resolved_output_per_hour: 1,
            standard_source: "DEFAULT",
        };
    }

    const rows = await getCachedProcessProductRows(processId);
    const automaticAlias = await getAutomaticAliasProduct(processId, normalizedMachine, normalizedProduct, rows);
    const lookupProduct = automaticAlias?.product_code ? String(automaticAlias.product_code).trim() : normalizedProduct;
    const productExistsInProcess = await hasExactProcessProduct(processId, normalizedProduct, normalizedMachine);
    const canonicalProduct = await resolveCanonicalProductCode(processId, normalizedProduct, normalizedMachine);
    // Cắt/Lồng comes from the machine master (gc_work_type), never from the machine-code prefix.
    const machineWorkType = normalizedMachine && Number(processId) === 1
        ? gcWorkTypeOfMachine(await getMachinesByProcess(processId).catch(() => []), normalizedMachine)
        : null;
    const localStandard = findPositiveLocalStandard(rows, lookupProduct.toUpperCase(), canonicalProduct, machineWorkType);

    // Business rule:
    // 1) TAY/MANUAL: resolve by product code only; machine is ignored.
    // 2) MÁY/AUTO: resolve by machine + product first.
    // 3) If machine standard is missing/0, fall back to the process/product standard.
    // Never reject a machine/product pair merely because the product-list endpoint omitted it;
    // the authoritative resolver is allowed to find a machine-specific standard directly.
    if (!normalizedMachine) {
        const candidates = rows.filter((row) => String(row?.product_code || "").trim().toUpperCase() === normalizedProduct.toUpperCase() || String(row?.product_code || "").trim().toUpperCase() === canonicalProduct.toUpperCase());
        const positiveCandidates = candidates.filter((row) => Number.isFinite(Number(row?.standard_output)) && Number(row.standard_output) > 0);
        const product = positiveCandidates.length > 0
            ? positiveCandidates.slice().sort((a, b) => Number(b.standard_output) - Number(a.standard_output) || Number(a.id) - Number(b.id))[0]
            : candidates.length === 1
                ? candidates[0]
                : undefined;
        if (!product) throw new Error(`Không xác định duy nhất định mức sản phẩm ${normalizedProduct} trong công đoạn`);
        return toLocalResolvedStandard(product, processId, "", normalizedProduct);
    }

    try {
        const resolved = await api.get("/product-standards/resolve", {
            params: {
                process_id: processId,
                machine_code: normalizedMachine,
                product_code: lookupProduct,
                work_date: workDate || undefined,
            },
        });
        const resolvedData = resolved.data?.data ?? resolved.data;
        const resolvedOutput = Number(resolvedData?.resolved_output_per_hour || 0);
        if (resolvedOutput > 0) return { ...resolvedData, product_code: String(resolvedData?.product_code || normalizedProduct) };
        throw new Error(resolvedData?.message || `Không có định mức hợp lệ cho ${normalizedProduct} / ${normalizedMachine}`);
    } catch (error: any) {
        // Machine-specific standard is optional. If it is absent or zero, use the
        // product/process standard for the machine's inferred Cắt/Lồng type.
        if (localStandard) return toLocalResolvedStandard(localStandard, processId, normalizedMachine, normalizedProduct);
        if (!productExistsInProcess) {
            throw new Error(`Sản phẩm ${normalizedProduct} không có trong danh mục công đoạn và không có định mức máy/phương án fallback`, { cause: error });
        }
        throw error;
    }
};