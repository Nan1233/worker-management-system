const isProduction = () => process.env.NODE_ENV === "production";

const publicMessage = (error, fallback = "Đã xảy ra lỗi hệ thống") => {
    if (error?.isPublic && error?.message) return error.message;

    // Expected client/business errors (4xx) should explain what the user must
    // correct, even in production. Never expose raw database/driver failures.
    const status = Number(error?.status || 0);
    const hasDatabaseDetails = Boolean(
        error?.sqlState ||
        error?.sqlMessage ||
        error?.errno ||
        /^ER_[A-Z0-9_]+$/.test(String(error?.code || ""))
    );
    if (status >= 400 && status < 500 && !hasDatabaseDetails && error?.message) {
        return error.message;
    }

    return isProduction() ? fallback : (error?.message || fallback);
};

const publicError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    error.isPublic = true;
    return error;
};

module.exports = { publicMessage, publicError, isProduction };
