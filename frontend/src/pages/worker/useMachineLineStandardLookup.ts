import { useRef } from "react";
import { resolveProductStandard } from "../../services/masterDataService";
import { getCachedResolvedProductStandard } from "../../services/productStandardRequestCache";
import { getApiError } from "../../utils/apiError";
import type { MachineLineState } from "./processPageConfig";

type Params = {
    processCode: string;
    processId: number;
    workDate: string;
    updateMachineLine: (index: number, patch: Partial<MachineLineState>) => void;
};

/**
 * Resolve standards for each machine row independently. The request sequence
 * prevents older responses from overwriting a newer selection on the same row.
 */
export function useMachineLineStandardLookup({
    processCode,
    processId,
    workDate,
    updateMachineLine,
}: Params) {
    const requestSequences = useRef<Record<number, number>>({});

    const refreshMachineLineStandard = async (
        index: number,
        machineCode: string,
        productCode: string,
    ) => {
        const normalizedMachine = machineCode.trim();
        const normalizedProduct = productCode.trim();
        const requestSeq = (requestSequences.current[index] || 0) + 1;
        requestSequences.current[index] = requestSeq;
        const isCurrentRequest = () => requestSequences.current[index] === requestSeq;

        // MÀI, ĐO and CÁN can resolve a default product standard without a machine.
        if (!normalizedProduct || (!normalizedMachine && !["MAI", "DO", "CAN"].includes(processCode))) {
            updateMachineLine(index, {
                standardOutputPerHour: 0,
                standardTimeSeconds: null,
                standardSource: null,
                standardLoading: false,
                standardError: "",
            });
            return;
        }

        updateMachineLine(index, { standardLoading: true, standardError: "" });
        try {
            const resolved = await getCachedResolvedProductStandard(
                processId,
                normalizedMachine,
                normalizedProduct,
                () => resolveProductStandard(
                    processId,
                    normalizedMachine,
                    normalizedProduct,
                    workDate,
                ),
            );
            if (!isCurrentRequest()) return;
            const output = Number(resolved.resolved_output_per_hour || 0);
            updateMachineLine(index, {
                standardOutputPerHour: Number.isFinite(output) ? output : 0,
                standardTimeSeconds: resolved.standard_time_seconds,
                standardSource: resolved.standard_source,
                standardLoading: false,
                standardError: output > 0 ? "" : "Định mức bằng 0",
            });
        } catch (error) {
            if (!isCurrentRequest()) return;
            updateMachineLine(index, {
                standardOutputPerHour: 0,
                standardTimeSeconds: null,
                standardSource: null,
                standardLoading: false,
                standardError: getApiError(error, "Không lấy được định mức").message,
            });
        }
    };

    return { refreshMachineLineStandard };
}
