'use strict';
const {listProcessesForMonth}=require('../services/excelProcessCatalogService');
exports.listProcesses=async(req,res)=>{
  const date=String(req.query?.date||'').trim();
  if(!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date))return res.status(400).json({success:false,message:'Ngày đồng bộ Excel không hợp lệ'});
  try{
    const rows=await listProcessesForMonth(date,{actor:req.user});
    return res.json({success:true,data:rows.map(row=>({id:Number(row.id),processCode:row.process_code||'',processName:row.process_name||('Công đoạn '+row.id),reportCount:Number(row.report_count)||0}))});
  }catch(error){
    console.error('LIST DESKTOP EXCEL PROCESSES ERROR:',error);
    return res.status(500).json({success:false,message:'Không thể lấy danh sách công đoạn Excel'});
  }
};
