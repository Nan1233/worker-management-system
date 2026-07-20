const db = require("../config/db");




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

return res.status(500).json(err);



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

return res.status(500).json(err);



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

return res.status(500).json(err);



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
            message: error.message || "Không thể lấy chi tiết báo cáo"
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

return res.status(500).json(err);



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

return res.status(500).json(err);



res.json({

message:"Xóa thành công"

});


});


};