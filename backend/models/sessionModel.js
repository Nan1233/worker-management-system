const db = require("../config/db");

exports.createSession = (data, callback) => {
    const sql = `
        INSERT INTO user_sessions (
            user_id,
            refresh_token,
            device_id,
            device_name,
            user_agent,
            ip_address,
            expires_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
        data.user_id,
        data.refresh_token,
        data.device_id,
        data.device_name || null,
        data.user_agent || null,
        data.ip_address || null,
        data.expires_at
    ];

    db.query(sql, params, callback);
};

exports.findByRefreshToken = (refreshToken, callback) => {
    const sql = `
        SELECT
            us.id,
            us.user_id,
            us.refresh_token,
            us.device_id,
            us.device_name,
            us.user_agent,
            us.ip_address,
            us.last_used_at,
            us.expires_at,
            us.revoked_at,
            us.created_at,

            u.username,
            u.full_name,
            u.role,
            u.status,

            w.id AS worker_id,
            w.status AS worker_status

        FROM user_sessions us

        INNER JOIN users u
            ON u.id = us.user_id

        LEFT JOIN workers w
            ON w.user_id = u.id

        WHERE us.refresh_token = ?
          AND us.revoked_at IS NULL

        LIMIT 1
    `;

    db.query(sql, [refreshToken], callback);
};

exports.updateLastUsed = (refreshToken, callback) => {
    const sql = `
        UPDATE user_sessions
        SET last_used_at = NOW()
        WHERE refresh_token = ?
          AND revoked_at IS NULL
    `;

    db.query(sql, [refreshToken], callback);
};

exports.revokeSession = (refreshToken, callback) => {
    const sql = `
        UPDATE user_sessions
        SET revoked_at = NOW()
        WHERE refresh_token = ?
          AND revoked_at IS NULL
    `;

    db.query(sql, [refreshToken], callback);
};

exports.revokeAllUserSessions = (userId, callback) => {
    const sql = `
        UPDATE user_sessions
        SET revoked_at = NOW()
        WHERE user_id = ?
          AND revoked_at IS NULL
    `;

    db.query(sql, [userId], callback);
};

exports.deleteExpiredSessions = (callback) => {
    const sql = `
        DELETE FROM user_sessions
        WHERE revoked_at IS NOT NULL
          AND revoked_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
    `;

    db.query(sql, callback);
};