// Application transaction failure boundary, independent from the submit use case.
// Optional rollbackOperation/logger let regression tests simulate rollback failure
// without a database and preserve the original SQL error object.
const { rollback } = require("../models/productionTempModelShared");

const rollbackOrThrow = async (connection, originalError, rollbackOperation = rollback, logger = console) => {
    const result = await rollbackOperation(connection);
    if (result?.ok === false) {
        const diagnostic = (value) => ({
            name: value?.name || null,
            message: String(value?.message || value || "Unknown error").slice(0, 500),
            code: value?.code || null,
            errno: value?.errno ?? null,
            sqlState: value?.sqlState || null,
            status: value?.status ?? value?.statusCode ?? null,
        });
        // Preserve both failures in logs. The rollback error is secondary and must
        // not erase the SQL/transaction error that caused the rollback in the first place.
        logger.error("[KTC][REPORT] transaction rollback failed", JSON.stringify({
            originalError: originalError ? diagnostic(originalError) : null,
            rollbackError: diagnostic(result.error),
        }));
        // Rollback is secondary: retain the actual SQL/transaction failure so
        // callers can distinguish a TiDB query error from a rollback transport error.
        // The rollback failure remains attached for diagnostics and is never hidden.
        if (originalError && typeof originalError === "object") {
            originalError.rollbackFailed = true;
            originalError.rollbackError = result.error;
        }
        return result;
    }
    return result;
};


module.exports = { rollbackOrThrow };
