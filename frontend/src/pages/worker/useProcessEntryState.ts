import { useState } from "react";
import type { DeductionKey, DeductionState, NgKey } from "./processPageConfig";
import { initialDeduction } from "./processPageConfig";

/** Defects, deduction selections and submission UI state for a worker report. */
export function useProcessEntryState() {
    const [deductions, setDeductions] = useState<DeductionState>(initialDeduction);
    const [selectedDeduction, setSelectedDeduction] = useState<DeductionKey[]>([]);
    const [selectedNg, setSelectedNg] = useState<NgKey[]>([]);
    const [showDeduction, setShowDeduction] = useState(false);
    const [showNg, setShowNg] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitValidationError, setSubmitValidationError] = useState("");

    return {
        deductions, setDeductions, selectedDeduction, setSelectedDeduction,
        selectedNg, setSelectedNg, showDeduction, setShowDeduction,
        showNg, setShowNg, submitting, setSubmitting,
        submitValidationError, setSubmitValidationError,
    };
}
