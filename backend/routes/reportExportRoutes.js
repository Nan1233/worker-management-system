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
const validate = require("../middleware/validateRequest");


// =====================================================
// XUẤT EXCEL CÁC BÁO CÁO ĐÃ DUYỆT ĐƯỢC CHỌN
//
// POST /api/reports/export-excel
//
// Body:
// {
//     "date": "2026-07-20"
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
    validate({ date:{required:true,type:"date"} }),
    reportExportController.exportGiaCongExcel
);


module.exports = router;