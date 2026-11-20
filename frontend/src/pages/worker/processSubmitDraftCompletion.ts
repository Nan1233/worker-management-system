import type { MutableRefObject } from "react";
import { clearProcessDraftAsync } from "./processDraftStorage";

/**
 * Application-side completion of an accepted/offline-queued submission.
 * This invalidates pending autosave before clearing the draft, and preserves
 * the historical fire-and-forget storage semantics.
 */
export function clearSubmittedProcessDraft({
    process,
    isRestoringDraftRef,
    resetVersionRef,
    draftSaveTimerRef,
    clientRequestIdRef,
}: {
    process: string;
    isRestoringDraftRef: MutableRefObject<boolean>;
    resetVersionRef: MutableRefObject<number>;
    draftSaveTimerRef: MutableRefObject<number | null>;
    clientRequestIdRef: MutableRefObject<string | null>;
}) {
    isRestoringDraftRef.current = true;
    resetVersionRef.current += 1;
    if (draftSaveTimerRef.current !== null) {
        window.clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
    }
    void clearProcessDraftAsync(process);
    clientRequestIdRef.current = null;
}
