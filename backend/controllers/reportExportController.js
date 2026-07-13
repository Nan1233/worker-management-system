const ExcelJS = require("exceljs");

const db = require("../config/db");



exports.exportGiaCongExcel = async(req,res)=>{


try{


const date = req.query.date;



if(!date){


    return res.status(400).json({

        message:"Thiếu ngày xuất báo cáo"

    });


}




// =============================
// LẤY DỮ LIỆU ĐÃ DUYỆT
// =============================

const [rows] = await db.promise().query(

`
SELECT

t.*,

w.worker_code,

u.full_name,

p.process_name


FROM production_reports_temp t


LEFT JOIN workers w

ON t.worker_id = w.id



LEFT JOIN users u

ON w.user_id = u.id



LEFT JOIN processes p

ON t.process_id = p.id



WHERE DATE(t.work_date)=?


ORDER BY t.id ASC

`,

[
    date
]

);


console.log(
"EXPORT DATA:",
rows.length
);





const workbook =

new ExcelJS.Workbook();




const sheet =

workbook.addWorksheet(

"Gia công"

);




// =============================
// TITLE
// =============================


sheet.getCell("A1").value =

"BÁO CÁO GIA CÔNG";





// =============================
// HEADER
// =============================


const headers=[


"STT",

"KG/H",

"Họ tên",

"Công đoạn",

"Mã máy",

"Ngày",

"Sản phẩm",

"",

"KH",

"TT",

"OK",

"",

"SL/h",

"NG",

"Dập lại",

"Tuột",

"Vỡ dò lòng",

"Xước dò lòng",

"Bavia"


];




headers.forEach(

(header,index)=>{


sheet.getCell(

2,

index+1

).value = header;


}

);







// =============================
// DATA
// =============================


rows.forEach(

(item,index)=>{


sheet.getRow(index+3).values=[


index+1,


item.actual_time || 0,


item.full_name || "",


item.process_name || "",


item.machine_no || "",


item.work_date || "",


item.product_name || "",


"",


item.standard_output || 0,


item.actual_output || 0,


item.tt_ok || 0,


"",


item.actual_output || 0,


item.tt_ng || 0,


item.kqd_dap_lai || 0,


item.kqd_tuot || 0,


item.vo_do_long || 0,


item.xuoc_do_long || 0,


item.bavia_hut || 0


];


}

);








// =============================
// SUMMARY
// =============================


const summary={};



rows.forEach(item=>{


const name =
item.product_name || "Không tên";



if(!summary[name]){

summary[name]=0;

}



summary[name]+=

Number(
item.actual_output || 0
);



});




sheet.getCell("U1").value=

"Sản phẩm";


sheet.getCell("V1").value=

"Thực tích";




Object.keys(summary).forEach(

(item,index)=>{


sheet.getCell(

index+2,

21

).value=item;



sheet.getCell(

index+2,

22

).value=summary[item];


}

);






// =============================
// FORMAT
// =============================


sheet.eachRow(

row=>{


row.eachCell(

cell=>{


cell.alignment={

horizontal:"center",

vertical:"middle"

};


cell.border={


top:{
style:"thin"
},

bottom:{
style:"thin"
},

left:{
style:"thin"
},

right:{
style:"thin"
}


};


}


);


}

);





sheet.getRow(2).font={

bold:true

};




sheet.columns.forEach(col=>{


col.width=15;


});



sheet.getColumn(3).width=20;





sheet.views=[

{

state:"frozen",

xSplit:3,

ySplit:2

}

];





// =============================
// DOWNLOAD
// =============================


res.setHeader(

"Content-Type",

"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

);



res.setHeader(

"Content-Disposition",

`attachment; filename=BaoCao_${date}.xlsx`

);




await workbook.xlsx.write(res);



res.end();



}


catch(err){


console.error(

"EXPORT ERROR:",

err

);



res.status(500).json({

message:err.message

});


}


};