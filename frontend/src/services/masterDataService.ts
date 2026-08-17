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

/**
 * Read process-id master data as the canonical source and supplement it with
 * process-code data when available. Some deployments have complete rows under
 * process_id but an incomplete/empty process_code lookup.
 */
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
            api.get("/product-standards", { params: { process_code: normalizedCode } })
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
    machine_id: number;
    machine_code: string;
    standard_time_seconds: number | null;
    machine_standard_output: number | null;
    default_standard_output: number;
    resolved_output_per_hour: number;
    standard_source: "MACHINE" | "DEFAULT";
    exclude_kqd_from_tt?: number;
}

export const resolveProductStandard = async (
    processId: number,
    machineCode: string,
    productCode: string,
    workDate?: string,
): Promise<ResolvedProductStandard> => {
    const response = await api.get("/product-standards/resolve", {
        params: {
            process_id: processId,
            machine_code: machineCode,
            product_code: productCode,
            work_date: workDate || undefined,
        },
    });

    return response.data?.data ?? response.data;
};
