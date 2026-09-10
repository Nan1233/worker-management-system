const crypto = require("node:crypto");
const { query, getConnection } = require("../models/productionTempModelShared");
const { buildLogicalDuplicateKey } = require("./logicalDuplicateReportService");

const LOCK_TIMEOUT_SECONDS = 2;
const LOCK_PREFIX = "ktc:pt2:";

const buildSubmissionLockKey = (data = {}, machineLines = []) => {
    const workerId = Number(data?.worker_id || data?.workerId || 0);
    const clientRequestId = String(data?.client_request_id || "").trim();
    const processId = Number(data?.process_id || 0);
    const workDate = String(data?.work_date || "").slice(0, 10);
    const shift = String(data?.shift || "").trim().toUpperCase();

    // Serialize the business duplicate identity, not only the browser request.
    // Different client_request_id values can still represent the same report.
    // Keeping them on the same distributed lock prevents the database duplicate
    // lock row / unique index from becoming the contention point.
    let logicalKey = "";
    try {
        logicalKey = String(buildLogicalDuplicateKey({
            workerId,
            processId,
            workDate,
            shift,
            operationMode: data?.operation_mode ?? data?.operationMode,
            machineNo: data?.machine_no,
            productName: data?.product_name,
            machineLines: Array.isArray(machineLines) ? machineLines : [],
        }) || "").trim();
    } catch (error) {
        console.warn("[KTC][PRODUCTION_TEMP_LOCK] logical key build failed; falling back", {
            message: error?.message,
        });
    }

    const hasMachineLines = Array.isArray(machineLines) && machineLines.some(
        (line) => String(line?.machine_code || "").trim()
    );

    const scope = logicalKey
        ? `logical:${logicalKey}`
        : clientRequestId
            ? `client:${workerId}:${clientRequestId}`
            : hasMachineLines
                ? `capacity:${processId}:${workDate}:${shift}`
                : `worker:${workerId}:${processId}:${workDate}:${shift}`;

    // TiDB user-level lock names are limited to 64 characters.
    const digest = crypto
        .createHash("sha256")
        .update(scope, "utf8")
        .digest("hex")
        .slice(0, 32);
    return `${LOCK_PREFIX}${digest}`;
};

const isSupportedLockFunctionError = (error) => {
    const message = String(error?.message || "").toLowerCase();
    return message.includes("get_lock") || message.includes("function get_lock") || message.includes("unknown function");
};

const isCloudflareWorker = () => Boolean(globalThis.__KTC_CLOUDFLARE_WORKER);

const createCloudflareLockSession = async () => {
    const tidbConnect = globalThis.__KTC_TIDB_CONNECT;
    if (typeof tidbConnect !== "function") {
        throw new Error("TiDB Serverless Driver chưa được khởi tạo trong Cloudflare Worker");
    }

    const databaseUrl = String(process.env.TIDB_DATABASE_URL || "").trim();
    if (!databaseUrl) {
        throw new Error("Cloudflare Worker thiếu secret TIDB_DATABASE_URL");
    }

    const connection = tidbConnect({ url: databaseUrl });
    if (!connection || typeof connection.persist !== "function") {
        const error = new Error("TiDB Serverless driver không hỗ trợ stateful session cho GET_LOCK");
        error.code = "PRODUCTION_SUBMISSION_STATEFUL_SESSION_UNAVAILABLE";
        throw error;
    }

    return connection.persist();
};

const executeLockQuery = async (session, sql, params = []) => {
    const result = await session.execute(sql, params, { fullResult: true });
    if (result && typeof result === "object" && Array.isArray(result.rows)) {
        return result.rows;
    }
    return Array.isArray(result) ? result : [];
};

const withDistributedSubmissionLock = async (data, machineLines, task) => {
    const lockName = buildSubmissionLockKey(data, machineLines);
    let lockSession = null;
    let lockConnection = null;
    let acquired = false;
    let taskStarted = false;

    try {
        if (isCloudflareWorker()) {
            lockSession = await createCloudflareLockSession();
        } else {
            lockConnection = await getConnection();
        }

        console.log("[KTC][PRODUCTION_TEMP_LOCK] acquiring", {
            lockName,
            statefulSession: Boolean(lockSession),
            processId: Number(data?.process_id || 0),
            workerId: Number(data?.worker_id || 0),
            clientRequestId: String(data?.client_request_id || "").trim() || null,
            workDate: String(data?.work_date || "").slice(0, 10),
            shift: String(data?.shift || "").trim().toUpperCase(),
        });

        const rows = lockSession
            ? await executeLockQuery(lockSession, "SELECT GET_LOCK(?, ?) AS acquired", [lockName, LOCK_TIMEOUT_SECONDS])
            : await query(lockConnection, "SELECT GET_LOCK(?, ?) AS acquired", [lockName, LOCK_TIMEOUT_SECONDS]);
        const result = Number(rows?.[0]?.acquired);

        console.log("[KTC][PRODUCTION_TEMP_LOCK] acquire result", { lockName, result });

        if (result !== 1) {
            const error = new Error("Hệ thống đang xử lý một báo cáo trùng hoặc cùng yêu cầu. Vui lòng gửi lại sau vài giây.");
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
        if (lockSession) {
            try {
                if (acquired) {
                    const releaseRows = await executeLockQuery(lockSession, "SELECT RELEASE_LOCK(?) AS released", [lockName]);
                    console.log("[KTC][PRODUCTION_TEMP_LOCK] released", {
                        lockName,
                        released: Number(releaseRows?.[0]?.released),
                        taskStarted,
                    });
                }
            } catch (releaseError) {
                console.error("[KTC][PRODUCTION_TEMP_LOCK] release failed; closing stateful session", {
                    lockName,
                    message: releaseError?.message,
                    code: releaseError?.code,
                });
            } finally {
                try {
                    if (typeof lockSession.close === "function") await lockSession.close();
                } catch (sessionCloseError) {
                    console.error("[KTC][PRODUCTION_TEMP_LOCK] stateful session close failed", {
                        lockName,
                        message: sessionCloseError?.message,
                        code: sessionCloseError?.code,
                    });
                }
            }
        } else if (lockConnection) {
            try {
                if (acquired) {
                    const releaseRows = await query(lockConnection, "SELECT RELEASE_LOCK(?) AS released", [lockName]);
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
