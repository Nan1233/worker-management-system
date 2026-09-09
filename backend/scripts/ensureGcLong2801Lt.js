const db = require('../config/db');

const query = (sql, params = []) => new Promise((resolve, reject) => {
  db.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});

/**
 * Ensures the canonical 2801-LT Lồng master data exists in production.
 *
 * This is intentionally idempotent because the current KTC deployment model
 * does not execute SQL migration files automatically at application startup.
 * 2801-LT is a Lồng product and therefore belongs to every active numeric GC
 * machine, not only machine 11.
 */
async function ensureGcLong2801Lt() {
  await query('START TRANSACTION');
  try {
    await query(`
      INSERT INTO product_standards
        (process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, status)
      VALUES (1, 'LONG', '2801-LT', 605, 0, 'active')
      ON DUPLICATE KEY UPDATE
        work_type = VALUES(work_type),
        standard_output = VALUES(standard_output),
        exclude_kqd_from_tt = VALUES(exclude_kqd_from_tt),
        status = 'active'
    `);

    await query(`
      INSERT INTO product_standard_versions
        (process_id, product_code, standard_output, exclude_kqd_from_tt,
         version_no, effective_from, effective_to, status)
      SELECT 1, '2801-LT', 605, 0, 1, '2026-09-08', NULL, 'active'
      WHERE NOT EXISTS (
        SELECT 1
        FROM product_standard_versions
        WHERE process_id = 1
          AND product_code = '2801-LT'
          AND status = 'active'
      )
    `);

    await query(`
      INSERT INTO product_machine_standards
        (process_id, product_code, machine_id, standard_output, standard_time_seconds,
         calculated_output_per_hour, source_name, source_row_number,
         effective_from, effective_to, is_active)
      SELECT
        1, '2801-LT', m.id, 605, 3600 / 605, 605,
        'KTC Lồng', NULL, '2026-09-08', NULL, 1
      FROM machines m
      WHERE m.process_id = 1
        AND m.status = 'active'
        AND TRIM(m.machine_code) REGEXP '^[0-9]+$'
        AND NOT EXISTS (
          SELECT 1
          FROM product_machine_standards pms
          WHERE pms.process_id = 1
            AND pms.product_code = '2801-LT'
            AND pms.machine_id = m.id
            AND pms.is_active = 1
        )
    `);

    await query('COMMIT');
    console.log('[KTC] 2801-LT Lồng master data ensured');
  } catch (error) {
    try { await query('ROLLBACK'); } catch (_) {}
    throw error;
  }
}

module.exports = ensureGcLong2801Lt;

if (require.main === module) {
  ensureGcLong2801Lt()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[KTC] Failed to ensure 2801-LT Lồng master data:', error);
      process.exit(1);
    });
}
