import { useState } from "react";
import type { DuplicatePromptState } from "./processDuplicateReportLogic";

export function useDuplicateReportFlow() {
  const [duplicatePrompt, setDuplicatePrompt] = useState<DuplicatePromptState | null>(null);
  return { duplicatePrompt, setDuplicatePrompt };
}

// Duplicate challenge state includes duplicate_confirmation_token via DuplicatePromptState.confirmationToken.

// Compatibility contract: duplicate confirmation payloads may carry force_create: true
// together with duplicate_confirmation_token; execution is owned by ProcessPage.
