const db = require("../config/db");

const query = (sql, params = []) => new Promise((resolve, reject) => {
    db.query(sql, params, (error, result) => error ? reject(error) : resolve(result));
});

const upsert = async ({ jobType, jobKey, workDate = null, reportMonth = null, processId = null }) => {
    await query(
        `INSERT INTO integration_sync_jobs
         (job_type, job_key, work_date, report_month, process_id, status, attempts, next_retry_at)
         VALUES (?, ?, ?, ?, ?, 'pending', 0, NOW())
         ON DUPLICATE KEY UPDATE
            work_date = VALUES(work_date), report_month = VALUES(report_month),
            process_id = VALUES(process_id),
            status = IF(status='processing','processing','pending'),
            attempts = IF(status='processing',attempts,0),
            next_retry_at = IF(status='processing',next_retry_at,NOW()),
            locked_at = IF(status='processing',locked_at,NULL),
            last_error = IF(status='processing',last_error,NULL),
            completed_at = IF(status='processing',completed_at,NULL)`,
        [jobType, jobKey, workDate, reportMonth, processId]
    );
};

const recoverStale = async () => query(
    `UPDATE integration_sync_jobs
     SET status='failed', locked_at=NULL,
         last_error=COALESCE(last_error, 'Job processing bị gián đoạn; hệ thống tự đưa vào retry'),
         next_retry_at=NOW()
     WHERE status='processing'
       AND locked_at IS NOT NULL
       AND locked_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)
       AND attempts < max_attempts`
);

const claimReady = async (limit = 5) => {
    await recoverStale();
    const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 20);
    const rows = await query(
        `SELECT * FROM integration_sync_jobs
         WHERE status IN ('pending','failed')
           AND attempts < max_attempts
           AND (next_retry_at IS NULL OR next_retry_at <= NOW())
           AND locked_at IS NULL
         ORDER BY COALESCE(next_retry_at, created_at) ASC, id ASC
         LIMIT ?`,
        [safeLimit]
    );

    const claimed = [];
    for (const row of rows) {
        const result = await query(
            `UPDATE integration_sync_jobs
             SET status='processing', locked_at=NOW(), attempts=attempts+1
             WHERE id=?
               AND status IN ('pending','failed')
               AND locked_at IS NULL
               AND attempts < max_attempts`,
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
         last_error=?, next_retry_at=IF(attempts>=max_attempts,NULL,DATE_ADD(NOW(), INTERVAL ? MINUTE)) WHERE id=?`,
        [String(error?.message || error).slice(0, 4000), delay, id]
    );
};

const list = (limit = 100) => query(
    `SELECT * FROM integration_sync_jobs ORDER BY updated_at DESC LIMIT ?`,
    [Math.min(Math.max(Number(limit) || 100, 1), 500)]
);

const getDiagnostics = async () => {
    const rows = await query(
        `SELECT status, job_type, COUNT(*) AS total
         FROM integration_sync_jobs
         GROUP BY status, job_type`
    );
    return rows;
};

module.exports = { upsert, recoverStale, claimReady, markSuccess, markFailed, list, getDiagnostics };
