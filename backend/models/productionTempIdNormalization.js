'use strict';

// Pure ID normalization shared by approval and database adapters.
const normalizeIds = (ids) => [
    ...new Set(
        (Array.isArray(ids) ? ids : [])
            .map(Number)
            .filter((id) => Number.isInteger(id) && id > 0)
    )
].sort((a, b) => a - b);

module.exports = { normalizeIds };
