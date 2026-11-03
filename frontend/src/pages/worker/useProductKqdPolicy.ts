import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { resolveProductStandard } from "../../services/masterDataService";
import type { FormState } from "./processPageConfig";

interface UseProductKqdPolicyOptions {
    processId: number;
    machineNo: string;
    productName: string;
    workDate: string;
    setForm: Dispatch<SetStateAction<FormState>>;
}

/**
 * Resolves the product-specific KQD exclusion policy and its authoritative
 * standard output. A stale request is ignored when the selected product,
 * machine, date, or process changes.
 */
export function useProductKqdPolicy({
    processId,
    machineNo,
    productName,
    workDate,
    setForm,
}: UseProductKqdPolicyOptions) {
    const [resolvedReportKqdPolicy, setResolvedReportKqdPolicy] = useState<boolean | null>(null);

    useEffect(() => {
        let active = true;

        if (!productName.trim() || !workDate) {
            setResolvedReportKqdPolicy(null);
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

            setResolvedReportKqdPolicy(Number(resolved.exclude_kqd_from_tt || 0) === 1);
            const resolvedOutput = Number(resolved.resolved_output_per_hour || 0);
            if (resolvedOutput > 0) {
                setForm((current) => ({
                    ...current,
                    standardOutput: String(resolvedOutput),
                }));
            }
        }).catch(() => {
            if (active) setResolvedReportKqdPolicy(null);
        });

        return () => {
            active = false;
        };
    }, [processId, machineNo, productName, workDate, setForm]);

    return { resolvedReportKqdPolicy };
}
