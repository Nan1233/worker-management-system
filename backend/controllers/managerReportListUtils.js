'use strict';

const { toPositiveInteger } = require('./productionTempControllerUtils');
const { normalizePagination, normalizeSearch } = require('../services/managerReportPaginationService');

/**
 * Create a stable list filter object while preserving the existing query semantics.
 * Pending reports alone support include_meta; its position before pagination is
 * intentional because cache keys serialize this object in property order.
 */
function normalizeManagerReportFilters(query, includePendingMeta = false) {
    return {
        date: query.date || null,
        date_from: query.date_from || null,
        date_to: query.date_to || null,
        shift: query.shift || null,
        process_id: toPositiveInteger(query.process_id),
        process_name: query.process_name?.trim() || null,
        search: normalizeSearch(query.search),
        ...(includePendingMeta ? { include_meta: query.include_meta !== '0' } : {}),
        pagination: normalizePagination(query)
    };
}

function managerReportCacheKey(kind, userRole, userId, filters) {
    return `manager:${kind}:${userRole}:${userId}:${JSON.stringify(filters)}`;
}

module.exports = { normalizeManagerReportFilters, managerReportCacheKey };
