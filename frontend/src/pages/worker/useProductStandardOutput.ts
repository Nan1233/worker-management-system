import { useEffect, type Dispatch, type SetStateAction } from "react";
import { resolveProductStandard } from "../../services/masterDataService";
import type { FormState } from "./processPageConfig";

interface UseProductStandardOutputOptions {
    processId: number;
    machineNo: string;
    productName: string;
    workDate: string;
    setForm: Dispatch<SetStateAction<FormState>>;
}

/** Resolves the selected product's standard output without applying product-specific NG rules. */
export function useProductStandardOutput({
    processId,
    machineNo,
    productName,
    workDate,
    setForm,
}: UseProductStandardOutputOptions): void {
    useEffect(() => {
        let active = true;
        if (!productName.trim() || !workDate) {
            return () => {
                active = false;
            };
        }

        void resolveProductStandard(
            processId,
            machineNo.trim(),
            productName.trim(),
            workDate
        ).then((resolved) => {
            if (!active) return;
            const resolvedOutput = Number(resolved.resolved_output_per_hour || 0);
            if (resolvedOutput > 0) {
                setForm((current) => ({
                    ...current,
                    standardOutput: String(resolvedOutput),
                }));
            }
        }).catch(() => {
            // Standard lookup errors are handled by the existing form validation.
        });

        return () => {
            active = false;
        };
    }, [processId, machineNo, productName, workDate, setForm]);
}
