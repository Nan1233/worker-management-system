import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import type { FormState, NgKey } from "./processPageConfig";
import { parseIntegerDisplay } from "./processFormUtils";
import {
    applyNgToggleToForm,
    applyNgValueToForm,
    applyTtOkToForm,
    isValidIntegerInput,
} from "./processQualityLogic";

/**
 * Application coordinator for form quality edits.
 * The existing pure domain functions remain the only source for NG/OK calculations.
 * State stays in the page so draft restore and reset keep their existing behavior.
 */
export function useProcessQualityActions({
    setForm,
    setSelectedNg,
    activeNgOptions,
    calculateActualOutput,
}: {
    setForm: Dispatch<SetStateAction<FormState>>;
    setSelectedNg: Dispatch<SetStateAction<NgKey[]>>;
    activeNgOptions: Parameters<typeof applyNgValueToForm>[3];
    calculateActualOutput: (values: FormState) => number;
}) {
    const handleNgValue = (key: NgKey, value: string) => {
        if (!isValidIntegerInput(value)) return;
        setForm((prev) =>
            applyNgValueToForm(prev, key, value, activeNgOptions, calculateActualOutput)
        );
    };

    const handleToggleNg = (key: NgKey, checked: boolean) => {
        setSelectedNg((prev) => {
            if (checked) return prev.includes(key) ? prev : [...prev, key];
            return prev.filter((item) => item !== key);
        });
        setForm((prev) =>
            applyNgToggleToForm(prev, key, checked, activeNgOptions, calculateActualOutput)
        );
    };

    const handleTtOkChange = (event: ChangeEvent<HTMLInputElement>) => {
        const value = parseIntegerDisplay(event.target.value);
        if (!isValidIntegerInput(value)) return;
        setForm((prev) => applyTtOkToForm(prev, value, calculateActualOutput));
    };

    return { handleNgValue, handleToggleNg, handleTtOkChange };
}
