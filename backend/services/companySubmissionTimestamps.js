'use strict';

// One bounded query per chunk avoids a multi-thousand placeholder statement on
// TiDB / Cloudflare, while preserving the DB-local submission timestamp.
const DEFAULT_BATCH_SIZE = 400;

async function attachSubmissionTimestamps(processData, processCodes, query, { batchSize = DEFAULT_BATCH_SIZE } = {}) {
  if (typeof query !== 'function') throw new TypeError('query is required');
  const size = Number(batchSize);
  if (!Number.isSafeInteger(size) || size < 1 || size > 500) {
    throw new RangeError('invalid submission timestamp batch size');
  }

  const reports = processCodes.flatMap((code) =>
    Array.isArray(processData?.[code]?.reports) ? processData[code].reports : []
  );
  const ids = [...new Set(reports
    .map((report) => Number(report?.source_temp_id))
    .filter((id) => Number.isSafeInteger(id) && id > 0)
  )];
  if (!ids.length) return;

  const byId = new Map();
  // Sequential batches prevent bursty subrequests and large SQL parameter arrays.
  for (let i = 0; i < ids.length; i += size) {
    const batch = ids.slice(i, i + size);
    const placeholders = batch.map(() => '?').join(',');
    const [rows] = await query(
      `SELECT id, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS submitted_at
         FROM production_reports_temp
        WHERE id IN (${placeholders})`,
      batch
    );
    for (const row of rows || []) {
      const id = Number(row.id);
      if (Number.isSafeInteger(id) && id > 0 && row.submitted_at != null) {
        byId.set(id, row.submitted_at);
      }
    }
  }

  for (const report of reports) {
    const id = Number(report?.source_temp_id);
    if (byId.has(id)) {
      report.submitted_at = byId.get(id);
    }
    // An approved report with no available source row may still have a
    // previously resolved submission time. Never erase that historical value.
  }
}

module.exports = { attachSubmissionTimestamps, DEFAULT_BATCH_SIZE };
