'use strict';
const ExcelJS=require('exceljs');
const base=require('./excelExportContractPatch.v4.cjs');
const N=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const T=a=>(Array.isArray(a)?a:[]).filter(x=>N(x.id)>0).sort((a,b)=>N(a.sort_order??999999)-N(b.sort_order??999999)||N(a.id)-N(b.id));
const I=(x,k)=>{const n=N(k==='d'?x.deduction_type_id:x.defect_type_id);return n>0?n:null};
const V=(x,k)=>N(k==='d'?x.hours:x.quantity);
const R=p=>{const a=Array.isArray(p?.processes?.GC?.reports)?[...p.processes.GC.reports]:[];a.sort((x,y)=>String(x.work_date||'').localeCompare(String(y.work_date||''))||String(x.approved_at||x.created_at||'').localeCompare(String(y.approved_at||y.created_at||'')));return a};
const D=(r,k)=>Array.isArray(k==='d'?r.deductions:r.defects)?(k==='d'?r.deductions:r.defects):[];
async function patch(buf,p){const w=new ExcelJS.Workbook();await w.xlsx.load(buf);const s=w.getWorksheet('Cắt lồng')||w.worksheets[0];if(!s)return buf;const g=p?.processes?.GC||{},ds=T(g.deductionTypes),fs=T(g.defectTypes),rs=R(p),rows=[];for(const r of s._rows||[]){const a=r?.getCell(1)?.value,b=r?.getCell(2)?.value;if(typeof a==='number'&&b!=null&&String(b)!=='')rows.push(r)}rows.sort((a,b)=>a.number-b.number);const n=Math.min(rows.length,rs.length);for(let i=0;i<n;i++){const r=rows[i],x=rs[i],dm=new Map,fm=new Map;for(const z of D(x,'d')){const k=I(z,'d');if(k)dm.set(k,(dm.get(k)||0)+V(z,'d'))}for(const z of D(x,'f')){const k=I(z,'f');if(k)fm.set(k,(fm.get(k)||0)+V(z,'f'))}for(let j=0;j<16;j++)r.getCell(11+j).value=ds[j]?dm.get(N(ds[j].id))||0:0;for(let j=0;j<19;j++)r.getCell(36+j).value=fs[j]?fm.get(N(fs[j].id))||0:0;r.getCell(9).value=N(x.deduction_time);r.getCell(34).value=N(x.tt_ng)}console.log('[KTC-EXCEL-TEMPLATE] DB_DETAIL_PATCHED_V7',JSON.stringify({reports:rs.length,rows:rows.length,patched:n,deductionTypes:ds.length,defectTypes:fs.length}));return Buffer.from(await w.xlsx.writeBuffer())}
const p0=base.buildProcessWorkbookLocal,q0=base.buildSplitMonthlyWorkbooksLocal;
if(typeof p0==='function')base.buildProcessWorkbookLocal=async a=>{const r=await p0(a);if(String(a?.processCode||'').toUpperCase()==='GC'&&r?.buffer)r.buffer=await patch(r.buffer,a?.payload||{});return r};
if(typeof q0==='function')base.buildSplitMonthlyWorkbooksLocal=async a=>{const r=await q0(a);for(const x of r?.processes||[])if(String(x?.processCode||'').toUpperCase()==='GC'&&x?.buffer)x.buffer=await patch(x.buffer,a?.payload||{});return r};
module.exports=base;
