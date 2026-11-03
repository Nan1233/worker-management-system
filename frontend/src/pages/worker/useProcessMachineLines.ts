import { useEffect, useState } from "react";

import type { MachineOption } from "../../services/masterDataService";
import {
    createEmptyMachineLine,
    type MachineLineState,
} from "./processPageConfig";
import {
    getMaxMachineCount,
    toggleMachineDefectLine,
    updateMachineDefectLine,
} from "./processMachineLines";

type UseProcessMachineLinesArgs = {
    processCode: string;
    machineOptions: MachineOption[];
};

export function useProcessMachineLines({
    processCode,
    machineOptions,
}: UseProcessMachineLinesArgs) {
    const [machineCount, setMachineCount] = useState(1);
    const [machineLines, setMachineLines] = useState<MachineLineState[]>([
        createEmptyMachineLine(),
    ]);

    const maxMachineCount = getMaxMachineCount(
        processCode,
        machineLines,
        machineOptions,
    );

    useEffect(() => {
        if (machineCount > maxMachineCount) {
            setMachineCount(maxMachineCount);
            setMachineLines((current) => current.slice(0, maxMachineCount));
        }
    }, [machineCount, maxMachineCount]);

    const resizeMachineLines = (count: number) => {
        const normalizedCount = Math.min(maxMachineCount, Math.max(1, count));
        setMachineCount(normalizedCount);
        setMachineLines((current) =>
            Array.from(
                { length: normalizedCount },
                (_, index) => current[index] || createEmptyMachineLine(),
            ),
        );
    };

    const updateMachineLine = (
        index: number,
        patch: Partial<MachineLineState>,
    ) => {
        setMachineLines((current) =>
            current.map((line, lineIndex) =>
                lineIndex === index ? { ...line, ...patch } : line,
            ),
        );
    };

    const toggleMachineDefect = (lineIndex: number, key: string) => {
        setMachineLines((current) =>
            current.map((line, index) =>
                index === lineIndex ? toggleMachineDefectLine(line, key) : line,
            ),
        );
    };

    const updateMachineDefectValue = (
        lineIndex: number,
        key: string,
        value: string,
    ) => {
        setMachineLines((current) =>
            current.map((line, index) =>
                index === lineIndex
                    ? updateMachineDefectLine(line, key, value)
                    : line,
            ),
        );
    };

    return {
        machineCount,
        setMachineCount,
        machineLines,
        setMachineLines,
        maxMachineCount,
        resizeMachineLines,
        updateMachineLine,
        toggleMachineDefect,
        updateMachineDefectValue,
    };
}
