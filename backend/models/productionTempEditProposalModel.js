const db = require("../config/db");

const listEditProposals = async () => {
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
    return rows || [];
};

const createEditProposal = async ({ reportId, proposerUserId, proposerRole, reason, proposedData }) => {
    const [result] = await db.promise().query(
        `INSERT INTO report_edit_proposals
            (report_id, proposer_user_id, proposer_role, reason, proposed_data, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [reportId, proposerUserId, proposerRole, reason, JSON.stringify(proposedData)]
    );
    return Number(result.insertId);
};

const getProposalDetail = async (id) => {
    const [rows] = await db.promise().query(
        `SELECT p.*, u.full_name AS proposer_name, u.username AS proposer_username
           FROM report_edit_proposals p
           LEFT JOIN users u ON u.id = p.proposer_user_id
          WHERE p.id = ?
          LIMIT 1`,
        [id]
    );
    return rows?.[0] || null;
};

const updateEditProposal = async ({ id, reason, proposedData }) => {
    await db.promise().query(
        `UPDATE report_edit_proposals
            SET reason = ?, proposed_data = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [reason, JSON.stringify(proposedData || {}), id]
    );
};

const deleteEditProposal = async (id) => {
    await db.promise().query("DELETE FROM report_edit_proposals WHERE id = ?", [id]);
};

const setEditProposalStatus = async (id, status) => {
    await db.promise().query(
        "UPDATE report_edit_proposals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [status, id]
    );
};

module.exports = {
    listEditProposals,
    createEditProposal,
    getProposalDetail,
    updateEditProposal,
    deleteEditProposal,
    setEditProposalStatus
};
