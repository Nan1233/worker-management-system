import api from "./api";


export interface MachineOption {

    id: number;

    process_id: number;

    machine_code: string;

    machine_name: string;

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
        processId: number
    ): Promise<ProductStandardOption[]> => {

        const response =
            await api.get(
                "/product-standards",
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