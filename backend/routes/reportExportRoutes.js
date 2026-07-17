const express = require("express");

const router = express.Router();


const authMiddleware = require(
    "../middleware/authMiddleware"
);

const checkRole = require(
    "../middleware/roleMiddleware"
);

const reportExportController = require(
    "../controllers/reportExportController"
);


// =====================================================
// XUẤT EXCEL CÁC BÁO CÁO ĐÃ DUYỆT ĐƯỢC CHỌN
//
// POST /api/reports/export-excel
//
// Body:
// {
//     "ids": [1, 2, 3]
// }
// =====================================================

router.post(
    "/export-excel",
    authMiddleware,
    checkRole(
        "admin",
        "manager",
        "lead"
    ),
    reportExportController.exportGiaCongExcel
);


module.exports = router;