'use strict';
const { storedStandardSource } = require('../utils/standardSourceCode');

// Fail-closed verification keeps physical machine production and approved report lineage intact.
function verifyApprovedMachineLineCopy(approvedRows, tempLines, tempReportId, approvedReportId = null) {
  const validRows = Array.isArray(approvedRows)
    && approvedRows.every((row) => row !== null && typeof row === "object" && !Array.isArray(row));
  const byInsertOrder = validRows
    ? [...approvedRows].sort((a, b) => Number(a.id) - Number(b.id))
    : [];
  const parseStrictId = (value) => {
    if (typeof value !== "number" && (typeof value !== "string" || !/^[0-9]+$/.test(value))) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  };
  const ids = byInsertOrder.map((row) => parseStrictId(row.id));
  const hasInvalidIds = ids.some((id) => id === null) || new Set(ids).size !== ids.length;
  // Machine/product codes alone cannot distinguish repeated runs of the same product.
  // Check persisted source identities too, when supplied by the database.
  const identityColumns = ["machine_event_id", "machine_id", "product_standard_id",
    "standard_version_id", "machine_standard_id"];
  const identityMismatch = (persisted, source) => identityColumns.some((column) =>
    (column !== "machine_event_id" || Boolean(source.machine_event_id))
      && Object.prototype.hasOwnProperty.call(persisted, column)
      && Object.prototype.hasOwnProperty.call(source, column)
      && String(persisted[column] || "") !== String(source[column] || ""));
  // sort_order is copied with a legacy default of 1. It distinguishes otherwise
  // identical machine/product runs and must survive the bulk INSERT unchanged.
  const sortOrderMismatch = (persisted, source) => {
    if (!Object.prototype.hasOwnProperty.call(persisted, "sort_order")
      || !Object.prototype.hasOwnProperty.call(source, "sort_order")) return false;
    // The INSERT uses source.sort_order || 1; the persisted value must still be
    // a positive safe integer, not a coerced boolean, exponent or fractional ID.
    const expected = parseStrictId(source.sort_order || 1);
    const actual = parseStrictId(persisted.sort_order);
    return expected === null || actual === null || actual !== expected;
  };
  // Decimal values may be returned as strings with trailing zeros by TiDB.
  // Normalize textually to avoid losing DECIMAL(18,6) precision through Number().
  const canonicalDecimal = (value) => {
    const raw = String(value ?? "").trim();
    if (!/^[+-]?(?:[0-9]+)(?:[.][0-9]+)?$/.test(raw)) return null;
    const negative = raw.startsWith("-");
    const unsigned = raw.replace(/^[+-]/, "");
    const [integer, fraction = ""] = unsigned.split(".");
    const whole = integer.replace(/^0+/, "") || "0";
    const decimal = fraction.replace(/0+$/, "");
    const magnitude = whole + (decimal ? "." + decimal : "");
    return (negative && magnitude !== "0" ? "-" : "") + magnitude;
  };
  const quantityColumns = ["machine_time_hours", "standard_output", "standard_time_seconds",
    "ok_quantity", "ng_quantity", "maximum_output", "deduction_time_hours",
    "counted_output", "earned_standard_hours"];
  const quantityMismatch = (persisted, source) => quantityColumns.some((column) => {
    if (!Object.prototype.hasOwnProperty.call(persisted, column)
      || !Object.prototype.hasOwnProperty.call(source, column)) return false;
    const saved = ["deduction_time_hours", "counted_output", "earned_standard_hours"].includes(column)
      ? source[column] || 0 : source[column];
    // The approved INSERT stores absent standard_time_seconds as SQL NULL.
    if (column === "standard_time_seconds" && !saved && persisted[column] == null) return false;
    const actual = canonicalDecimal(persisted[column]);
    const expected = canonicalDecimal(saved);
    return actual === null || expected === null || actual !== expected;
  });
  // A changed standard source can silently alter historical rate/audit lineage.
  // Compare the exact normalized code written by buildApprovedMachineLineValues.
  const standardSourceMismatch = (persisted, source) =>
    Object.prototype.hasOwnProperty.call(persisted, "standard_source")
      && Object.prototype.hasOwnProperty.call(source, "standard_source")
      && String(persisted.standard_source) !== storedStandardSource(source.standard_source);
  const wrongReportLineage = approvedReportId != null && byInsertOrder.some((row) =>
    !Object.prototype.hasOwnProperty.call(row, "report_id")
      || parseStrictId(row.report_id) === null
      || parseStrictId(row.report_id) !== parseStrictId(approvedReportId));
  if (!validRows
    || byInsertOrder.length !== tempLines.length
    || hasInvalidIds
    || wrongReportLineage
    || byInsertOrder.some((row, index) => String(row.machine_code) !== String(tempLines[index].machine_code)
      || String(row.product_code) !== String(tempLines[index].product_code)
      || identityMismatch(row, tempLines[index])
      || sortOrderMismatch(row, tempLines[index])
      || quantityMismatch(row, tempLines[index])
      || standardSourceMismatch(row, tempLines[index]))) {
    const error = new Error(`Không xác nhận được dòng máy đã sao chép cho báo cáo tạm #${tempReportId}; đã hủy duyệt để bảo vệ dữ liệu`);
    error.status = 500;
    error.code = "APPROVED_MACHINE_LINES_COPY_MISMATCH";
    error.isPublic = true;
    throw error;
  }

  return byInsertOrder;
}

// Copies the temp machine lines (and their defects) into the approved report.
// Subrequest budget: one multi-row INSERT for all lines + one SELECT to learn the new ids (the caller
// reuses those rows for the legacy snapshot and the approved version) + one INSERT for all defects,
// instead of one INSERT per machine line.

module.exports = { verifyApprovedMachineLineCopy };
