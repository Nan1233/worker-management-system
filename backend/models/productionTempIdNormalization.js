'use strict';

// Pure ID normalization shared by approval and database adapters.
// Preserve the existing numeric coercion, deduplication and ascending order.
function normalizeIds(ids) {
  const input = Array.isArray(ids) ? ids : [];
  const positiveIntegerIds = input
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);

  return [...new Set(positiveIntegerIds)].sort((left, right) => left - right);
}

module.exports = { normalizeIds };
