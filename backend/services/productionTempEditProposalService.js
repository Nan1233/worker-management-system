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


const createEditProposal = async ({ user, body }) => {
    const reportId = Number(body?.report_id);
    const reason = String(body?.reason || "").trim();
    const proposedData = body?.proposed_data;

    if (!Number.isInteger(reportId) || reportId <= 0) {
        const error = new Error("ID báo cáo không hợp lệ");
        error.status = 400;
        throw error;
    }
    if (reason.length < 2 || reason.length > 1000) {
        const error = new Error("Nội dung đề xuất sửa phải từ 2 đến 1000 ký tự");
        error.status = 400;
        throw error;
    }
    if (!proposedData || typeof proposedData !== "object") {
        const error = new Error("Thiếu nội dung thay đổi đề xuất");
        error.status = 400;
        throw error;
    }

    const report = await ProductionTemp.getDetail(reportId);
    if (!report) {
        const error = new Error("Không tìm thấy báo cáo");
        error.status = 404;
        throw error;
    }
    if (!(await canAccessProposalReport(user, reportId))) {
        const error = new Error("Báo cáo ngoài phạm vi phụ trách");
        error.status = 403;
        throw error;
    }

    const [result] = await db.promise().query(
        `INSERT INTO report_edit_proposals
            (report_id, proposer_user_id, proposer_role, reason, proposed_data, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [reportId, Number(user.id), String(user.role || "").toLowerCase(), reason, JSON.stringify(proposedData)]
    );

    return getProposalDetail(Number(result.insertId));
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
    if (!rows?.[0]) return null;
    return parseProposedData(rows[0]);
};


const updateEditProposal = async ({ user, id, body }) => {
    const current = await getProposalDetail(id);
    if (!current) {
        const error = new Error("Không tìm thấy đề xuất sửa");
        error.status = 404;
        throw error;
    }
    if (!(await canAccessProposalReport(user, current.report_id))) {
        const error = new Error("Đề xuất ngoài phạm vi phụ trách");
        error.status = 403;
        throw error;
    }

    const reason = String(body?.reason ?? current.reason).trim();
    const proposedData = body?.proposed_data ?? current.proposed_data;
    if (reason.length < 2 || reason.length > 1000) {
        const error = new Error("Nội dung đề xuất sửa phải từ 2 đến 1000 ký tự");
        error.status = 400;
        throw error;
    }

    await db.promise().query(
        `UPDATE report_edit_proposals
            SET reason = ?, proposed_data = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [reason, JSON.stringify(proposedData || {}), id]
    );
    return getProposalDetail(id);
};

const deleteEditProposal = async ({ user, id }) => {
    const current = await getProposalDetail(id);
    if (!current) {
        const error = new Error("Không tìm thấy đề xuất sửa");
        error.status = 404;
        throw error;
    }
    if (!(await canAccessProposalReport(user, current.report_id))) {
        const error = new Error("Đề xuất ngoài phạm vi phụ trách");
        error.status = 403;
        throw error;
    }
    await db.promise().query("DELETE FROM report_edit_proposals WHERE id = ?", [id]);
};

const createLegacyEditProposal = async ({ user, reportId, reason, proposedData }) => {
    const report = await ProductionTemp.getDetail(reportId);
    if (!report) {
        const error = new Error("Không tìm thấy báo cáo");
        error.status = 404;
        throw error;
    }
    if (!(await canAccessProposalReport(user, reportId))) {
        const error = new Error("Báo cáo ngoài phạm vi phụ trách");
        error.status = 403;
        throw error;
    }

    const [result] = await db.promise().query(
        `INSERT INTO report_edit_proposals
            (report_id, proposer_user_id, proposer_role, reason, proposed_data, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [
            reportId,
            Number(user.id),
            String(user.role || "").toLowerCase(),
            reason || "Tổ trưởng đề xuất sửa báo cáo",
            JSON.stringify(proposedData || report)
        ]
    );
    return getProposalDetail(Number(result.insertId));
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
    createLegacyEditProposal,
    canAccessProposalReport,
    setEditProposalStatus
};


