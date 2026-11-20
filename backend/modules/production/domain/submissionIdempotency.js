// Production domain: stable public result shape for idempotent retries.
// The existing request lookup repository decides which row/group was found.
const idempotent = (row) => ({
    id: Number(row.id),
    ids: Array.isArray(row.machine_group_ids) ? row.machine_group_ids
        : (Array.isArray(row.gc_group_ids) ? row.gc_group_ids : [Number(row.id)]),
    duplicate: true, duplicate_reason: "request_id", existing_report: row
});

module.exports = { idempotent };
