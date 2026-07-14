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


WHERE pr.work_date=?


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

exports.getReportById=(req,res)=>{


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


WHERE pr.id=?


`;



db.query(

sql,

[req.params.id],


(err,result)=>{


if(err)

return res.status(500).json(err);



res.json(result[0]);



});


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