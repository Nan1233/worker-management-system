const ExcelJS = require("exceljs");


exports.exportGiaCongExcel = async(req,res)=>{


try{


const data = req.body.data;

const summary = req.body.summary;



const workbook = new ExcelJS.Workbook();


const sheet =
workbook.addWorksheet(
"Gia công"
);





// ============================
// 1. DÒNG TIÊU ĐỀ
// ============================


sheet.getCell("A1").value =
"TỔNG THÁNG";





// ============================
// 2. HEADER BẢNG CHÍNH
// ============================


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


sheet
.getCell(
2,
index+1
)
.value=header;


});







// ============================
// 3. ĐỔ DATA CHÍNH
// ============================



data.forEach(
(item,index)=>{


const row =
index+3;



sheet.getRow(row).values=[


item.stt,

item.kg_h,

item.ho_ten,

"",


item.ma_lo,


item.thoi_gian,


item.sp,


"",


item.kh,


item.tt,


item.thuc_tich,


"",


item.sl_h,


item.phe_pham,


item.tong_loi,


item.chan_khong,


item.rach_vo,


item.be_mat,


item.bavia


];



});









// ============================
// 4. BẢNG SUMMARY U-V
// ============================



sheet.getCell(
"U1"
)
.value="SẢN PHẨM";


sheet.getCell(
"V1"
)
.value="Thực tích (kg)";




summary.forEach(
(item,index)=>{


const row =
index+2;



sheet.getCell(
row,
21
)
.value=
item.san_pham;



sheet.getCell(
row,
22
)
.value=
item.thuc_tich_kg;



});








// ============================
// 5. FORMAT
// ============================



// Header bảng chính


for(
let col=1;
col<=19;
col++
){


const cell =
sheet.getCell(
2,
col
);


cell.font={
bold:true
};


cell.alignment={

horizontal:"center",

vertical:"middle"

};


cell.fill={

type:"pattern",

pattern:"solid",

fgColor:{
argb:"FFD9EAF7"
}

};


}





// Header phụ


["U1","V1"]
.forEach(
(x)=>{


const cell =
sheet.getCell(x);


cell.font={
bold:true
};


cell.fill={

type:"pattern",

pattern:"solid",

fgColor:{
argb:"FFE2F0D9"
}

};


cell.alignment={

horizontal:"center"

};



});









// ============================
// 6. BORDER
// ============================



const maxMainRow =
data.length+2;



for(
let r=2;
r<=maxMainRow;
r++
){


for(
let c=1;
c<=19;
c++
){


sheet.getCell(r,c)
.border={

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


sheet.getCell(r,c)
.alignment={

horizontal:"center",

vertical:"middle"

};



}

}





const maxSummaryRow =
summary.length+1;



for(
let r=1;
r<=maxSummaryRow;
r++
){


for(
let c=21;
c<=22;
c++
){


sheet.getCell(r,c)
.border={

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


sheet.getCell(r,c)
.alignment={

horizontal:"center"

};


}

}







// ============================
// 7. WIDTH
// ============================


sheet.columns.forEach(
column=>{

column.width=15;

});



// tên dài

sheet.getColumn(3)
.width=20;



sheet.getColumn(5)
.width=18;






// ============================
// 8. FREEZE
// ============================



sheet.views=[

{

state:"frozen",

xSplit:3,

ySplit:2

}

];








// ============================
// EXPORT
// ============================



res.setHeader(

"Content-Type",

"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

);



res.setHeader(

"Content-Disposition",

"attachment; filename=GiaCong.xlsx"

);



await workbook.xlsx.write(res);


res.end();



}

catch(err){


console.log(err);


res.status(500)
.json({

message:err.message

});


}


};