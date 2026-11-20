import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

import { getMaxMachineCount } from "./processMachineLines";
import {
    patchMachineLineItem,
    resizeMachineLineItems,
    toggleMachineLineDefect,
    updateMachineLineDefectValue,
} from "./processMachineLineState";
import type { MachineLineState } from "./processPageConfig";

/**
 * Application-level coordinator for a worker's machine-line edits.
 * The page owns the state because draft restoration and report reset share it.
 * Limits and updates reuse the existing domain functions unchanged.
 */
export function useProcessMachineLineActions({
    processCode,
    machineOptions,
    machineCount,
    machineLines,
    setMachineCount,
    setMachineLines,
}: {
    processCode: Parameters<typeof getMaxMachineCount>[0];
    machineOptions: Parameters<typeof getMaxMachineCount>[2];
    machineCount: number;
    machineLines: MachineLineState[];
    setMachineCount: Dispatch<SetStateAction<number>>;
    setMachineLines: Dispatch<SetStateAction<MachineLineState[]>>;
}) {
    const maxMachineCount = getMaxMachineCount(processCode, machineLines, machineOptions);

    useEffect(() => {
        if (machineCount > maxMachineCount) {
            setMachineCount(maxMachineCount);
            setMachineLines((current) => current.slice(0, maxMachineCount));
        }
    }, [machineCount, maxMachineCount, setMachineCount, setMachineLines]);

    const resizeMachineLines = (count: number) => {
        const normalizedCount = Math.min(maxMachineCount, Math.max(1, count));
        setMachineCount(normalizedCount);
        setMachineLines((current) => resizeMachineLineItems(current, count, maxMachineCount));
    };

    const updateMachineLine = (index: number, patch: Partial<MachineLineState>) => {
        setMachineLines((current) => patchMachineLineItem(current, index, patch));
    };

    const toggleMachineDefect = (lineIndex: number, key: string) => {
        setMachineLines((current) => toggleMachineLineDefect(current, lineIndex, key));
    };

    const updateMachineDefectValue = (lineIndex: number, key: string, value: string) => {
        setMachineLines((current) => updateMachineLineDefectValue(current, lineIndex, key, value));
    };

    return {
        maxMachineCount,
        resizeMachineLines,
        updateMachineLine,
        toggleMachineDefect,
        updateMachineDefectValue,
    };
}
