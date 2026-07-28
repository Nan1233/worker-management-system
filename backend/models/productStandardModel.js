const db =
    require("../config/db");




const query = (sql, params = []) =>
    new Promise((resolve, reject) => {
        db.query(sql, params, (error, rows) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(rows);
        });
    });

exports.findByProcess = async (processId) => {
    const sql = `
        SELECT
            id,
            process_id,
            '' AS work_type,
            product_code,
            CAST(ROUND(standard_output) AS SIGNED) AS standard_output,
            COALESCE(exclude_kqd_from_tt, 0) AS exclude_kqd_from_tt
        FROM product_standards
        WHERE process_id = ?
          AND status = 'active'
        ORDER BY product_code ASC
    `;

    return query(sql, [processId]);
};