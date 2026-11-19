import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { resolveProductStandard } from "../../services/masterDataService";
import type { FormState } from "./processPageConfig";

/**
 * Resolve the standard for a single-product form.
 * Preserve the current standard on failed requests, and ignore stale results
 * when the selection changes or the component unmounts.
 */
export function useProcessSingleStandardLookup(
    processId: number,
    form: FormState,
    setForm: Dispatch<SetStateAction<FormState>>,
): void {
    useEffect(() => {
        let active = true;
        if (!form.productName.trim() || !form.workDate) {
            return () => { active = false; };
        }
        void resolveProductStandard(
            processId,
            form.machineNo.trim(),
            form.productName.trim(),
            form.workDate,
        ).then((resolved) => {
            if (!active) return;
            const resolvedOutput = Number(resolved.resolved_output_per_hour || 0);
            if (resolvedOutput > 0) {
                setForm((current) => ({ ...current, standardOutput: String(resolvedOutput) }));
            }
        }).catch(() => {
            // Keep the manually entered standard if the lookup fails.
        });
        return () => { active = false; };
    }, [processId, form.machineNo, form.productName, form.workDate, setForm]);
}
