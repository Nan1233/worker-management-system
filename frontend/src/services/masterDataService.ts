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
            if (!row || !String(row.product_code || "").trim()) continue;
            const productCodeValue = String(row.product_code).trim().toUpperCase();
            const workTypeValue = String(row.work_type || "").trim().toUpperCase();
            const machineScope = String(row.eligible_machine_codes || "").trim().toUpperCase();
            const key = `${productCodeValue}|${workTypeValue}|${machineScope}`;
            const previous = merged.get(key);
            merged.set(key, previous ? { ...previous, ...row } : row);
        }
    }

    return Array.from(merged.values());
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
    exclude_kqd_from_tt?: number;
}

const processProductCache = new Map<number, { expiresAt: number; codes: Set<string> }>();

const hasExactProcessProduct = async (processId: number, productCode: string): Promise<boolean> => {
    const normalized = String(productCode || "").trim().toUpperCase();
    if (!normalized) return false;

    const cached = processProductCache.get(Number(processId));
    if (cached && cached.expiresAt > Date.now()) {
        return cached.codes.has(normalized);
    }

    const response = await api.get("/product-standards", {
        params: { process_id: processId },
    });
    const payload = response.data?.data ?? response.data;
    const rows = Array.isArray(payload) ? payload as ProductStandardOption[] : [];
    const codes = new Set(
        rows
            .map((row) => String(row?.product_code || "").trim().toUpperCase())
            .filter(Boolean),
    );
    processProductCache.set(Number(processId), {
        expiresAt: Date.now() + 30_000,
        codes,
    });
    return codes.has(normalized);
};

/**
 * Resolve a machine-specific standard when a machine is selected.
 * Do not call the strict historical resolver while the worker is still typing
 * a partial product code (for example 8 -> 82 -> 823). The strict resolver
 * correctly returns 422 for those values, but those requests are only UI noise.
 * The product must first exist exactly in process master data.
 */
export const resolveProductStandard = async (
    processId: number,
    machineCode: string,
    productCode: string,
    workDate?: string,
): Promise<ResolvedProductStandard> => {
    const normalizedMachine = String(machineCode || "").trim();
    const normalizedProduct = String(productCode || "").trim();

    if (!normalizedProduct) {
        throw new Error("Thiếu mã sản phẩm để tra định mức");
    }

    if (!(await hasExactProcessProduct(processId, normalizedProduct))) {
        throw new Error(`Đang nhập mã sản phẩm: ${normalizedProduct}`);
    }

    if (!normalizedMachine) {
        const response = await api.get("/product-standards", {
            params: { process_id: processId },
        });
        const payload = response.data?.data ?? response.data;
        const rows = Array.isArray(payload) ? payload as ProductStandardOption[] : [];
        const product = rows.find(
            (row) => String(row?.product_code || "").trim().toUpperCase() === normalizedProduct.toUpperCase(),
        );

        if (!product) {
            throw new Error(`Không tìm thấy mã sản phẩm ${normalizedProduct} trong công đoạn`);
        }

        const defaultOutput = Number(product.standard_output || 0);
        return {
            product_standard_id: Number(product.id),
            process_id: Number(product.process_id || processId),
            product_code: String(product.product_code),
            machine_id: null,
            machine_code: "",
            standard_time_seconds: null,
            machine_standard_output: null,
            default_standard_output: Number.isFinite(defaultOutput) ? defaultOutput : 0,
            resolved_output_per_hour: Number.isFinite(defaultOutput) ? defaultOutput : 0,
            standard_source: "DEFAULT",
            exclude_kqd_from_tt: Number(product.exclude_kqd_from_tt || 0),
        };
    }

    const response = await api.get("/product-standards/resolve", {
        params: {
            process_id: processId,
            machine_code: normalizedMachine,
            product_code: normalizedProduct,
            work_date: workDate || undefined,
        },
    });

    return response.data?.data ?? response.data;
};
