'use strict';

// v2 owns the single desktop Excel interception/fetch contract for all processes.
// This file adds the GC template-specific column contract on top of that same path.
require('./excelExportContractPatch.v2.cjs');

const fs=require('fs'),os=require('os'),path=require('path'),ExcelJS=require('exceljs');
const monthly=require('./monthlyWorkbookLocal.cjs');
const num=v=>{const n=Number(String(v??'').replace(/,/g,'').trim());return Number.isFinite(n)?n:0};
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').replace(/[^A-Za-z0-9]/g,'').toUpperCase();

// GC export contract is defined by the application, NOT by the visible text
// inside the Excel template. Template headers may be renamed without changing
// where DB values belong.
const GC={
  STT:1,WORKER_CODE:2,WORKER_NAME:3,MACHINE:4,SHIFT:5,TRAINING:6,
  TOTAL_TIME:7,ACTUAL_TIME:8,CHANGE_MACHINE:9,DEDUCTION_TOTAL:10,SHORTAGE:11,
  DEDUCTION_FIRST:12,DEDUCTION_COUNT:15,
  PRODUCT:27,STANDARD:28,ACTUAL:29,ACHIEVEMENT:30,DATE:31,STANDARD_H:32,
  OK:33,NG_TOTAL:34,NG_RATE:35,DEFECT_FIRST:36,DEFECT_COUNT:16,
  FINAL_OK:52,FINAL_NG:53
};
const DEDUCTION_FIELDS=[
  'Thiếu sản lượng','Bật máy, xét máy','Chuyển mã','Chỉnh máy','Chờ chỉnh máy','Mất điện','Mất khí','Chờ hàng','Bảo dưỡng máy','Nghỉ giải lao','Giao ca','Dừng máy đi hỗ trợ','Giặt cs/cân cs, tuốt-tái pp, GL','5S','Học việc, đào tạo'
];
const DEFECT_FIELDS=['KQD','Vỡ cao su','K xước cong gãy','Cao su xoay','Cắt không đứt','Bavia','CSH','PPCM','KT lớn','KT nhỏ','LCS','Cắt lẹm','Rách NVL','Chân ngắn dài','Sót via','Fure trục'];
const detailId=(x,k)=>{const n=Number(k==='d'?(x?.deduction_type_id??x?.type_id??x?.id):(x?.defect_type_id??x?.type_id??x?.id));return Number.isInteger(n)&&n>0?n:null};
const detailCode=(x,k)=>String(k==='d'?(x?.deduction_type_code??x?.deduction_code??x?.type_code??x?.code):(x?.defect_type_code??x?.defect_code??x?.type_code??x?.code)??'').trim();
const detailName=(x,k)=>String(k==='d'?(x?.deduction_type_name??x?.deduction_name??x?.type_name??x?.display_name??x?.name):(x?.defect_type_name??x?.defect_name??x?.type_name??x?.display_name??x?.name)??'').trim();
const detailValue=(x,k)=>num(k==='d'?(x?.deduction_hours??x?.duration_hours??x?.time_hours??x?.hours??x?.value):(x?.defect_quantity??x?.ng_quantity??x?.quantity??x?.qty??x?.value));
const aliases=(x,k)=>[detailId(x,k)!=null?`id:${detailId(x,k)}`:'',detailCode(x,k)?`code:${norm(detailCode(x,k))}`:'',detailName(x,k)?`name:${norm(detailName(x,k))}`:''].filter(Boolean);
function matchName(item,label,k){const h=norm(label);return aliases(item,k).some(a=>{const v=a.slice(a.indexOf(':')+1);return a.startsWith('id:')?false:v===h||(v.length>=4&&h.includes(v))||(h.length>=4&&v.includes(h))})}
function detailForLabel(items,label,k){let sum=0;for(const x of Array.isArray(items)?items:[])if(matchName(x,label,k))sum+=detailValue(x,k);return k==='f'?Math.round(sum):sum}
function reports(p){return [...(p?.processes?.GC?.reports||[])].sort((a,b)=>String(a?.work_date||'').localeCompare(String(b?.work_date||''))||String(a?.created_at||a?.approved_at||'').localeCompare(String(b?.created_at||b?.approved_at||''))||Number(a?.id||0)-Number(b?.id||0))}
function isDataRow(r){const a=r?.getCell(GC.STT)?.value;return typeof a==='number'&&Number.isFinite(a)&&r?.getCell(GC.WORKER_CODE)?.value!=null}
function isTotalRow(r){return norm(r?.getCell(1)?.value)==='TONGCONG'}
function copyStyle(sheet,src,dst){const a=sheet.getRow(src),b=sheet.getRow(dst);b.height=a.height;for(let c=1;c<=Math.max(53,sheet.columnCount);c++){const s=a.getCell(c),d=b.getCell(c);if(s.style)d.style=JSON.parse(JSON.stringify(s.style));if(s.font)d.font=JSON.parse(JSON.stringify(s.font));if(s.fill)d.fill=JSON.parse(JSON.stringify(s.fill));if(s.border)d.border=JSON.parse(JSON.stringify(s.border));if(s.alignment)d.alignment=JSON.parse(JSON.stringify(s.alignment));if(s.protection)d.protection=JSON.parse(JSON.stringify(s.protection));if(s.numFmt)d.numFmt=s.numFmt}}
function resizeReportRows(sheet,rowsNeeded,existing){const total=existing.find(isTotalRow);const totalRow=total?.number??(sheet.rowCount+1);let rows=[...existing].sort((a,b)=>a.number-b.number);if(rows.length<rowsNeeded){const source=rows.at(-1)?.number??6;for(let i=rows.length;i<rowsNeeded;i++){sheet.insertRow(totalRow,[]);copyStyle(sheet,source,totalRow);rows.push(sheet.getRow(totalRow));}}else if(rows.length>rowsNeeded){for(let i=rows.length-1;i>=rowsNeeded;i--){sheet.spliceRows(rows[i].number,1)}}return [...(sheet._rows||[])].filter(isDataRow).sort((a,b)=>a.number-b.number)}
async function patch(buf,p){const input=Buffer.isBuffer(buf)?buf:Buffer.from(buf);const tmp=path.join(os.tmpdir(),`ktc-gc-${process.pid}-${Date.now()}.xlsx`);fs.writeFileSync(tmp,input);try{const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(tmp);const s=wb.getWorksheet('Cắt lồng')||wb.getWorksheet('CẮT LỒNG')||wb.worksheets[0];if(!s)return input;const rs=reports(p);let rr=[...(s._rows||[])].filter(isDataRow).sort((a,b)=>a.number-b.number);rr=resizeReportRows(s,rs.length,rr);let dSum=0,nSum=0,tdSum=0,tnSum=0,patched=0,nonzeroD=0,nonzeroF=0;
for(let i=0;i<rs.length;i++){const x=rs[i],r=rr[i],ded=Array.isArray(x?.deductions)?x.deductions:[],def=Array.isArray(x?.defects)?x.defects:[];r.getCell(GC.STT).value=i+1;r.getCell(GC.WORKER_CODE).value=x?.worker_code??'';r.getCell(GC.WORKER_NAME).value=x?.full_name??x?.worker_name??'';r.getCell(GC.MACHINE).value=x?.machine_no??'';r.getCell(GC.SHIFT).value=x?.shift??'';r.getCell(GC.TRAINING).value=num(x?.training_percent??x?.training_percent_snapshot)/100;r.getCell(GC.TOTAL_TIME).value=num(x?.total_time);r.getCell(GC.ACTUAL_TIME).value=num(x?.actual_time);r.getCell(GC.CHANGE_MACHINE).value=detailForLabel(ded,'Chuyển mã','d');r.getCell(GC.DEDUCTION_TOTAL).value=num(x?.deduction_time);r.getCell(GC.SHORTAGE).value=Math.max(0,num(x?.standard_output)*num(x?.actual_time)-(num(x?.actual_output??x?.tt_ok)+num(x?.tt_ng)));
for(let j=0;j<GC.DEDUCTION_COUNT;j++){const v=detailForLabel(ded,DEDUCTION_FIELDS[j],'d');r.getCell(GC.DEDUCTION_FIRST+j).value=v;if(v)nonzeroD++;dSum+=v}
r.getCell(GC.PRODUCT).value=x?.product_name??'';r.getCell(GC.STANDARD).value=num(x?.standard_output)*num(x?.actual_time);r.getCell(GC.ACTUAL).value=num(x?.actual_output??(num(x?.tt_ok)+num(x?.tt_ng)));r.getCell(GC.ACHIEVEMENT).value=num(x?.training_percent??x?.training_percent_snapshot)/100>0&&num(x?.standard_output)*num(x?.actual_time)>0?(num(x?.actual_output??(num(x?.tt_ok)+num(x?.tt_ng)))/(num(x?.standard_output)*num(x?.actual_time)))*(num(x?.training_percent??x?.training_percent_snapshot)/100):0;r.getCell(GC.DATE).value=x?.work_date?new Date(`${String(x.work_date).slice(0,10)}T00:00:00`):null;r.getCell(GC.STANDARD_H).value=num(x?.standard_output);r.getCell(GC.OK).value=num(x?.tt_ok);r.getCell(GC.NG_TOTAL).value=num(x?.tt_ng);r.getCell(GC.NG_RATE).value=r.getCell(GC.ACTUAL).value>0?num(x?.tt_ng)/r.getCell(GC.ACTUAL).value:0;
for(let j=0;j<GC.DEFECT_COUNT;j++){const v=detailForLabel(def,DEFECT_FIELDS[j],'f');r.getCell(GC.DEFECT_FIRST+j).value=v;if(v)nonzeroF++;nSum+=v}
r.getCell(GC.FINAL_OK).value=num(x?.tt_ok);r.getCell(GC.FINAL_NG).value=num(x?.tt_ng);tdSum+=num(x?.deduction_time);tnSum+=num(x?.tt_ng);patched++}
const total=[...(s._rows||[])].find(isTotalRow);if(total){total.getCell(GC.DEDUCTION_TOTAL).value=tdSum;total.getCell(GC.NG_TOTAL).value=tnSum;total.getCell(GC.OK).value=rs.reduce((z,x)=>z+num(x?.tt_ok),0);total.getCell(GC.FINAL_OK).value=total.getCell(GC.OK).value;total.getCell(GC.FINAL_NG).value=tnSum;for(let j=0;j<GC.DEDUCTION_COUNT;j++)total.getCell(GC.DEDUCTION_FIRST+j).value=rr.reduce((z,r)=>z+num(r.getCell(GC.DEDUCTION_FIRST+j).value),0);for(let j=0;j<GC.DEFECT_COUNT;j++)total.getCell(GC.DEFECT_FIRST+j).value=rr.reduce((z,r)=>z+num(r.getCell(GC.DEFECT_FIRST+j).value),0)}
console.log('[KTC-EXCEL-TEMPLATE] GC_DB_FIXED_MAPPING',JSON.stringify({reports:rs.length,rows:rr.length,patched,nonzeroDeductionCells:nonzeroD,nonzeroDefectCells:nonzeroF,detailDeductionSum:dSum,detailNgSum:nSum,totalDeductionSum:tdSum,totalNgSum:tnSum,totalRow:!!total,contract:'GC_FIXED_53_COLS'}));return Buffer.from(await wb.xlsx.writeBuffer())}finally{try{fs.unlinkSync(tmp)}catch{}}}
const op=monthly.buildProcessWorkbookLocal,osplit=monthly.buildSplitMonthlyWorkbooksLocal;if(typeof op==='function')monthly.buildProcessWorkbookLocal=async a=>{const r=await op(a);if(String(a?.processCode||'').toUpperCase()==='GC'&&r?.buffer)r.buffer=await patch(r.buffer,a?.payload||{});return r};if(typeof osplit==='function')monthly.buildSplitMonthlyWorkbooksLocal=async a=>{const r=await osplit(a);for(const x of r?.processes||[])if(String(x?.processCode||'').toUpperCase()==='GC'&&x?.buffer)x.buffer=await patch(x.buffer,a?.payload||{});return r};module.exports=monthly;
