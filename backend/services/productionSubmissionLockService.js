const crypto = require("node:crypto");
const { query, getConnection } = require("../models/productionTempModelShared");

const LOCK_TIMEOUT_SECONDS = 2;

const buildSubmissionLockKey = (data = {}, machineLines = []) => {
    const processId = Number(data?.process_id || 0);
    const workDate = String(data?.work_date || "").slice(0, 10);
    const shift = String(data?.shift || "").trim().toUpperCase();
    const hasMachineLines = Array.isArray(machineLines) && machineLines.some(
        (line) => String(line?.machine_code || "").trim()
    );

    const scope = hasMachineLines
        ? `capacity:${processId}:${workDate}:${shift}`
        : `worker:${Number(data?.worker_id || 0)}:${processId}:${workDate}:${shift}`;

    // TiDB user-level lock names are limited to 64 characters.
    const digest = crypto
        .createHash("sha256")
        .update(scope, "utf8")
        .digest("hex")
        .slice(0, 32);
    return `ktc:pt:${digest}`;
};

const isSupportedLockFunctionError = (error) => {
    const message = String(error?.message || "").toLowerCase();
    return message.includes("get_lock") || message.includes("function get_lock") || message.includes("unknown function");
};

const withDistributedSubmissionLock = async (data, machineLines, task) => {
    const lockName = buildSubmissionLockKey(data, machineLines);
    let lockConnection = null;
    let acquired = false;
    let taskStarted = false;

    try {
        lockConnection = await getConnection();

        console.log("[KTC][PRODUCTION_TEMP_LOCK] acquiring", {
            lockName,
            processId: Number(data?.process_id || 0),
            workerId: Number(data?.worker_id || 0),
            workDate: String(data?.work_date || "").slice(0, 10),
            shift: String(data?.shift || "").trim().toUpperCase(),
        });

        const rows = await query(
            lockConnection,
            "SELECT GET_LOCK(?, ?) AS acquired",
            [lockName, LOCK_TIMEOUT_SECONDS]
        );
        const result = Number(rows?.[0]?.acquired);

        console.log("[KTC][PRODUCTION_TEMP_LOCK] acquire result", {
            lockName,
            result,
        });

        if (result !== 1) {
            const error = new Error("Hệ thống đang xử lý một báo cáo khác cùng máy/ca. Vui lòng gửi lại sau vài giây.");
            error.status = 409;
            error.code = result === 0 ? "PRODUCTION_SUBMISSION_BUSY" : "PRODUCTION_SUBMISSION_LOCK_FAILED";
            error.isPublic = true;
            throw error;
        }

        acquired = true;
        taskStarted = true;
        return await task();
    } catch (error) {
        if (isSupportedLockFunctionError(error)) {
            console.error("[KTC][PRODUCTION_TEMP] TiDB GET_LOCK is unavailable; refusing unsafe concurrent submission", {
                message: error?.message,
                code: error?.code,
                errno: error?.errno,
                sqlState: error?.sqlState,
            });
            const fallback = new Error("Hệ thống chưa bật khóa đồng bộ cho gửi báo cáo. Vui lòng thử lại sau.");
            fallback.status = 503;
            fallback.code = "PRODUCTION_SUBMISSION_LOCK_UNAVAILABLE";
            fallback.isPublic = true;
            throw fallback;
        }
        throw error;
    } finally {
        // Never let cleanup failure turn a successful report creation into HTTP 500.
        // Closing the connection is still attempted even if RELEASE_LOCK itself fails.
        if (lockConnection) {
            try {
                if (acquired) {
                    const releaseRows = await query(
                        lockConnection,
                        "SELECT RELEASE_LOCK(?) AS released",
                        [lockName]
                    );
                    console.log("[KTC][PRODUCTION_TEMP_LOCK] released", {
                        lockName,
                        released: Number(releaseRows?.[0]?.released),
                        taskStarted,
                    });
                }
            } catch (releaseError) {
                console.error("[KTC][PRODUCTION_TEMP_LOCK] release failed; closing DB session", {
                    lockName,
                    message: releaseError?.message,
                    code: releaseError?.code,
                    errno: releaseError?.errno,
                    sqlState: releaseError?.sqlState,
                });
            } finally {
                try {
                    await lockConnection.release();
                } catch (connectionReleaseError) {
                    console.error("[KTC][PRODUCTION_TEMP_LOCK] connection release failed", {
                        lockName,
                        message: connectionReleaseError?.message,
                        code: connectionReleaseError?.code,
                    });
                }
            }
        }
    }
};

module.exports = {
    LOCK_TIMEOUT_SECONDS,
    buildSubmissionLockKey,
    withDistributedSubmissionLock,
};
