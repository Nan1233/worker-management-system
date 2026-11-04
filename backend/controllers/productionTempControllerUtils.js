const {
    toPositiveInteger,
    getVietnamDateKey,
    dateKeyToUtcDay,
    validateWorkerWorkDate,
} = require("../utils/productionTempValidation");

const normalizeOperationType = (value) => {
    const normalized = String(value ?? '').trim().toUpperCase();
    const aliases = {
        CUT: 'CUT', CAT: 'CUT', 'CẮT': 'CUT',
        NEST: 'NEST', NESTING: 'NEST', LONG: 'NEST', 'LỒNG': 'NEST',
    };
    return aliases[normalized] || null;
};

const normalizeOperationMode = (value) => {
    const normalized = String(value ?? '').trim().toUpperCase();
    const aliases = {
        MANUAL: 'MANUAL', TAY: 'MANUAL',
        MACHINE: 'MACHINE', MAY: 'MACHINE', 'MÁY': 'MACHINE',
    };
    return aliases[normalized] || null;
};

const normalizeIds = (ids) => [
    ...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((id) => Number.isInteger(id) && id > 0)),
];


const normalizeReviewTargets = (body = {}) => {
    const targets = Array.isArray(body?.targets) ? body.targets : [];
    if (targets.length) {
        const seen = new Set();
        return targets
            .map((item) => ({
                id: toPositiveInteger(item?.id),
                expected_updated_at: item?.expected_updated_at ? String(item.expected_updated_at) : null,
            }))
            .filter((item) => item.id && !seen.has(item.id) && seen.add(item.id));
    }
    const ids = normalizeIds(body?.ids);
    // Legacy single-report review clients call POST /approve with { id }.
    // Keep that contract compatible while the current frontend sends { ids }.
    if (ids.length === 0) {
        const legacyId = toPositiveInteger(body?.id ?? body?.report_id);
        if (legacyId) ids.push(legacyId);
    }
    return ids.map((id) => ({ id, expected_updated_at: null }));
};

const requestMeta = (req) => ({
    // Express req.ip already applies the deployment-aware trust-proxy policy.
    // Never trust raw X-Forwarded-For supplied by an untrusted client for audit identity.
    ipAddress: req.ip || req.socket?.remoteAddress || null,
    userAgent: req.headers['user-agent'] || null,
});

module.exports = {
    toPositiveInteger,
    normalizeOperationType,
    normalizeOperationMode,
    getVietnamDateKey,
    dateKeyToUtcDay,
    validateWorkerWorkDate,
    normalizeIds,
    normalizeReviewTargets,
    requestMeta,
};
