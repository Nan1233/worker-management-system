const db = require("../config/db");

const query = (sql, params = []) => new Promise((resolve, reject) => {
    db.query(sql, params, (error, result) => error ? reject(error) : resolve(result));
});

const upsert = async ({ jobType, jobKey, workDate = null, yearMonth = null, processId = null }) => {
    await query(
        `INSERT INTO integration_sync_jobs
         (job_type, job_key, work_date, year_month, process_id, status, attempts, next_retry_at)
         VALUES (?, ?, ?, ?, ?, 'pending', 0, NOW())
         ON DUPLICATE KEY UPDATE
            work_date = VALUES(work_date), year_month = VALUES(year_month),
            process_id = VALUES(process_id), status = 'pending', attempts = 0,
            next_retry_at = NOW(), last_error = NULL, completed_at = NULL`,
        [jobType, jobKey, workDate, yearMonth, processId]
    );
};

const claimReady = async (limit = 5) => {
    const rows = await query(
        `SELECT * FROM integration_sync_jobs
         WHERE status IN ('pending','failed')
           AND attempts < max_attempts
           AND (next_retry_at IS NULL OR next_retry_at <= NOW())
           AND (locked_at IS NULL OR locked_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE))
         ORDER BY next_retry_at ASC, id ASC
         LIMIT ?`,
        [Number(limit) || 5]
    );

    const claimed = [];
    for (const row of rows) {
        const result = await query(
            `UPDATE integration_sync_jobs
             SET status = 'processing', locked_at = NOW(), attempts = attempts + 1
             WHERE id = ? AND status IN ('pending','failed')`,
            [row.id]
        );
        if (result.affectedRows) claimed.push({ ...row, attempts: Number(row.attempts) + 1 });
    }
    return claimed;
};

const markSuccess = (id, resultUrl = null) => query(
    `UPDATE integration_sync_jobs SET status='success', result_url=?, completed_at=NOW(),
     locked_at=NULL, last_error=NULL WHERE id=?`, [resultUrl, id]
);

const markFailed = (id, attempts, error) => {
    const delays = [1, 5, 15, 30, 60, 60, 60, 60];
    const delay = delays[Math.min(Math.max(attempts - 1, 0), delays.length - 1)];
    return query(
        `UPDATE integration_sync_jobs SET status='failed', locked_at=NULL,
         last_error=?, next_retry_at=DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id=?`,
        [String(error?.message || error).slice(0, 4000), delay, id]
    );
};

const list = (limit = 100) => query(
    `SELECT * FROM integration_sync_jobs ORDER BY updated_at DESC LIMIT ?`,
    [Number(limit) || 100]
);

module.exports = { upsert, claimReady, markSuccess, markFailed, list };
