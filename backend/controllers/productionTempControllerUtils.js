'use strict';

const toPositiveInteger = (value) => {
    const numberValue = Number(value);
    return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
};

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

const getVietnamDateKey = () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const values = Object.fromEntries(
        parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
    );
    return `${values.year}-${values.month}-${values.day}`;
};

const dateKeyToUtcDay = (dateKey) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || '').trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const value = Date.UTC(year, month - 1, day);
    const date = new Date(value);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return Math.floor(value / 86400000);
};

const validateWorkerWorkDate = (workDate) => {
    const selectedDay = dateKeyToUtcDay(workDate);
    const todayDay = dateKeyToUtcDay(getVietnamDateKey());
    if (selectedDay === null || todayDay === null) return 'Ngày làm việc không hợp lệ';
    if (selectedDay > todayDay) return 'Không được gửi báo cáo cho ngày trong tương lai';
    if (selectedDay < todayDay - 14) return 'Chỉ được gửi báo cáo trong vòng 14 ngày gần nhất';
    return null;
};

const normalizeIds = (ids) => {
    const values = Array.isArray(ids) ? ids : [];
    const validIds = values.map(Number).filter((id) => Number.isInteger(id) && id > 0);
    return [...new Set(validIds)];
};


const createReviewTargetVersionConflictError = () => {
    const error = new Error("Danh sách báo cáo chứa phiên bản không thống nhất. Hãy tải lại danh sách rồi chọn lại.");
    error.status = 409;
    error.code = "REVIEW_TARGET_VERSION_CONFLICT";
    error.isPublic = true;
    return error;
};

const normalizeReviewTargets = (body = {}) => {
    const targets = Array.isArray(body?.targets) ? body.targets : [];
    if (targets.length) {
        const seen = new Map();
        const normalized = [];
        for (const item of targets) {
            const id = toPositiveInteger(item?.id);
            if (!id) continue;
            const expected_updated_at = item?.expected_updated_at ? String(item.expected_updated_at) : null;
            if (seen.has(id)) {
                // Never silently discard a conflicting optimistic-lock token:
                // the same report was selected from two different snapshots.
                if (seen.get(id) !== expected_updated_at) {
                    throw createReviewTargetVersionConflictError();
                }
                continue;
            }
            seen.set(id, expected_updated_at);
            normalized.push({ id, expected_updated_at });
        }
        return normalized;
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
