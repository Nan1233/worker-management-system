import { useEffect, useMemo, useState } from "react";
import type { MachineOption } from "../../services/masterDataService";
import { getCachedMachines } from "../../services/masterDataCache";

/**
 * The ĐO form may reference a MÀI machine. Load these options only for ĐO,
 * and ignore late responses when the selected process changes.
 */
export function useRelatedGrindingMachines(processCode: string) {
    const [machines, setMachines] = useState<MachineOption[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let active = true;
        if (processCode !== "DO") {
            setMachines([]);
            setLoading(false);
            return () => { active = false; };
        }

        setLoading(true);
        void getCachedMachines(2)
            .then((results) => {
                if (active) {
                    setMachines(results.filter((machine) => String(machine.machine_code || "").trim()));
                }
            })
            .catch(() => {
                if (active) setMachines([]);
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => { active = false; };
    }, [processCode]);

    const extraFieldOptions = useMemo(() => ({
        grinding_machine_no: machines.map((machine) => ({
            value: machine.machine_code,
            label: machine.machine_name
                ? `${machine.machine_code} — ${machine.machine_name}`
                : machine.machine_code,
        })),
    }), [machines]);

    return { extraFieldOptions, loadingRelatedMaiMachines: loading };
}
