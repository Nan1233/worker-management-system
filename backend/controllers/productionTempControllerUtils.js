'use strict';

const toPositiveInteger = (value) => {
    const numberValue = Number(value);
    return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
};

const { normalizeOperationType, normalizeOperationMode } = require('../domain/operationNormalization');
const { publicError } = require('../utils/httpError');

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
    const validIds = values.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0);
    return [...new Set(validIds)];
};


const createReviewTargetVersionConflictError = () => publicError(
    "Danh sách báo cáo chứa phiên bản không thống nhất. Hãy tải lại danh sách rồi chọn lại.",
    409,
    "REVIEW_TARGET_VERSION_CONFLICT",
);

const normalizeReviewTargets = (body = {}) => {
    const targets = Array.isArray(body?.targets) ? body.targets : [];
    if (targets.length) {
        const seen = new Map();
        const normalized = [];
        for (const item of targets) {
            const rawId = item?.id;
            const id = (typeof rawId === "number" || (typeof rawId === "string" && /^[0-9]+$/.test(rawId)))
                ? toPositiveInteger(rawId) : null;
            if (!id || !Number.isSafeInteger(id)) {
                throw publicError("ID báo cáo không hợp lệ. Hãy tải lại danh sách.", 400, "INVALID_REVIEW_TARGET");
            }
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
        // Legacy clients send only ids, modern review clients send both ids
        // and versioned targets. Never process a different target set than
        // the one validated by the HTTP request schema.
        if (Array.isArray(body?.ids)) {
            const requestedIds = normalizeIds(body.ids);
            const selected = new Set(normalized.map((item) => item.id));
            if (requestedIds.length !== body.ids.length
                || requestedIds.length !== selected.size
                || requestedIds.some((id) => !selected.has(id))) {
                throw publicError(
                    "Danh sách báo cáo và phiên bản không khớp. Hãy tải lại danh sách rồi thử lại.",
                    409, "REVIEW_TARGET_IDS_MISMATCH",
                );
            }
        }
        return normalized;
    }
    if (body?.targets !== undefined && !Array.isArray(body.targets)) {
        throw publicError("Danh sách phiên bản báo cáo không hợp lệ.", 400, "INVALID_REVIEW_TARGET");
    }
    if (body?.ids !== undefined && !Array.isArray(body.ids)) {
        throw publicError("Danh sách ID báo cáo không hợp lệ.", 400, "INVALID_REVIEW_TARGET");
    }
    if (Array.isArray(body?.ids) && body.ids.some((value) =>
        !(typeof value === "number" || (typeof value === "string" && /^[0-9]+$/.test(value)))
        || !toPositiveInteger(value) || !Number.isSafeInteger(Number(value)))) {
        throw publicError("ID báo cáo không hợp lệ. Hãy tải lại danh sách.", 400, "INVALID_REVIEW_TARGET");
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
