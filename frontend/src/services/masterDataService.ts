import api from "./api";

export interface MachineOption {
    id: number;
    process_id: number;
    machine_code: string;
    machine_name: string;
    is_automatic?: number;
    max_workers_per_machine?: number;
    output_basis?: "MACHINE" | "PRODUCT";
}

export interface ProductStandardOption {
    id: number;
    process_id: number;
    process_code?: string;
    work_type: string;
    product_code: string;
    alias_code?: string;
    has_machine_specific_standard?: number;
    eligible_machine_codes?: string;
    standard_output: number;
    exclude_kqd_from_tt?: number;
}

export const getMachinesByProcess = async (processId: number): Promise<MachineOption[]> => {
    const response = await api.get("/machines", { params: { process_id: processId } });
    const payload = response.data?.data ?? response.data;
    return Array.isArray(payload) ? payload : [];
};

const PROCESS_PRODUCT_CACHE_TTL_MS = 30_000;
const processProductRowsCache = new Map<number, { expiresAt: number; rows: ProductStandardOption[] }>();

export const getProductStandardsByProcess = async (
    processId: number,
    processCode?: string,
): Promise<ProductStandardOption[]> => {
    const requests: Promise<ProductStandardOption[]>[] = [
        api.get("/product-standards", { params: { process_id: processId } })
            .then((response) => {
                const payload = response.data?.data ?? response.data;
                return Array.isArray(payload) ? payload : [];
            }),
    ];
    const normalizedCode = String(processCode || "").trim().toUpperCase();
    if (normalizedCode) {
        requests.push(
            api.get("/product-standards", { params: { process_code: processCode } })
                .then((response) => {
                    const payload = response.data?.data ?? response.data;
                    return Array.isArray(payload) ? payload : [];
                })
                .catch(() => []),
        );
    }
    const results = await Promise.all(requests);
    const merged = new Map<string, ProductStandardOption>();
    for (const rows of results) {
        for (const row of rows) {
            if (!row || !String(row.product_code || row.alias_code || "").trim()) continue;
            const productCodeValue = String(row.product_code || "").trim().toUpperCase();
            const aliasValue = String(row.alias_code || "").trim().toUpperCase();
            const workTypeValue = String(row.work_type || "").trim().toUpperCase();
            const machineScope = String(row.eligible_machine_codes || "").trim().toUpperCase();
            const key = `${productCodeValue}|${aliasValue}|${workTypeValue}|${machineScope}`;
            const previous = merged.get(key);
            merged.set(key, previous ? { ...previous, ...row } : row);
        }
    }
    const rows = Array.from(merged.values());
    processProductRowsCache.set(Number(processId), { expiresAt: Date.now() + PROCESS_PRODUCT_CACHE_TTL_MS, rows });
    return rows;
};

export interface ResolvedProductStandard {
    product_standard_id: number;
    process_id: number;
    product_code: string;
    alias_code?: string | null;
    machine_id: number | null;
    machine_code: string;
    standard_time_seconds: number | null;
    machine_standard_output: number | null;
    default_standard_output: number;
    resolved_output_per_hour: number;
    standard_source: "MACHINE" | "DEFAULT";
    exclude_kqd_from_tt?: number;
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

const hasExactProcessProduct = async (processId: number, productCode: string): Promise<boolean> => {
    const normalized = String(productCode || "").trim().toUpperCase();
    if (!normalized) return false;
    const rows = await getCachedProcessProductRows(processId);
    const codes = new Set(rows.flatMap((row) => [row?.product_code, row?.alias_code]).map((value) => String(value || "").trim().toUpperCase()).filter(Boolean));
    processProductCache.set(Number(processId), { expiresAt: Date.now() + PROCESS_PRODUCT_CACHE_TTL_MS, codes });
    return codes.has(normalized);
};

const resolveCanonicalProductCode = async (processId: number, productCode: string): Promise<string> => {
    const normalized = String(productCode || "").trim().toUpperCase();
    if (!normalized) return "";
    const rows = await getCachedProcessProductRows(processId);
    const exact = rows.find((row) => String(row?.product_code || "").trim().toUpperCase() === normalized);
    if (exact?.product_code) return String(exact.product_code).trim();
    const aliasCandidates = rows.filter((row) => String(row?.alias_code || "").trim().toUpperCase() === normalized);
    const positiveAlias = aliasCandidates.filter((row) => Number.isFinite(Number(row?.standard_output)) && Number(row.standard_output) > 0).sort((a, b) => Number(b.standard_output) - Number(a.standard_output))[0];
    return String((positiveAlias ?? aliasCandidates[0])?.product_code || productCode).trim();
};

const findPositiveLocalStandard = (rows: ProductStandardOption[], normalizedProduct: string, canonicalProduct: string): ProductStandardOption | undefined => {
    const normalizedCanonical = String(canonicalProduct || "").trim().toUpperCase();
    return rows
        .filter((row) => {
            const code = String(row?.product_code || "").trim().toUpperCase();
            const alias = String(row?.alias_code || "").trim().toUpperCase();
            return code === normalizedCanonical || code === normalizedProduct || alias === normalizedProduct;
        })
        .filter((row) => Number.isFinite(Number(row?.standard_output)) && Number(row.standard_output) > 0)
        .sort((a, b) => Number(b.standard_output) - Number(a.standard_output))[0];
};

const toLocalResolvedStandard = (row: ProductStandardOption, processId: number, machineCode: string): ResolvedProductStandard => {
    const output = Number(row.standard_output);
    return {
        product_standard_id: Number(row.id),
        process_id: Number(row.process_id || processId),
        product_code: String(row.product_code),
        alias_code: row.alias_code || null,
        machine_id: null,
        machine_code: machineCode,
        standard_time_seconds: null,
        machine_standard_output: null,
        default_standard_output: output,
        resolved_output_per_hour: output,
        standard_source: "DEFAULT",
        exclude_kqd_from_tt: Number(row.exclude_kqd_from_tt || 0),
    };
};

export const resolveProductStandard = async (processId: number, machineCode: string, productCode: string, workDate?: string): Promise<ResolvedProductStandard> => {
    const normalizedMachine = String(machineCode || "").trim();
    const normalizedProduct = String(productCode || "").trim();
    if (!normalizedProduct) throw new Error("Thiếu mã sản phẩm để tra định mức");
    if (!(await hasExactProcessProduct(processId, normalizedProduct))) throw new Error(`Sản phẩm ${normalizedProduct} không có trong danh mục công đoạn`);

    const rows = await getCachedProcessProductRows(processId);
    const canonicalProduct = await resolveCanonicalProductCode(processId, normalizedProduct);
    const localStandard = findPositiveLocalStandard(rows, normalizedProduct.toUpperCase(), canonicalProduct);

    if (!normalizedMachine) {
        const candidates = rows.filter((row) => [row?.product_code, row?.alias_code].some((value) => String(value || "").trim().toUpperCase() === normalizedProduct.toUpperCase()));
        const product = candidates.filter((row) => Number.isFinite(Number(row?.standard_output)) && Number(row.standard_output) > 0).sort((a, b) => Number(b.standard_output) - Number(a.standard_output))[0] ?? candidates[0];
        if (!product) throw new Error(`Không tìm thấy mã sản phẩm ${normalizedProduct} trong công đoạn`);
        return toLocalResolvedStandard(product, processId, "");
    }

    try {
        const response = await api.get("/product-standards/resolve", { params: { process_id: processId, machine_code: normalizedMachine, product_code: canonicalProduct, work_date: workDate || undefined } });
        const resolved = response.data?.data ?? response.data;
        const resolvedOutput = Number(resolved?.resolved_output_per_hour || 0);
        if (resolvedOutput > 0) return resolved;
        if (localStandard) return toLocalResolvedStandard(localStandard, processId, normalizedMachine);
        return resolved;
    } catch (error) {
        if (localStandard) return toLocalResolvedStandard(localStandard, processId, normalizedMachine);
        throw error;
    }
};
