import api from "./api";


export interface MachineOption {

    id: number;

    process_id: number;

    machine_code: string;

    machine_name: string;
    operation_type?: "CUT" | "NEST" | null;

}


export interface ProductStandardOption {

    id: number;

    process_id: number;

    work_type:
        | "cat"
        | "long";

    product_code: string;

    standard_output: number;
    exclude_kqd_from_tt?: number;

}


export const getMachinesByProcess =
    async (
        processId: number,
        filters: { operationType?: "CUT" | "NEST" } = {}
    ): Promise<MachineOption[]> => {

        const response =
            await api.get(
                "/machines",
                {
                    params: {
                        process_id:
                            processId,
                        operation_type: filters.operationType
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
        filters: { operationType?: "CUT" | "NEST"; operationMode?: "MANUAL" | "MACHINE"; machineId?: number } = {}
    ): Promise<ProductStandardOption[]> => {

        const response =
            await api.get(
                "/product-standards",
                {
                    params: {
                        process_id:
                            processId,
                        operation_type: filters.operationType,
                        operation_mode: filters.operationMode,
                        machine_id: filters.machineId
                    }
                }
            );


        const payload = response.data?.data ?? response.data;

        return Array.isArray(payload)
            ? payload
            : [];

    };