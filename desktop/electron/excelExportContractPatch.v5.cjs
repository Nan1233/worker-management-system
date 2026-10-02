'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),ExcelJS=require('exceljs');
const monthly=require('./monthlyWorkbookLocal.cjs');
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
const num=v=>{const n=Number(String(v??'').replace(/,/g,'').trim());return Number.isFinite(n)?n:0};
const identity=(x,k)=>{
  const vals=k==='d'
    ? [x?.deduction_type_id,x?.deduction_type_code,x?.deduction_code,x?.deduction_type_name,x?.deduction_name,x?.type_code,x?.type_name,x?.code,x?.name]
    : [x?.defect_type_id,x?.defect_type_code,x?.defect_code,x?.defect_type_name,x?.defect_name,x?.type_code,x?.type_name,x?.code,x?.name];
  return vals.filter(v=>v!==null&&v!==undefined&&String(v)!=='').map(norm).filter(Boolean);
};
const detailValue=(x,k)=>num(k==='d'?(x?.hours??x?.deduction_hours??x?.duration_hours??x?.time_hours??x?.value):(x?.quantity??x?.defect_quantity??x?.ng_quantity??x?.qty??x?.value));
const detailMatches=(header,item,k)=>{const h=norm(header);if(!h)return false;return identity(item,k).some(v=>v===h||((v.length>=4&&h.includes(v))||(h.length>=4&&v.includes(h))))};
const reports=p=>[...(p?.processes?.GC?.reports||[])].sort((a,b)=>String(a?.work_date||'').localeCompare(String(b?.work_date||''))||String(a?.created_at||a?.approved_at||'').localeCompare(String(b?.created_at||b?.approved_at||''))||Number(a?.id||0)-Number(b?.id||0));
const isReportRow=r=>{const v=r?.getCell(1)?.value;return typeof v==='number'&&Number.isFinite(v)&&r?.getCell(2)?.value!==null&&r?.getCell(2)?.value!==undefined};
function findColumns(sheet){
  const out={deduction:[],defect:[],deductionTime:null,ng:null};
  for(let c=1;c<=sheet.columnCount;c++){
    const h=sheet.getCell(5,c).value;
    const n=norm(h);
    if(n==='TONGTHOIGIANT RU' || n==='TONGTHOIGIANTRU') out.deductionTime=c;
    if(n==='TONGNG') out.ng=c;
    const group=norm(sheet.getCell(4,c).value);
    if(group.includes('CHITIETTHOIGIANTRU')) out.deduction.push({c,h});
    if(group.includes('CHITIETNG')) out.defect.push({c,h});
  }
  return out;
}
function setDetailColumns(row,columns,items,kind){
  for(const {c,h} of columns){let total=0;for(const item of items)if(detailMatches(h,item,kind))total+=detailValue(item,kind);row.getCell(c).value=kind==='f'?Math.round(total):total;}
}
async function patch(buf,p){
  const input=Buffer.isBuffer(buf)?buf:Buffer.from(buf);
  const tmp=path.join(os.tmpdir(),`ktc-gc-${process.pid}-${Date.now()}.xlsx`);
  fs.writeFileSync(tmp,input);
  try{
    const wb=new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmp);
    const s=wb.getWorksheet('Cắt lồng')||wb.getWorksheet('CẮT LỒNG')||wb.worksheets[0];
    if(!s)return input;
    const rs=reports(p), rr=[...(s._rows||[])].filter(isReportRow).sort((a,b)=>a.number-b.number);
    const cols=findColumns(s);
    let patched=0,detailDeductionSum=0,detailNgSum=0,totalDeductionSum=0,totalNgSum=0;
    const n=Math.min(rs.length,rr.length);
    for(let i=0;i<n;i++){
      const x=rs[i],r=rr[i];
      const deductions=Array.isArray(x?.deductions)?x.deductions:[];
      const defects=Array.isArray(x?.defects)?x.defects:[];
      setDetailColumns(r,cols.deduction,deductions,'d');
      setDetailColumns(r,cols.defect,defects,'f');
      const d=num(x?.deduction_time), ng=num(x?.tt_ng);
      if(cols.deductionTime)r.getCell(cols.deductionTime).value=d;
      if(cols.ng)r.getCell(cols.ng).value=ng;
      detailDeductionSum+=deductions.reduce((z,v)=>z+detailValue(v,'d'),0);
      detailNgSum+=defects.reduce((z,v)=>z+detailValue(v,'f'),0);
      totalDeductionSum+=d;totalNgSum+=ng;patched++;
    }
    const totalRow=[...(s._rows||[])].find(r=>norm(r?.getCell(1)?.value)==='TONGCONG');
    if(totalRow){
      if(cols.deductionTime)totalRow.getCell(cols.deductionTime).value=totalDeductionSum;
      if(cols.ng)totalRow.getCell(cols.ng).value=totalNgSum;
      for(const {c,h} of cols.deduction){let sum=0;for(const r of rr.slice(0,n))sum+=num(r.getCell(c).value);totalRow.getCell(c).value=sum;}
      for(const {c,h} of cols.defect){let sum=0;for(const r of rr.slice(0,n))sum+=num(r.getCell(c).value);totalRow.getCell(c).value=sum;}
    }
    console.log('[KTC-EXCEL-TEMPLATE] DB_DETAIL_PATCHED_V6',JSON.stringify({reports:rs.length,rows:rr.length,patched,columns:{deduction:cols.deduction.length,defect:cols.defect.length,deductionTime:cols.deductionTime,ng:cols.ng},detailDeductionSum,detailNgSum,totalDeductionSum,totalNgSum,totalRow:!!totalRow}));
    if(rs.length!==rr.length)console.warn('[KTC-EXCEL-TEMPLATE] GC_REPORT_ROW_MISMATCH',JSON.stringify({reports:rs.length,rows:rr.length,missing:Math.max(0,rs.length-rr.length),extra:Math.max(0,rr.length-rs.length)}));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }finally{try{fs.unlinkSync(tmp)}catch{}}
}
const op=monthly.buildProcessWorkbookLocal,osplit=monthly.buildSplitMonthlyWorkbooksLocal;
if(typeof op==='function')monthly.buildProcessWorkbookLocal=async a=>{const r=await op(a);if(String(a?.processCode||'').toUpperCase()==='GC'&&r?.buffer)r.buffer=await patch(r.buffer,a?.payload||{});return r};
if(typeof osplit==='function')monthly.buildSplitMonthlyWorkbooksLocal=async a=>{const r=await osplit(a);for(const x of r?.processes||[])if(String(x?.processCode||'').toUpperCase()==='GC'&&x?.buffer)x.buffer=await patch(x.buffer,a?.payload||{});return r};
module.exports=monthly;
