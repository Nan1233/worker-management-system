export type ProcessSubmitOutcome = "success" | "duplicate" | "similar_report";
export function classifyProcessSubmitResponse(response: any): ProcessSubmitOutcome {
  if (response?.duplicate === true) return "duplicate";
  if (response?.data?.id && response?.data?.status && response?.duplicate_confirmation_token) return "similar_report";
  if (response?.duplicate_reason === "similar_report") return "similar_report";
  return "success";
}
