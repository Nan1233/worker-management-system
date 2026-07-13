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





// ==========================
// LẤY DỮ LIỆU THEO NGÀY
// ==========================


const [rows] = await db.promise().query(

`
SELECT 
    t.*,
    w.worker_code,
    u.full_name,
    p.process_name

FROM production_reports_temp t

JOIN workers w
ON t.worker_id = w.id

JOIN users u
ON w.user_id = u.id

JOIN processes p
ON t.process_id = p.id


WHERE DATE(t.work_date)=?

ORDER BY t.id ASC

`,

[
    date
]

);



const data = rows;





// ==========================
// TẠO EXCEL
// ==========================


const workbook =
new ExcelJS.Workbook();



const sheet =
workbook.addWorksheet(
    "Gia công"
);





// ==========================
// HEADER
// ==========================


sheet.getCell("A1").value =
"TỔNG THÁNG";



const headers=[

"STT",
"KG/H",
"Họ tên",
"",
"Mã Lô/Mã Máy",
"Thời gian",
"SP",
"",
"KH",
"TT",
"% thực tích",
"",
"SL/h",
"% phế phẩm",
"Tổng lỗi",
"Chân không",
"Rách vỡ",
"Bề mặt",
"Bavia"

];



headers.forEach(
(header,index)=>{


sheet.getCell(
    2,
    index+1
)
.value=header;


});







// ==========================
// DATA
// ==========================


data.forEach(
(item,index)=>{

sheet.getRow(index+3).values=[


index+1,

item.actual_time || "",

item.full_name || "",

item.process_name || "",


item.machine_no || "",


item.work_date || "",


item.product_name || "",


"",


item.standard_output || "",


item.actual_output || "",


item.tt_ok || "",


"",


item.actual_output || "",


item.tt_ng || "",


item.kqd_dap_lai || "",


item.kqd_tuot || "",


item.vo_do_long || "",


item.xuoc_do_long || "",


item.bavia_hut || ""


];

});









// ==========================
// SUMMARY U V
// ==========================



const summaryMap={};



data.forEach(item=>{


const sp =
item.product_name;



if(!summaryMap[sp]){

summaryMap[sp]=0;

}


summaryMap[sp]+=Number(
item.actual_output || 0
);



});



sheet.getCell("U1")
.value="SẢN PHẨM";


sheet.getCell("V1")
.value="Thực tích (kg)";



Object.keys(summaryMap)
.forEach(
(sp,index)=>{


sheet.getCell(
index+2,
21
)
.value=sp;



sheet.getCell(
index+2,
22
)
.value=summaryMap[sp];



});








// ==========================
// FORMAT
// ==========================


for(
let r=1;
r<=sheet.lastRow.number;
r++
){

for(
let c=1;
c<=22;
c++
){


const cell =
sheet.getCell(r,c);



cell.alignment={

horizontal:"center",

vertical:"middle"

};



cell.border={

top:{style:"thin"},
bottom:{style:"thin"},
left:{style:"thin"},
right:{style:"thin"}

};


}

}







// Header màu


for(
let c=1;
c<=19;
c++
){


const cell =
sheet.getCell(2,c);



cell.font={
bold:true
};



cell.fill={

type:"pattern",

pattern:"solid",

fgColor:{
argb:"FFD9EAF7"
}

};


}






sheet.getCell("U1").font={
bold:true
};


sheet.getCell("V1").font={
bold:true
};






// độ rộng


sheet.columns.forEach(col=>{


col.width=15;


});



sheet.getColumn(3).width=20;







// freeze


sheet.views=[

{

state:"frozen",

xSplit:3,

ySplit:2

}

];






// ==========================
// DOWNLOAD
// ==========================



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