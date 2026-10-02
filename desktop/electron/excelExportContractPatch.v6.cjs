'use strict';
const ExcelJS = require('exceljs');
const base = require('./excelExportContractPatch.v4.cjs');
const C={STT:1,DATE:31,MAX:54};
const copyStyle=(a,b)=>{b.font=a.font?{...a.font,color:a.font.color?{...a.font.color}:undefined}:b.font;b.fill=a.fill?JSON.parse(JSON.stringify(a.fill)):b.fill;b.border=a.border?JSON.parse(JSON.stringify(a.border)):b.border;b.alignment=a.alignment?{...a.alignment}:b.alignment;b.protection=a.protection?{...a.protection}:b.protection;if(a.numFmt)b.numFmt=a.numFmt};
const copyRow=(s,a,b)=>{const x=s.getRow(a),y=s.getRow(b);y.height=x.height;y.hidden=false;for(let c=1;c<=C.MAX;c++)copyStyle(x.getCell(c),y.getCell(c))};
const clear=(s,r)=>{for(let c=1;c<=C.MAX;c++)s.getCell(r,c).value=null};
const date=v=>{if(v instanceof Date&&!Number.isNaN(v.getTime()))return v;const s=String(v??'').trim().slice(0,10);let m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(m)return new Date(+m[1],+m[2]-1,+m[3]);m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);return m?new Date(+m[3],+m[2]-1,+m[1]):null};
async function fix(buf){const wb=new ExcelJS.Workbook();await wb.xlsx.load(buf);const s=wb.getWorksheet('Cắt lồng')||wb.worksheets[0];if(!s)return buf;for(let r=5;r<=s.rowCount;r++){const v=s.getCell(r,C.STT).value,d=date(v);if(d){copyRow(s,5,r);clear(s,r);s.getCell(r,1).value=d;s.getCell(r,1).numFmt='d/m/yyyy';s.getCell(r,1).alignment={...s.getCell(r,1).alignment,horizontal:'left',vertical:'center'}}else if(typeof v==='number'&&v>=1){copyRow(s,6,r);s.getCell(r,C.DATE).numFmt='d-mmm'}}return Buffer.from(await wb.xlsx.writeBuffer())}
const p=base.buildProcessWorkbookLocal,q=base.buildSplitMonthlyWorkbooksLocal;
if(typeof p==='function')base.buildProcessWorkbookLocal=async a=>{const r=await p(a);if(String(a?.processCode||'').toUpperCase()==='GC'&&r?.buffer)r.buffer=await fix(r.buffer);return r};
if(typeof q==='function')base.buildSplitMonthlyWorkbooksLocal=async a=>{const r=await q(a);for(const x of r?.processes||[])if(String(x?.processCode||'').toUpperCase()==='GC'&&x?.buffer)x.buffer=await fix(x.buffer);return r};
module.exports=base;
