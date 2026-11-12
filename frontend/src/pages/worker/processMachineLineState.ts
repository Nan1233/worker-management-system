import { createEmptyMachineLine } from "./processPageConfig";
import type { MachineLineState } from "./processPageConfig";

/** Keep existing entries while resizing the form's machine rows. */
export const resizeMachineLineItems = (
    current: MachineLineState[],
    count: number,
    maxCount: number,
): MachineLineState[] => {
    const normalizedCount = Math.min(maxCount, Math.max(1, count));
    return Array.from(
        { length: normalizedCount },
        (_, index) => current[index] || createEmptyMachineLine(),
    );
};

/** Update exactly one machine row without mutating other rows. */
export const patchMachineLineItem = (
    current: MachineLineState[],
    index: number,
    patch: Partial<MachineLineState>,
): MachineLineState[] => current.map(
    (line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line,
);
