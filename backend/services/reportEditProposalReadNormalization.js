'use strict';

/**
 * Normalize a row returned by the proposal detail/list SELECT.
 *
 * Preserve the historical read contract: JSON text becomes an object,
 * malformed JSON becomes {}, and already-parsed values pass through.
 * This read-only helper must never be used to validate proposed_data
 * within an approval transaction, which rejects invalid JSON instead.
 */
function normalizeProposalReadRow(row) {
    if (!row) return row;
    if (typeof row.proposed_data === 'string') {
        try {
            row.proposed_data = JSON.parse(row.proposed_data);
        } catch {
            row.proposed_data = {};
        }
    }
    return row;
}

module.exports = { normalizeProposalReadRow };
