const isProduction = () => process.env.NODE_ENV === "production";

const publicMessage = (error, fallback = "Đã xảy ra lỗi hệ thống") => {
    if (error?.isPublic && error?.message) return error.message;
    return isProduction() ? fallback : (error?.message || fallback);
};

const publicError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    error.isPublic = true;
    return error;
};

module.exports = { publicMessage, publicError, isProduction };
