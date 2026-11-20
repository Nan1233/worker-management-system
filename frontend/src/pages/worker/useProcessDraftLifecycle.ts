import { useProcessDraftRestore } from "./useProcessDraftRestore";
import { useProcessDraftAutosave } from "./useProcessDraftAutosave";

type Params = Parameters<typeof useProcessDraftRestore>[0]
    & Parameters<typeof useProcessDraftAutosave>[0];

/** Keep draft restore before autosave, preserving their existing hook order. */
export function useProcessDraftLifecycle(args: Params): void {
    useProcessDraftRestore(args);
    useProcessDraftAutosave(args);
}
