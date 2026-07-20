const db = require("../config/db");

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

DATE(pr.work_date)=?

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

        const [reportResult, defectResult, deductionResult] = await Promise.all([
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
                 JOIN defect_types dt ON dt.id = d.defect_type_id
                 WHERE d.report_id = ?
                 ORDER BY dt.sort_order, dt.id`,
                [reportId]
            ),
            db.promise().query(
                `SELECT d.id, d.deduction_type_id, dt.deduction_code, dt.deduction_name, d.hours
                 FROM production_report_deductions d
                 JOIN deduction_types dt ON dt.id = d.deduction_type_id
                 WHERE d.report_id = ?
                 ORDER BY dt.sort_order, dt.id`,
                [reportId]
            )
        ]);

        const report = reportResult[0][0];
        if (!report) {
            return res.status(404).json({ success: false, message: "Không tìm thấy báo cáo" });
        }

        return res.status(200).json({
            success: true,
            data: {
                ...report,
                defects: defectResult[0].map(item => ({ ...item, quantity: Number(item.quantity) || 0 })),
                deductions: deductionResult[0].map(item => ({ ...item, hours: Number(item.hours) || 0 }))
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
// UPDATE
// =====================================================

exports.updateReport=(req,res)=>{


const {

machine_no,

product_name,

note

}=req.body;



const sql=`

UPDATE production_reports

SET

machine_no=?,

product_name=?,

note=?


WHERE id=?


`;



db.query(

sql,

[

machine_no,

product_name,

note,

req.params.id

],


(err)=>{


if(err)

return safeDbError(res, err, "Không thể tải dữ liệu báo cáo");



res.json({

message:"Update thành công"

});


});


};








// =====================================================
// DELETE
// =====================================================

exports.deleteReport=(req,res)=>{


db.query(

`

DELETE FROM production_reports

WHERE id=?

`,

[req.params.id],


(err)=>{


if(err)

return safeDbError(res, err, "Không thể tải dữ liệu báo cáo");



res.json({

message:"Xóa thành công"

});


});


};
// =====================================================
// ENTERPRISE UPDATE: VERSION + AUDIT + NOTIFICATION
// =====================================================
const AuditService = require('../services/auditService');
const { validateProductionReport } = require('../utils/reportValidation');
const { validateMasterData } = require('../services/reportBusinessValidationService');
const { publicMessage } = require('../utils/httpError');

async function loadApprovedSnapshot(reportId, executor = db) {
    const q = (sql, params) => executor.promise ? executor.promise().query(sql, params) : executor.query(sql, params);
    const [[reports], [defects], [deductions]] = await Promise.all([
        q(`SELECT * FROM production_reports WHERE id=? LIMIT 1`, [reportId]),
        q(`SELECT * FROM production_report_defects WHERE report_id=? ORDER BY id`, [reportId]),
        q(`SELECT * FROM production_report_deductions WHERE report_id=? ORDER BY id`, [reportId])
    ]);
    if (!reports[0]) return null;
    return { ...reports[0], defects, deductions };
}

exports.updateReport = async (req,res) => {
    const reportId=Number(req.params.id);
    if(!Number.isInteger(reportId)||reportId<=0) return res.status(422).json({success:false,message:'ID báo cáo không hợp lệ'});
    const connection=await db.promise().getConnection();
    try {
        await connection.beginTransaction();
        const [lockedRows] = await connection.query(`SELECT * FROM production_reports WHERE id=? FOR UPDATE`, [reportId]);
        if(!lockedRows[0]) { await connection.rollback(); return res.status(404).json({success:false,message:'Không tìm thấy báo cáo'}); }
        const before=await loadApprovedSnapshot(reportId, connection);
        const payload={...before,...(req.body||{}),defects:req.body?.defects??before.defects,deductions:req.body?.deductions??before.deductions};
        const validation=validateProductionReport(payload,{enforceBackDate:false});
        if(!validation.valid){await connection.rollback();return res.status(422).json({success:false,message:'Dữ liệu báo cáo không hợp lệ',errors:validation.errors});}
        const master=await validateMasterData({workerId:before.worker_id,processId:before.process_id,machineNo:validation.normalized.machine_no,productName:validation.normalized.product_name,defects:validation.normalized.defects,deductions:validation.normalized.deductions});
        if(!master.valid){await connection.rollback();return res.status(422).json({success:false,message:'Dữ liệu danh mục không hợp lệ',errors:master.errors});}
        const allowed=['machine_no','product_name','note','shift','work_date','total_time','actual_time','deduction_time','standard_output','actual_output','tt_ok','tt_ng'];
        await AuditService.createReportVersion({reportType:'approved',reportId,snapshot:before,reason:req.body.reason||'Trước khi chỉnh sửa',userId:req.user.id},connection);
        const values=allowed.map(k=>validation.normalized[k]);
        await connection.query(`UPDATE production_reports SET ${allowed.map(k=>`${k}=?`).join(',')}, updated_by=?, updated_at=NOW() WHERE id=?`,[...values,req.user.id,reportId]);
        await connection.query(`DELETE FROM production_report_defects WHERE report_id=?`,[reportId]);
        for(const item of validation.normalized.defects) await connection.query(`INSERT INTO production_report_defects(report_id,defect_type_id,quantity) VALUES(?,?,?)`,[reportId,item.defect_type_id,item.quantity]);
        await connection.query(`DELETE FROM production_report_deductions WHERE report_id=?`,[reportId]);
        for(const item of validation.normalized.deductions) await connection.query(`INSERT INTO production_report_deductions(report_id,deduction_type_id,hours) VALUES(?,?,?)`,[reportId,item.deduction_type_id,item.hours]);
        const after=await loadApprovedSnapshot(reportId, connection);
        const versionNo=await AuditService.createReportVersion({reportType:'approved',reportId,snapshot:after,reason:req.body.reason||'Sau khi chỉnh sửa',userId:req.user.id},connection);
        await AuditService.logActivity({userId:req.user.id,action:'REPORT_UPDATED',entityType:'approved_report',entityId:reportId,description:`Cập nhật báo cáo phiên bản ${versionNo}`,metadata:{reason:req.body.reason||null},req},connection);
        const [workerRows]=await connection.query(`SELECT w.user_id FROM production_reports pr JOIN workers w ON w.id=pr.worker_id WHERE pr.id=?`,[reportId]);
        if(workerRows[0]?.user_id) await AuditService.notifyUsers([workerRows[0].user_id],{type:'warning',title:'Báo cáo đã được chỉnh sửa',message:`Báo cáo #${reportId} đã được quản lý cập nhật`,linkUrl:`/worker/history/${reportId}?source=approved`,entityType:'approved_report',entityId:reportId},connection);
        await connection.commit();
        return res.json({success:true,message:'Cập nhật thành công',version:versionNo,data:after});
    } catch(e){ await connection.rollback(); console.error('UPDATE APPROVED REPORT ERROR:',e); return res.status(e.status||500).json({success:false,message:publicMessage(e,'Không thể cập nhật báo cáo')}); }
    finally{ connection.release(); }
};

exports.deleteReport = async (req,res) => {
    const reportId=Number(req.params.id);
    const connection=await db.promise().getConnection();
    try{
      await connection.beginTransaction();
      const snapshot=await loadApprovedSnapshot(reportId,connection);
      if(!snapshot){await connection.rollback();return res.status(404).json({success:false,message:'Không tìm thấy báo cáo'});}
      await AuditService.createReportVersion({reportType:'approved',reportId,snapshot,reason:req.body?.reason||'Trước khi xóa',userId:req.user.id},connection);
      await AuditService.logActivity({userId:req.user.id,action:'REPORT_DELETED',entityType:'approved_report',entityId:reportId,description:'Xóa báo cáo đã duyệt',metadata:{reason:req.body?.reason||null},req},connection);
      await connection.query(`DELETE FROM production_report_defects WHERE report_id=?`,[reportId]);
      await connection.query(`DELETE FROM production_report_deductions WHERE report_id=?`,[reportId]);
      await connection.query(`DELETE FROM production_reports WHERE id=?`,[reportId]);
      await connection.commit(); return res.json({success:true,message:'Xóa thành công'});
    }catch(e){await connection.rollback();console.error('DELETE REPORT ERROR:',e);return res.status(500).json({success:false,message:publicMessage(e,'Không thể xóa báo cáo')});}
    finally{connection.release();}
};
