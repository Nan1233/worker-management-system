'use strict';
const { TtlCache } = require('../utils/cache');
const ProductionTemp = require('../models/productionTempModel');
const { normalizeManagerReportFilters, managerReportCacheKey } = require('./managerReportListFilters');
const managerListCache = new TtlCache({ maxEntries: 300 });
const MANAGER_LIST_TTL_MS = 15000;

function invalidateManagerReportLists() {
    managerListCache.deleteByPrefix("manager:pending:");
    managerListCache.deleteByPrefix("manager:approved:");
}
// Keep the pending and approved list cache keyed by actor, role, filters and mode.
async function getCachedManagerReports(kind, {query, actor}, userId) {
    const filters = normalizeManagerReportFilters(query, kind === "pending");
    const cacheKey = managerReportCacheKey(kind, actor?.role, userId, filters);
    let data = managerListCache.get(cacheKey);
    if (data === undefined) {
        const isAdmin = actor?.role === "admin";
        data = kind === "pending"
            ? await ProductionTemp.getPending(userId, filters, isAdmin)
            : await ProductionTemp.getApproved(userId, filters, isAdmin);
        managerListCache.set(cacheKey, data, MANAGER_LIST_TTL_MS);
    }
    return data;
}

module.exports = { getCachedManagerReports, invalidateManagerReportLists };
