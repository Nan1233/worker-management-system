'use strict';

/**
 * Calculate the values for matching deduction/defect columns independently
 * from ExcelJS. The caller owns only writing the returned values to cells.
 */
function calculateDetailTotals(report, processData, assigned, kind, mapping) {
  const {
    detailItems, detailValue, resolveType, itemKeys, typeCandidates,
    detailVariants, canonicalDetailKey,
  } = mapping;
  const columnByType = new Map(assigned.map((item) => [item.type, item.column]));
  const sums = new Map(assigned.map((item) => [item.column, 0]));
  for (const item of detailItems(report, kind)) {
    const value = detailValue(item, kind);
    if (!value) continue;
    let column = null;
    const type = resolveType(item, processData, kind);
    if (type) column = columnByType.get(type) || null;
    if (!column) {
      const keys = new Set(itemKeys(item, kind).flatMap(detailVariants).map(canonicalDetailKey));
      const hit = assigned.find((entry) => typeCandidates(entry.type, kind).some((candidate) => keys.has(candidate)));
      column = hit?.column || null;
    }
    if (column) sums.set(column, (sums.get(column) || 0) + value);
  }
  return new Map([...sums].map(([column, total]) => [column, total ? Math.round(total * 10000) / 10000 : null]));
}

module.exports = { calculateDetailTotals };
