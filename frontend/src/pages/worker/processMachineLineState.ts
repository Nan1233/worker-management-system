import { createEmptyMachineLine, type MachineLineState } from "./processPageConfig";
import { toggleMachineDefectLine, updateMachineDefectLine } from "./processMachineLines";

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

/** Toggle a defect on a single row, preserving all other machine rows. */
export const toggleMachineLineDefect = (
    current: MachineLineState[],
    index: number,
    key: string,
): MachineLineState[] => current.map(
    (line, lineIndex) => lineIndex === index ? toggleMachineDefectLine(line, key) : line,
);

/** Edit a defect quantity on a single row, preserving all other machine rows. */
export const updateMachineLineDefectValue = (
    current: MachineLineState[],
    index: number,
    key: string,
    value: string,
): MachineLineState[] => current.map(
    (line, lineIndex) => lineIndex === index ? updateMachineDefectLine(line, key, value) : line,
);
