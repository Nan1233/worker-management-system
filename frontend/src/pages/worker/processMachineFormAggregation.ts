import type { FormState } from "./processPageConfig";
import type { aggregateMachineLines } from "./processMachineLines";

type MachineAggregate = ReturnType<typeof aggregateMachineLines>;
type NgOption = { key: string };

/**
 * Project machine totals onto the parent form without changing the
 * existing NG, OK, output, or standard calculations.
 */
export function applyMachineAggregateToForm(
    current: FormState,
    aggregate: MachineAggregate,
    machineLineCount: number,
    activeNgOptions: NgOption[],
): FormState {
    const next: FormState = {
        ...current,
        productName: aggregate.firstProductCode,
        standardOutput: machineLineCount ? String(aggregate.totalStandardOutput) : "0",
        actualOutput: String(aggregate.totalOk + aggregate.totalNg),
        ttOk: String(aggregate.totalOk),
        ttNg: String(aggregate.totalNg),
    };
    activeNgOptions.forEach((item) => {
        next[item.key] = String(aggregate.defects[item.key] || 0);
    });
    return next;
}
