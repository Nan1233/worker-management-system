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
            // Keep the production response generic, but log the exact authorization
            // inputs so a 403 can be diagnosed from Render without exposing role data
            // to the browser.
            console.warn('[AUTH DEBUG] ROLE_DENIED', JSON.stringify({
                userId: Number(req.user.id || 0) || null,
                actualRole: actualRole || null,
                allowedRoles,
                method: req.method,
                path: req.originalUrl || req.path,
                requestId: req.requestId || null
            }));
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
