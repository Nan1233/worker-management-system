'use strict';

function decideStandardImport(existingRows, payload) {
  const rows = Array.isArray(existingRows) ? existingRows : [];
  if (!rows.length) return { action: 'insert' };

  const incomingOutput = Number(payload.standard_output);
  const incomingExclude = Number(payload.exclude_kqd_from_tt || 0);
  const equivalent = rows.every((row) =>
    Math.abs(Number(row.standard_output) - incomingOutput) <= 0.000001 &&
    Number(row.exclude_kqd_from_tt || 0) === incomingExclude
  );

  if (equivalent) {
    return { action: 'skip', id: Number(rows[0].id) };
  }

  const error = new Error(
    `Không thể nhập định mức ${payload.product_code} / ${payload.work_type}: đã có định mức Active khác giá trị. Hãy đối chiếu và xử lý bản ghi hiện có trước khi nhập.`
  );
  error.status = 409;
  error.code = 'ACTIVE_STANDARD_IMPORT_CONFLICT';
  error.details = {
    process_id: Number(payload.process_id),
    product_code: String(payload.product_code || '').trim(),
    work_type: String(payload.work_type || '').trim(),
    incoming_standard_output: incomingOutput,
    existing: rows.map((row) => ({
      id: Number(row.id),
      standard_output: Number(row.standard_output),
      exclude_kqd_from_tt: Number(row.exclude_kqd_from_tt || 0),
    })),
  };
  throw error;
}

module.exports = { decideStandardImport };
