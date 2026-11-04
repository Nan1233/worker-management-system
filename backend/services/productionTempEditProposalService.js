const db = require("../config/db");
const ProductionTemp = require("../models/productionTempModel");

const canAccessProposalReport = async (user, reportId) => {
    if (user?.role === "admin") return true;
    return ProductionTemp.canManageReport(Number(reportId), user.id, false);
};

const parseProposedData = (row) => {
    if (typeof row.proposed_data !== "string") return row;
    try {
        row.proposed_data = JSON.parse(row.proposed_data);
    } catch {
        row.proposed_data = {};
    }
    return row;
};

const listEditProposals = async (user) => {
    const [rows] = await db.promise().query(
        `SELECT p.*, u.full_name AS proposer_name, u.username AS proposer_username,
                prt.work_date, prt.shift, prt.process_id, prt.machine_no, prt.product_name,
                w.worker_code, wu.full_name AS worker_name
           FROM report_edit_proposals p
           LEFT JOIN users u ON u.id = p.proposer_user_id
           LEFT JOIN production_reports_temp prt ON prt.id = p.report_id
           LEFT JOIN workers w ON w.id = prt.worker_id
           LEFT JOIN users wu ON wu.id = w.user_id
          ORDER BY p.updated_at DESC, p.id DESC
          LIMIT 300`
    );

    const accessible = [];
    for (const row of rows || []) {
        if (await canAccessProposalReport(user, row.report_id)) {
            accessible.push(parseProposedData(row));
        }
    }
    return accessible;
};

module.exports = { listEditProposals };
