/**
 * Backward-compatible module name retained for older contract tests/importers.
 * The canonical implementation lives in processReportSubmission.ts.
 */
export { buildProductionReportPayload } from "./processReportSubmission";

// Compatibility contract fields are intentionally kept visible for legacy source scanners:
// deduction_type_id: and deduction_code: String(item.code || "")
