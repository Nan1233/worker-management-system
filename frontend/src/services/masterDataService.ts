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


export const getMachinesByProcess =
    async (
        processId: number
    ): Promise<MachineOption[]> => {

        const response =
            await api.get(
                "/machines",
                {
                    params: {
                        process_id:
                            processId
                    }
                }
            );


        const payload = response.data?.data ?? response.data;

        return Array.isArray(payload)
            ? payload
            : [];

    };


export const getProductStandardsByProcess =
    async (
        processId: number,
        processCode?: string
    ): Promise<ProductStandardOption[]> => {

        const response =
            await api.get(
                "/product-standards",
                {
                    params: processCode
                        ? { process_code: processCode }
                        : { process_id: processId }
                }
            );


        const payload = response.data?.data ?? response.data;

        return Array.isArray(payload)
            ? payload
            : [];

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
    workDate: string
): Promise<ResolvedProductStandard> => {
    const response = await api.get("/product-standards/resolve", {
        params: {
            process_id: processId,
            machine_code: machineCode,
            product_code: productCode,
            work_date: workDate
        }
    });

    return response.data?.data ?? response.data;
};
