export type ProcessSubmitOutcome = "success" | "duplicate" | "similar_report";

function unwrapPayload(response: any): any {
  if (!response || typeof response !== "object") return response;
  return response?.data && typeof response.data === "object"
    ? response.data
    : response;
}

export function classifyProcessSubmitResponse(response: any): ProcessSubmitOutcome {
  const body = unwrapPayload(response);
  const code = String(body?.code || "").trim();

  if (body?.duplicate === true || code === "DUPLICATE_PRODUCTION_REPORT") {
    return "duplicate";
  }

  if (
    code === "DUPLICATE_CONFIRMATION_REQUIRED" ||
    body?.duplicate_reason === "similar_report" ||
    Boolean(body?.duplicate_confirmation_token)
  ) {
    return "similar_report";
  }

  return "success";
}
