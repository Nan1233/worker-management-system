'use strict';
const { MACHINE_LINE_FIELDS } = require('../services/approvedVersionSnapshotService');

function dbJson(value) {
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}
function httpError(status,code,message) { return Object.assign(new Error(message),{status,code,isPublic:true}); }
async function replaceApprovedChildrenFromSnapshot({ reportId, snapshot, executor }) {
  const id = Number(reportId);

  await executor.query('DELETE FROM production_report_defects WHERE report_id=?', [id]);
  for (const item of snapshot.defects) {
    await executor.query(
      'INSERT INTO production_report_defects(report_id,defect_type_id,quantity) VALUES(?,?,?)',
      [id, Number(item.defect_type_id), item.quantity]
    );
  }

  await executor.query('DELETE FROM production_report_deductions WHERE report_id=?', [id]);
  for (const item of snapshot.deductions) {
    await executor.query(
      'INSERT INTO production_report_deductions(report_id,deduction_type_id,hours) VALUES(?,?,?)',
      [id, Number(item.deduction_type_id), item.hours]
    );
  }

  await executor.query(
    `DELETE md FROM production_report_machine_defects md
      INNER JOIN production_report_machine_lines ml ON ml.id=md.machine_line_id
      WHERE ml.report_id=?`,
    [id]
  );
  await executor.query('DELETE FROM production_report_machine_lines WHERE report_id=?', [id]);

  const insertColumns = MACHINE_LINE_FIELDS;
  for (const entry of snapshot.machineLines) {
    const line = entry.line;
    const values = insertColumns.map((field) => {
      if (field === 'deductions_json' || field === 'defects_json') return dbJson(line[field]);
      return line[field] ?? null;
    });
    const [insertResult] = await executor.query(
      `INSERT INTO production_report_machine_lines(report_id,${insertColumns.join(',')})
       VALUES(${['?', ...insertColumns.map(() => '?')].join(',')})`,
      [id, ...values]
    );
    const newLineId = Number(insertResult.insertId);
    if (!Number.isInteger(newLineId) || newLineId <= 0) {
      throw httpError(500, 'ROLLBACK_MACHINE_LINE_INSERT_FAILED', 'Không lấy được ID dòng máy sau khi khôi phục');
    }
    for (const defect of entry.defects) {
      await executor.query(
        `INSERT INTO production_report_machine_defects
          (machine_line_id,defect_type_id,defect_code,defect_name,quantity)
         VALUES(?,?,?,?,?)`,
        [newLineId, defect.defect_type_id ?? null, String(defect.defect_code), defect.defect_name ?? null, defect.quantity]
      );
    }
  }
}

module.exports = { replaceApprovedChildrenFromSnapshot };
