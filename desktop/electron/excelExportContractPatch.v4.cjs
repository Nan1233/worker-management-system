'use strict';
const ExcelJS = require('exceljs');
require('./excelExportContractPatch.v3.cjs');
const monthly = require('./monthlyWorkbookLocal.cjs');
const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').replace(/[^A-Za-z0-9]+/g,'').toUpperCase();
const num = v => { const n=Number(String(v ?? '').replace(/,/g,'').trim()); return Number.isFinite(n)?n:0; };
const reports = p => { const a=Array.isArray(p?.processes?.GC?.reports)?[...p.processes.GC.reports]:[]; a.sort((x,y)=>String(x?.work_date||'').localeCompare(String(y?.work_date||''))||String(x?.approved_at||x?.created_at||'').localeCompare(String(y?.approved_at||y?.created_at||''))); return a; };
const details = (r,k) => Array.isArray(k==='d'?r?.deductions:r?.defects)?(k==='d'?r.deductions:r.defects):[];
const id = (x,k) => { const n=Number(k==='d'?x?.deduction_type_id:x?.defect_type_id); return Number.isInteger(n)&&n>0?n:null; };
const code = (x,k) => norm(k==='d'?(x?.deduction_code??x?.code):(x?.defect_code??x?.code));
const name = (x,k) => norm(k==='d'?(x?.deduction_name??x?.name):(x?.defect_name??x?.name));
const value = (x,k) => num(k==='d'?x?.hours:x?.quantity);
const rows = s => { const a=[]; for(const r of s._rows||[]){const st=r?.getCell(1)?.value,w=r?.getCell(2)?.value;if(typeof st==='number'&&w!=null&&String(w)!=='')a.push(r)} return a.sort((a,b)=>a.number-b.number); };
function headerMap(s, first, count){ const m=[]; for(let i=0;i<count;i++)m.push(norm(s.getCell(3,first+i).value)); return m; }
function match(h,x,k){ if(!h)return false; const c=code(x,k), n=name(x,k); if(h===c||h===n)return true; return (c.length>3&&h.includes(c))||(n.length>3&&h.includes(n))||(c.length>3&&c.includes(h))||(n.length>3&&n.includes(h)); }
function patch(s,p){ const rs=reports(p), rr=rows(s), dc=headerMap(s,11,16), fc=headerMap(s,36,19); const n=Math.min(rs.length,rr.length); let ds=0,fs=0,nonzeroD=0,nonzeroF=0; for(let i=0;i<n;i++){const x=rs[i],r=rr[i]; for(let j=0;j<16;j++){let v=0; for(const z of details(x,'d'))if(match(dc[j],z,'d'))v+=value(z,'d'); r.getCell(11+j).value=v; ds+=v; if(v)nonzeroD++;} for(let j=0;j<19;j++){let v=0; for(const z of details(x,'f'))if(match(fc[j],z,'f'))v+=value(z,'f'); r.getCell(36+j).value=v; fs+=v; if(v)nonzeroF++;} r.getCell(9).value=num(x?.deduction_time); r.getCell(34).value=num(x?.tt_ng); } console.log('[KTC-EXCEL-TEMPLATE] DB_DETAIL_PATCHED_V4',JSON.stringify({reports:rs.length,rows:rr.length,patched:n,nonzeroDeductionCells:nonzeroD,nonzeroDefectCells:nonzeroF,detailDeductionSum:ds,detailNgSum:fs})); }
async function patch(buf,p){ const wb=new ExcelJS.Workbook(); await wb.xlsx.load(buf); const s=wb.getWorksheet('Cắt lồng')||wb.worksheets[0]; if(!s)return buf; patch(s,p); return Buffer.from(await wb.xlsx.writeBuffer()); }
const bp=monthly.buildProcessWorkbookLocal, bs=monthly.buildSplitMonthlyWorkbooksLocal;
if(typeof bp==='function') monthly.buildProcessWorkbookLocal=async a=>{const r=await bp(a); if(String(a?.processCode||'').toUpperCase()==='GC'&&r?.buffer)r.buffer=await patch(r.buffer,a?.payload||{}); return r;};
if(typeof bs==='function') monthly.buildSplitMonthlyWorkbooksLocal=async a=>{const r=await bs(a); for(const x of r?.processes||[])if(String(x?.processCode||'').toUpperCase()==='GC'&&x?.buffer)x.buffer=await patch(x.buffer,a?.payload||{}); return r;};
module.exports=monthly;
