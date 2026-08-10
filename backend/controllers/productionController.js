const db = require("../config/db");
const { mergeDefects, normalizeDeductions } = require("../utils/reportDetailNormalizer");
const { calculateReportPerformance } = require("../services/machinePerformanceService");
const { envEnabled } = require("../utils/featureFlags");

const safeDbError = (res, error, fallback) => {
    console.error(fallback, error);
    return res.status(500).json({ success: false, message: process.env.NODE_ENV === "production" ? fallback : (error?.message || fallback) });
};




// =====================================================
// LẤY TẤT CẢ BÁO CÁO
// GET /api/production
// =====================================================

exports.getAllReports = (req,res)=>{


const sql=`

SELECT

pr.*,

p.process_name,

w.worker_code,

u.full_name


FROM production_reports pr


JOIN workers w
ON pr.worker_id=w.id


JOIN users u
ON w.user_id=u.id


JOIN processes p
ON pr.process_id=p.id

WHERE pr.status='approved'
ORDER BY pr.created_at DESC


`;



db.query(sql,(err,result)=>{


if(err)

return safeDbError(res, err, "Không thể tải dữ liệu báo cáo");



res.json(result);



});


};








// =====================================================
// LẤY NGÀY
// =====================================================

exports.getReportDates=(req,res)=>{


const sql=`

SELECT DISTINCT work_date

FROM production_reports

ORDER BY work_date DESC

`;



db.query(sql,(err,result)=>{


if(err)

return safeDbError(res, err, "Không thể tải dữ liệu báo cáo");



res.json(result);



});


};







// =====================================================
// LẤY THEO NGÀY
// =====================================================

exports.getReportsByDate=(req,res)=>{


const sql=`

SELECT

pr.*,

p.process_name,

w.worker_code,

u.full_name


FROM production_reports pr


JOIN workers w
ON pr.worker_id=w.id


JOIN users u
ON w.user_id=u.id


JOIN processes p
ON pr.process_id=p.id


WHERE 

pr.work_date = ?

AND pr.status='approved'


ORDER BY pr.created_at DESC


`;



db.query(

sql,

[req.query.date],


(err,result)=>{


if(err)

return safeDbError(res, err, "Không thể tải dữ liệu báo cáo");



res.json(result);


});


};








// =====================================================
// CHI TIẾT
// =====================================================

exports.getReportById = async (req, res) => {
    try {
        const reportId = Number(req.params.id);

        if (!Number.isInteger(reportId) || reportId <= 0) {
            return res.status(400).json({ success: false, message: "ID báo cáo không hợp lệ" });
        }

        const [reportResult, defectResult, deductionResult, machineLineResult] = await Promise.all([
            db.promise().query(
                `SELECT pr.*, p.process_name, w.worker_code, u.full_name
                 FROM production_reports pr
                 JOIN workers w ON pr.worker_id = w.id
                 JOIN users u ON w.user_id = u.id
                 LEFT JOIN processes p ON pr.process_id = p.id
                 WHERE pr.id = ? LIMIT 1`,
                [reportId]
            ),
            db.promise().query(
                `SELECT d.id, d.defect_type_id, dt.defect_code, dt.defect_name, d.quantity
                 FROM production_report_defects d
                 LEFT JOIN defect_types dt ON dt.id = d.defect_type_id
                 WHERE d.report_id = ?
                 ORDER BY COALESCE(dt.sort_order, 999999), d.id`,
                [reportId]
            ),
            db.promise().query(
                `SELECT d.id, d.deduction_type_id, dt.deduction_code, dt.deduction_name, d.hours
                 FROM production_report_deductions d
                 LEFT JOIN deduction_types dt ON dt.id = d.deduction_type_id
                 WHERE d.report_id = ?
                 ORDER BY COALESCE(dt.sort_order, 999999), d.id`,
                [reportId]
            ),
            db.promise().query(
                `SELECT ml.id, ml.machine_id, ml.machine_code, ml.product_standard_id, ml.product_code,
                        ml.machine_time_hours, ml.standard_output, ml.standard_source,
                        ml.exclude_kqd_from_tt, ml.ok_quantity, ml.ng_quantity,
                        ml.maximum_output, ml.counted_output, ml.earned_standard_hours,
                        ml.defects_json, ml.sort_order
                 FROM production_report_machine_lines ml
                 WHERE ml.report_id=? ORDER BY ml.sort_order, ml.id`,
                [reportId]
            )
        ]);

        const report = reportResult[0][0];
        if (!report) {
            return res.status(404).json({ success: false, message: "Không tìm thấy báo cáo" });
        }

        // Công nhân chỉ được xem báo cáo đã duyệt của chính mình.
        if (req.user?.role === "worker" && Number(report.worker_id) !== Number(req.user?.worker_id)) {
            return res.status(403).json({ success: false, message: "Bạn không có quyền xem báo cáo này" });
        }

        const performance = calculateReportPerformance({ report, machineLines: machineLineResult[0] });
        return res.status(200).json({
            success: true,
            data: {
                ...report,
                defects: mergeDefects(report, defectResult[0]),
                deductions: normalizeDeductions(deductionResult[0]),
                ...performance
            }
        });
    } catch (error) {
        console.error("GET APPROVED REPORT DETAIL ERROR:", error);
        return res.status(500).json({
            success: false,
            message: process.env.NODE_ENV === "production" ? "Không thể lấy chi tiết báo cáo" : (error.message || "Không thể lấy chi tiết báo cáo")
        });
    }
};



// =====================================================
// ENTERPRISE UPDATE / DELETE: VERSION + AUDIT + PERIOD LOCK
// =====================================================

const AuditService = require('../services/auditService');
const { publicMessage } = require('../utils/httpError');
const ReportGovernanceService = require('../services/reportGovernanceService');
const { updateApprovedReport, loadApprovedSnapshot, restoreApprovedReportVersion } = require('../services/approvedReportEditService');

exports.updateReport = async (req, res) => {
    const reportId = Number(req.params.id);
    try {
        const result = await updateApprovedReport({
            reportId,
            patch: req.body || {},
            reason: req.body?.reason,
            userId: req.user.id,
            req,
            source: 'web'
        });
        if (envEnabled('ENABLE_SERVER_HEAVY_EXCEL') && envEnabled('ENABLE_EXCEL_EXPORT_WORKER')) {
            await require('../services/excelExportJobQueue').enqueueMonthlyDates([result.before.work_date, result.report.work_date], req.user?.id);
        }
        return res.json({ success: true, message: 'Cập nhật thành công', version: result.version, data: result.report });
    } catch (e) {
        console.error('UPDATE APPROVED REPORT ERROR:', e);
        return res.status(e.status || 500).json({ success: false, code: e.code, message: publicMessage(e, 'Không thể cập nhật báo cáo'), errors: e.details });
    }
};

exports.deleteReport = async (req,res) => {
    const reportId=Number(req.params.id);
    const deleteReason = String(req.body?.reason || '').trim().slice(0, 500);
    if(!Number.isInteger(reportId)||reportId<=0) return res.status(422).json({success:false,message:'ID báo cáo không hợp lệ'});
    if(!deleteReason) return res.status(422).json({success:false,code:'DELETE_REASON_REQUIRED',message:'Vui lòng nhập lý do xóa báo cáo đã duyệt'});
    const connection=await db.promise().getConnection();
    try{
      await connection.beginTransaction();
      const [lockedRows] = await connection.query(`SELECT * FROM production_reports WHERE id=? FOR UPDATE`, [reportId]);
      if(!lockedRows[0]){await connection.rollback();return res.status(404).json({success:false,message:'Không tìm thấy báo cáo'});}
      const snapshot=await loadApprovedSnapshot(reportId,connection);
      const periodLocked = await ReportGovernanceService.isPeriodLocked(snapshot.work_date, snapshot.process_id, connection);
      if (periodLocked) {
        await connection.rollback();
        return res.status(423).json({
          success:false,
          code:'REPORTING_PERIOD_LOCKED',
          message:'Kỳ báo cáo đã khóa, không thể xóa dữ liệu'
        });
      }
      await AuditService.createReportVersion({reportType:'approved',reportId,snapshot,reason:`Trước khi xóa: ${deleteReason}`,userId:req.user.id},connection);

      // Soft delete: giữ dữ liệu và chi tiết để có thể xem lịch sử/khôi phục.
      await connection.query(
        `UPDATE production_reports
         SET status='deleted', review_note=?, updated_by=?, updated_at=NOW()
         WHERE id=?`,
        [`Đã xóa: ${deleteReason}`, req.user.id, reportId]
      );

      const deletedSnapshot=await loadApprovedSnapshot(reportId,connection);
      const versionNo=await AuditService.createReportVersion({reportType:'approved',reportId,snapshot:deletedSnapshot,reason:`Đã xóa: ${deleteReason}`,userId:req.user.id},connection);
      await AuditService.logActivity({
        userId:req.user.id,
        action:'REPORT_DELETED',
        entityType:'approved_report',
        entityId:reportId,
        description:'Xóa mềm báo cáo đã duyệt',
        metadata:{reason:deleteReason,version:versionNo,work_date:snapshot.work_date,process_id:snapshot.process_id},
        req
      },connection);
      await connection.commit();
      if (envEnabled('ENABLE_SERVER_HEAVY_EXCEL') && envEnabled('ENABLE_EXCEL_EXPORT_WORKER')) {
        await require('../services/excelExportJobQueue').enqueueMonthlyDates(snapshot.work_date, req.user?.id);
      }
      return res.json({success:true,message:'Đã xóa báo cáo. Dữ liệu vẫn được giữ trong lịch sử để có thể khôi phục.',version:versionNo});
    }catch(e){await connection.rollback().catch(()=>{});console.error('DELETE REPORT ERROR:',e);return res.status(e.status||500).json({success:false,code:e.code,message:publicMessage(e,'Không thể xóa báo cáo')});}
    finally{connection.release();}
};

exports.restoreReportVersion = async (req,res) => {
    const reportId = Number(req.params.id);
    const versionNo = Number(req.params.versionNo);
    try {
      const result = await restoreApprovedReportVersion({
        reportId,
        versionNo,
        reason: req.body?.reason,
        userId: req.user.id,
        req
      });
      if (envEnabled('ENABLE_SERVER_HEAVY_EXCEL') && envEnabled('ENABLE_EXCEL_EXPORT_WORKER')) {
        await require('../services/excelExportJobQueue').enqueueMonthlyDates(
          [result.before?.work_date, result.report?.work_date].filter(Boolean),
          req.user?.id
        );
      }
      return res.json({
        success:true,
        message:`Đã khôi phục báo cáo về nội dung phiên bản ${versionNo}`,
        version:result.version,
        restored_from_version:versionNo,
        data:result.report
      });
    } catch (e) {
      console.error('RESTORE REPORT VERSION ERROR:', e);
      return res.status(e.status || 500).json({
        success:false,
        code:e.code,
        message:publicMessage(e,'Không thể khôi phục phiên bản báo cáo'),
        errors:e.details
      });
    }
};

