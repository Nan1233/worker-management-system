const db = require('../config/db');

const query = (executor, sql, params = []) => executor.promise
  ? executor.promise().query(sql, params)
  : executor.query(sql, params);

module.exports = {
    async copyMachineLinesToApproved(tempReportId, approvedReportId, connection) {
        await query(
            connection,
            `INSERT INTO production_report_machine_lines
             (report_id, machine_event_id, machine_id, machine_code, product_standard_id, standard_version_id, machine_standard_id,
              product_code, machine_time_hours, standard_output, standard_time_seconds, standard_source, exclude_kqd_from_tt,
              ok_quantity, ng_quantity, maximum_output, deduction_time_hours, deductions_json, counted_output, earned_standard_hours, defects_json, sort_order)
             SELECT ?, machine_event_id, machine_id, machine_code, product_standard_id, standard_version_id, machine_standard_id,
                    product_code, machine_time_hours, standard_output, standard_time_seconds, standard_source, exclude_kqd_from_tt,
                    ok_quantity, ng_quantity, maximum_output, deduction_time_hours, deductions_json, counted_output, earned_standard_hours, defects_json, sort_order
             FROM production_temp_machine_lines
             WHERE temp_report_id=?
             ORDER BY sort_order,id`,
            [Number(approvedReportId), Number(tempReportId)]
        );

        const [sourceRows] = await query(
            connection,
            `SELECT id FROM production_temp_machine_lines WHERE temp_report_id=? ORDER BY sort_order,id`,
            [Number(tempReportId)]
        );

        if (!sourceRows.length) return;

        const sourceIds = sourceRows.map((row) => Number(row.id)).filter(Number.isInteger);
        const placeholders = sourceIds.map(() => '?').join(',');
        await query(
            connection,
            `INSERT INTO production_report_machine_defects (machine_line_id, defect_code, quantity)
             SELECT prml.id, d.defect_code, d.quantity
             FROM production_temp_machine_defects d
             JOIN production_temp_machine_lines ptml ON ptml.id=d.machine_line_id
             JOIN production_report_machine_lines prml
               ON prml.report_id=? AND prml.machine_code=ptml.machine_code
             WHERE d.machine_line_id IN (${placeholders})`,
            [Number(approvedReportId), ...sourceIds]
        );
    },

    async approveSelected(...args) {
        throw new Error('APPROVE_SELECTED_IMPLEMENTATION_PLACEHOLDER');
    },
};
