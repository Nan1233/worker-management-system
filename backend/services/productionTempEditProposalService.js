const EditProposalModel = require("../models/productionTempEditProposalModel");
const ProductionTemp = require("../models/productionTempModel");
const { updateTempReportUseCase } = require("./productionTempUpdateUseCase");

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
    const rows = await EditProposalModel.listEditProposals();

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

    const proposalId = await EditProposalModel.createEditProposal({
        reportId,
        proposerUserId: Number(user.id),
        proposerRole: String(user.role || "").toLowerCase(),
        reason,
        proposedData
    });
    return getProposalDetail(proposalId);
};

const getProposalDetail = async (id) => {
    const row = await EditProposalModel.getProposalDetail(id);
    return row ? parseProposedData(row) : null;
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

    await EditProposalModel.updateEditProposal({ id, reason, proposedData });
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
    await EditProposalModel.deleteEditProposal(id);
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

    const proposalId = await EditProposalModel.createEditProposal({
        reportId,
        proposerUserId: Number(user.id),
        proposerRole: String(user.role || "").toLowerCase(),
        reason: reason || "Tổ trưởng đề xuất sửa báo cáo",
        proposedData: proposedData || report
    });
    return getProposalDetail(proposalId);
};

const setEditProposalStatus = async (id, status) => {
    await EditProposalModel.setEditProposalStatus(id, status);
};


const reviewEditProposal = async ({ user, id, body = {} }) => {
    const decision = String(body?.decision || "").toLowerCase();
    const statusAfter = String(body?.status_after || "pending").toLowerCase();
    const current = await getProposalDetail(id);

    if (!current) {
        return { status: 404, body: { success: false, message: "Không tìm thấy đề xuất sửa" } };
    }
    if (!(await canAccessProposalReport(user, current.report_id))) {
        return { status: 403, body: { success: false, message: "Đề xuất ngoài phạm vi phụ trách" } };
    }
    if (current.status !== "pending") {
        return { status: 400, body: { success: false, message: "Đề xuất này đã được xử lý" } };
    }

    if (decision === "reject") {
        const reason = String(body?.reason || "").trim();
        if (reason.length < 2) {
            return { status: 400, body: { success: false, message: "Vui lòng nhập lý do từ chối" } };
        }
        await setEditProposalStatus(id, "rejected");
        return {
            status: 200,
            body: {
                success: true,
                message: "Đã từ chối đề xuất sửa",
                data: await getProposalDetail(id)
            }
        };
    }

    if (decision !== "approve") {
        return { status: 400, body: { success: false, message: "Thao tác xử lý không hợp lệ" } };
    }

    const proposed = current.proposed_data && typeof current.proposed_data === "object"
        ? current.proposed_data
        : {};
    const updateResult = await updateTempReportUseCase({
        reportId: current.report_id,
        body: { ...proposed, reason: `Duyệt đề xuất sửa #${id}` },
        user
    });

    if (updateResult.status >= 400 || updateResult.body?.success === false) {
        return {
            status: updateResult.status || 400,
            body: updateResult.body || { success: false, message: "Không thể cập nhật báo cáo theo đề xuất" }
        };
    }

    if (statusAfter === "approved") {
        await ProductionTemp.approveSelected(
            [{ id: current.report_id }],
            Number(user.id),
            user.role === "admin"
        );
    }

    const newStatus = statusAfter === "approved" ? "approved" : "accepted";
    await setEditProposalStatus(id, newStatus);
    return {
        status: 200,
        body: {
            success: true,
            message: statusAfter === "approved"
                ? "Đã sửa và duyệt báo cáo"
                : "Đã áp dụng đề xuất, báo cáo đang chờ duyệt",
            data: await getProposalDetail(id)
        }
    };
};

module.exports = {
    listEditProposals,
    createEditProposal,
    getProposalDetail,
    updateEditProposal,
    deleteEditProposal,
    createLegacyEditProposal,
    canAccessProposalReport,
    setEditProposalStatus,
    reviewEditProposal
};


