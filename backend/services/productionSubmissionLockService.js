const crypto = require("node:crypto");
const { query, getConnection } = require("../models/productionTempModelShared");

const LOCK_TIMEOUT_SECONDS = 2;

const buildSubmissionLockKey = (data = {}, machineLines = []) => {
    const processId = Number(data?.process_id || 0);
    const workDate = String(data?.work_date || "").slice(0, 10);
    const shift = String(data?.shift || "").trim().toUpperCase();
    const machines = [...new Set(
        (Array.isArray(machineLines) ? machineLines : [])
            .map((line) => String(line?.machine_code || "").trim().toUpperCase())
            .filter(Boolean)
    )].sort();

    const scope = machines.length
        ? `machine:${processId}:${workDate}:${shift}:${machines.join(",")}`
        : `worker:${Number(data?.worker_id || 0)}:${processId}:${workDate}:${shift}`;

    return `ktc:production-temp:${crypto.createHash("sha256").update(scope, "utf8").digest("hex")}`;
};

const isSupportedLockFunctionError = (error) => {
    const message = String(error?.message || "").toLowerCase();
    return message.includes("get_lock") || message.includes("function get_lock") || message.includes("unknown function");
};

const withDistributedSubmissionLock = async (data, machineLines, task) => {
    const lockName = buildSubmissionLockKey(data, machineLines);
    const lockConnection = await getConnection();
    let acquired = false;

    try {
        const rows = await query(
            lockConnection,
            "SELECT GET_LOCK(?, ?) AS acquired",
            [lockName, LOCK_TIMEOUT_SECONDS]
        );
        const result = Number(rows?.[0]?.acquired);

        if (result !== 1) {
            const error = new Error("Hệ thống đang xử lý một báo cáo khác cùng máy/ca. Vui lòng gửi lại sau vài giây.");
            error.status = 409;
            error.code = result === 0 ? "PRODUCTION_SUBMISSION_BUSY" : "PRODUCTION_SUBMISSION_LOCK_FAILED";
            error.isPublic = true;
            throw error;
        }

        acquired = true;
        return await task();
    } catch (error) {
        if (isSupportedLockFunctionError(error)) {
            console.error("[KTC][PRODUCTION_TEMP] TiDB GET_LOCK is unavailable; refusing unsafe concurrent submission", {
                message: error?.message,
                code: error?.code,
            });
            const fallback = new Error("Hệ thống chưa bật khóa đồng bộ cho gửi báo cáo. Vui lòng thử lại sau.");
            fallback.status = 503;
            fallback.code = "PRODUCTION_SUBMISSION_LOCK_UNAVAILABLE";
            fallback.isPublic = true;
            throw fallback;
        }
        throw error;
    } finally {
        try {
            if (acquired) {
                await query(lockConnection, "SELECT RELEASE_LOCK(?) AS released", [lockName]);
            }
        } finally {
            lockConnection.release();
        }
    }
};

module.exports = {
    LOCK_TIMEOUT_SECONDS,
    buildSubmissionLockKey,
    withDistributedSubmissionLock,
};
