import { useCallback, useMemo } from "react";
import type { MachineOption, ProductStandardOption } from "../../services/masterDataService";
import type { AutocompleteOption } from "../../components/common/AutocompleteInput";
import type { MachineLineState, OperationMode } from "./processPageConfig";
import { filterProductsForSelection, toProductAutocompleteOptions } from "./productSuggestionRules";

type Options = {
    processCode: string;
    products: ProductStandardOption[];
    machineOptions: MachineOption[];
    selectedMachine: string;
    usesAnyMachine: boolean;
    usesSingleMachine: boolean;
};

/** Shared product-selection rules for the report and its machine lines. */
export function useProcessProductOptions({
    processCode,
    products,
    machineOptions,
    selectedMachine,
    usesAnyMachine,
    usesSingleMachine,
}: Options) {
    const productAutocompleteOptions = useMemo<AutocompleteOption[]>(() => {
        if (["MAI", "DO"].includes(processCode) && !String(selectedMachine || "").trim()) {
            return toProductAutocompleteOptions(products);
        }
        const mode: OperationMode = usesAnyMachine ? "MACHINE" : "MANUAL";
        return toProductAutocompleteOptions(filterProductsForSelection({
            products,
            mode,
            machineCode: usesSingleMachine ? selectedMachine : undefined,
            machineOptions,
            useEncodedMachineSuffix: processCode === "GC",
        }));
    }, [products, usesAnyMachine, usesSingleMachine, selectedMachine, machineOptions, processCode]);

    const getMachineProductOptions = useCallback((machineCode: string): ProductStandardOption[] => {
        if (["MAI", "DO", "CAN"].includes(processCode) && !String(machineCode || "").trim()) {
            return products;
        }
        return filterProductsForSelection({
            products,
            mode: "MACHINE",
            machineCode,
            machineOptions,
            useEncodedMachineSuffix: processCode === "GC",
        });
    }, [products, machineOptions, processCode]);

    const getMachineProductOptionsForLine = useCallback(
        (line: MachineLineState) => getMachineProductOptions(line.machineCode),
        [getMachineProductOptions],
    );

    const getMachineProductAutocompleteOptions = useCallback(
        (machineCode: string): AutocompleteOption[] =>
            toProductAutocompleteOptions(getMachineProductOptions(machineCode)),
        [getMachineProductOptions],
    );

    return {
        productAutocompleteOptions,
        getMachineProductOptions,
        getMachineProductOptionsForLine,
        getMachineProductAutocompleteOptions,
    };
}
