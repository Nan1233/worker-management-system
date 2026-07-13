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

sheet.mergeCells("A1:AE1");

sheet.getCell("A1").value = "BÁO CÁO GIA CÔNG";

sheet.getCell("A1").font = {
    bold:true,
    size:16
};

sheet.getCell("A1").alignment = {
    horizontal:"center",
    vertical:"middle"
};
// =============================
// HEADER ĐẦY ĐỦ
// =============================

const headers=[

"STT",
"Mã CN",
"Họ tên",
"Công đoạn",
"Ngày",
"Ca",
"Mã máy",

"Tổng thời gian",
"Thời gian thực tế",
"Thời gian trừ",

"Sản phẩm",

"Kế hoạch",
"Thực tế",

"OK",
"NG",

"Dập lại",
"Tuột",

"Vỡ dò lòng",
"Xước dò lòng",

"Cọng gãy",
"Xoay",

"Không đứt",
"Bavia hút",

"PPCM",
"Lỗi cao su",

"NG kích thước",
"Cắt lem",

"Ghi chú",

"Trạng thái",
"Thời gian tạo"

];

sheet.getRow(2).values = headers;
// =============================
// DATA
// =============================

rows.forEach(

(item,index)=>{


sheet.getRow(index+3).values=[


index+1,


item.worker_code || "",


item.full_name || "",


item.process_name || "",


item.work_date || "",


item.shift || "",


item.machine_no || "",



item.total_time || 0,


item.actual_time || 0,


item.deduction_time || 0,



item.product_name || "",



item.standard_output || 0,


item.actual_output || 0,



item.tt_ok || 0,


item.tt_ng || 0,



item.kqd_dap_lai || 0,


item.kqd_tuot || 0,



item.vo_do_long || 0,


item.xuoc_do_long || 0,



item.cong_gay || 0,


item.xoay || 0,



item.khong_dut || 0,


item.bavia_hut || 0,



item.ppcm || 0,


item.loi_cao_su || 0,



item.ng_kich_thuoc || 0,


item.cat_lem || 0,



item.note || "",


item.status || "",


item.created_at || ""

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



sheet.getCell("AG1").value="TỔNG HỢP SẢN PHẨM";
sheet.mergeCells("AG1:AH1");

sheet.getCell("AG2").value="Sản phẩm";
sheet.getCell("AH2").value="Thực tích";


Object.keys(summary).forEach((item,index)=>{

    sheet.getCell(index+3,33).value=item;
    sheet.getCell(index+3,34).value=summary[item];

});


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