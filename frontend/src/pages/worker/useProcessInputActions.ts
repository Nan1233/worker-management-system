import type { Dispatch, SetStateAction, ChangeEvent, FocusEvent } from "react";
import type { FormState } from "./processPageConfig";
import { applyProcessFormChange, clearZeroNumberField } from "./processInputLogic";

/** Keep generic text input and zero-on-blur normalization outside the page. */
export function useProcessInputActions(
    setForm: Dispatch<SetStateAction<FormState>>,
    calculateActualOutput: (values: FormState) => number,
) {
    const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = event.target;
        setForm((previous) => applyProcessFormChange(previous, name, value, calculateActualOutput));
    };

    const handleNumberBlur = (event: FocusEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        if (value !== "0") return;
        setForm((previous) => clearZeroNumberField(previous, name, value));
    };

    return { handleChange, handleNumberBlur };
}
