const checkRole = (...roles) => {
    const allowedRoles = roles.map((role) => String(role || '').trim().toLowerCase());

    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                code: 'AUTH_REQUIRED',
                message: 'Chưa xác thực'
            });
        }

        const actualRole = String(req.user.role || '').trim().toLowerCase();
        if (!allowedRoles.includes(actualRole)) {
            return res.status(403).json({
                success: false,
                code: 'ROLE_DENIED',
                message: 'Bạn không có quyền truy cập'
            });
        }

        next();
    };
};

module.exports = checkRole;
