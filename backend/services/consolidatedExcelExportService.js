const { calculateCountedNg } = require('../utils/outputCalculation');
const { trainingFactor } = require('../utils/trainingPercent');
const ExcelJS = require('exceljs');
const fs = require('node:fs/promises');
const path = require('node:path');

const TEMPLATE_RELATIVE_PATH = '../templates/bao-cao-cat-long-export.xlsx';
const SHEET_NAME = 'Cắt lồng';
const HEADER_ROW = 326;
const DATA_START_ROW = 327;
const TEMPLATE_TABLE_LAST_COLUMN = 53; // BA

const { removeQuietly, cleanupOldExports } = require('./exportFileMaintenance');

const EXCEL_THEME = Object.freeze({
  navy: '1F4E78', navyDark: '17365D', white: 'FFFFFF', text: '1F2937', border: 'D7DEE7',
  totalTime: 'DDEBF7', deductionTime: 'FFF2CC', actualTime: 'E2F0D9', actualOutput: 'E4DFEC',
  outputPerHour: 'DDEBF7', ok: 'E2F0D9', ng: 'FCE4D6', rateGood: 'C6E0B4', rateWarning: 'FFE699', rateBad: 'F4B084'
});
const solidFill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thinBorder = { top: { style: 'thin', color: { argb: EXCEL_THEME.border } }, left: { style: 'thin', color: { argb: EXCEL_THEME.border } }, bottom: { style: 'thin', color: { argb: EXCEL_THEME.border } }, right: { style: 'thin', color: { argb: EXCEL_THEME.border } } };
const mediumLeftBorder = { ...thinBorder, left: { style: 'medium', color: { argb: EXCEL_THEME.navyDark } } };
const removeTemplateConditionalFormatting = (sheet) => {
  if (Array.isArray(sheet.conditionalFormattings)) sheet.conditionalFormattings.splice(0, sheet.conditionalFormattings.length);
  if (sheet.model && Array.isArray(sheet.model.conditionalFormattings)) sheet.model.conditionalFormattings = [];
};
const isGroupStart = (column) => ['training_percent', 'product_name', 'tt_ng'].includes(column.key);
const styleHeaderCell = (cell, column) => {
  cell.fill = solidFill(EXCEL_THEME.navy);
  cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: EXCEL_THEME.white } };
  cell.border = isGroupStart(column) ? mediumLeftBorder : thinBorder;
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
};
const getFixedColumnFill = (column) => {
  switch (column.key) {
    case 'total_time': return EXCEL_THEME.totalTime; case 'deduction_time': return EXCEL_THEME.deductionTime;
    case 'actual_time': return EXCEL_THEME.actualTime; case 'actual_output': return EXCEL_THEME.actualOutput;
    case 'output_per_hour': return EXCEL_THEME.outputPerHour; case 'tt_ok': return EXCEL_THEME.ok; case 'tt_ng': return EXCEL_THEME.ng;
    default: return EXCEL_THEME.white;
  }
};
const styleDataCell = (cell, column) => {
  cell.fill = solidFill(getFixedColumnFill(column));
  cell.font = { name: 'Arial', size: 10, color: { argb: EXCEL_THEME.text } };
  cell.border = isGroupStart(column) ? mediumLeftBorder : thinBorder;
  cell.alignment = { horizontal: ['full_name', 'product_name'].includes(column.key) ? 'left' : 'center', vertical: 'middle', wrapText: true };
};
const toNumber = (value) => { const parsed = Number(String(value ?? 0).replace(/,/g, '').trim()); return Number.isFinite(parsed) ? parsed : 0; };
const applyValueHighlight = (cell, column, value) => {
  const numericValue = toNumber(value);
  if (column.key === 'achievement_rate') { cell.fill = solidFill(numericValue >= 1 ? EXCEL_THEME.rateGood : numericValue >= 0.9 ? EXCEL_THEME.rateWarning : EXCEL_THEME.rateBad); cell.font = { ...(cell.font || {}), bold: true }; }
  if (column.key === 'ng_rate') { cell.fill = solidFill(numericValue <= 0.01 ? EXCEL_THEME.rateGood : numericValue <= 0.03 ? EXCEL_THEME.rateWarning : EXCEL_THEME.rateBad); cell.font = { ...(cell.font || {}), bold: true }; }
  if (['total_time','deduction_time','actual_time','actual_output','achievement_rate','output_per_hour','tt_ok','tt_ng','ng_rate'].includes(column.key)) cell.font = { ...(cell.font || {}), bold: true };
};
const normalizeDateKey = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value); if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
};
const toExcelDate = (value) => { const key = normalizeDateKey(value); if (!key) return null; const [year,month,day]=key.split('-').map(Number); return new Date(year,month-1,day); };
const reportTimeKey = (report) => String(report.approved_at || report.created_at || report.entry_date || report.work_date || '');
const sortReports = (a,b) => normalizeDateKey(a.work_date).localeCompare(normalizeDateKey(b.work_date)) || reportTimeKey(a).localeCompare(reportTimeKey(b)) || String(a.worker_code||'').localeCompare(String(b.worker_code||''),undefined,{numeric:true,sensitivity:'base'}) || String(a.machine_no||'').localeCompare(String(b.machine_no||''),undefined,{numeric:true,sensitivity:'base'}) || Number(a.id)-Number(b.id);
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const normalizeType = (item,kind) => { const id=Number(item.id ?? item.type_id ?? item[`${kind}_type_id`]); const code=String(item.code ?? item.type_code ?? item[`${kind}_code`] ?? '').trim(); const rawName=item.name ?? item.type_name ?? item[`${kind}_name`]; const fallbackName=kind==='deduction'?`Loại trừ giờ #${id||'?'}`:`Lỗi NG #${id||'?'}`; return {id,code,name:String(rawName||code||fallbackName).trim(),sort_order:Number(item.sort_order)||0,process_id:Number(item.process_id)||0}; };
const uniqueTypes = (items,kind) => { const map=new Map(); (items||[]).forEach(raw=>{const item=normalizeType(raw,kind); if(item.id&&!map.has(item.id)) map.set(item.id,item);}); return [...map.values()].sort((a,b)=>a.process_id-b.process_id||a.sort_order-b.sort_order||a.id-b.id); };
const collectTypesFromReports = (reports,kind) => uniqueTypes((reports||[]).flatMap(report=>report[kind==='deduction'?'deductions':'defects']||[]),kind);
const mergeTypes = (configuredTypes,reports,kind) => uniqueTypes([...(configuredTypes||[]),...collectTypesFromReports(reports,kind)],kind);
const sumDetailValues = (items,valueKey,allowedTypeIds=null,typeKey=null) => (items||[]).filter(item=>!allowedTypeIds||allowedTypeIds.has(Number(item[typeKey]))).reduce((sum,item)=>sum+toNumber(item[valueKey]),0);
const detailValue = (items,typeId,valueKey,typeKey) => (items||[]).filter(item=>Number(item[typeKey])===Number(typeId)).reduce((sum,item)=>sum+toNumber(item[valueKey]),0);
const safeFolderName = (value,fallback) => String(value||fallback).replace(/[<>:"/\\|?*\u0000-\u001F]/g,'-').replace(/\s+/g,' ').trim()||fallback;
const getMonthlyTarget = (yearMonth,options={}) => { const [year,month]=yearMonth.split('-'); const root=options.exportRoot||process.env.EXCEL_EXPORT_ROOT||path.join(process.cwd(),'exports'); const stageName=safeFolderName(options.stageFolder||process.env.EXCEL_STAGE_FOLDER_NAME||'Cắt lồng','Cắt lồng'); const folder=path.join(root,year,stageName); const fileName=`Bao-cao-san-xuat-${month}-${year}.xlsx`; const filePath=path.join(folder,fileName); return {folder,fileName,filePath,metadataPath:`${filePath}.meta.json`}; };
const readMonthlyCacheMetadata = async (yearMonth,options={}) => { const target=getMonthlyTarget(yearMonth,options); try { const [fileStat,metadataText]=await Promise.all([fs.stat(target.filePath),fs.readFile(target.metadataPath,'utf8')]); return {target,fileStat,metadata:JSON.parse(metadataText)}; } catch(error) { if(error?.code==='ENOENT'||error instanceof SyntaxError)return null; throw error; } };
const writeMonthlyCacheMetadata = async (target,metadata) => { const temporaryPath=`${target.metadataPath}.${process.pid}.${Date.now()}.tmp`; await fs.writeFile(temporaryPath,JSON.stringify(metadata),'utf8'); await fs.rename(temporaryPath,target.metadataPath); };
const captureCellStyle = (sheet,rowNumber,columnNumber) => { const cell=sheet.getRow(rowNumber).getCell(columnNumber); const column=sheet.getColumn(columnNumber); return {style:clone(cell.style),font:clone(cell.font),fill:clone(cell.fill),border:clone(cell.border),alignment:clone(cell.alignment),protection:clone(cell.protection),numFmt:cell.numFmt,width:column.width,hidden:column.hidden,outlineLevel:column.outlineLevel}; };
const applyCellStyle = (sheet,rowNumber,columnNumber,source) => { const cell=sheet.getRow(rowNumber).getCell(columnNumber); if(source.style)cell.style=clone(source.style); if(source.font)cell.font=clone(source.font); if(source.fill)cell.fill=clone(source.fill); if(source.border)cell.border=clone(source.border); if(source.alignment)cell.alignment=clone(source.alignment); if(source.protection)cell.protection=clone(source.protection); if(source.numFmt)cell.numFmt=source.numFmt; const column=sheet.getColumn(columnNumber); if(source.width!=null)column.width=source.width; column.hidden=false; if(source.outlineLevel!=null)column.outlineLevel=source.outlineLevel; };
const TEMPLATE_SOURCE = Object.freeze({stt:1,workerCode:2,workerName:3,machine:4,shift:5,trainingPercent:6,totalTime:7,actualTime:8,totalDeduction:10,deductionDetail:11,product:27,standard:28,totalOutput:29,outputPerHour:30,workDate:31,achievementRate:32,ok:33,ng:34,ngRate:35,ngDetail:36,status:52,note:53});

function getTemplatePath() {
  if (typeof __dirname === 'string') return path.resolve(__dirname, TEMPLATE_RELATIVE_PATH);
  return null;
}
async function resolveTemplatePath() {
  const file = getTemplatePath();
  if (!file) throw Object.assign(new Error('Excel template filesystem access is unavailable in Cloudflare Worker'), { code: 'KTC_EXCEL_TEMPLATE_UNSUPPORTED_ON_CLOUDFLARE', statusCode: 501 });
  await fs.access(file);
  return file;
}

module.exports = { TEMPLATE_PATH:TEMPLATE_RELATIVE_PATH,SHEET_NAME,HEADER_ROW,DATA_START_ROW,TEMPLATE_TABLE_LAST_COLUMN,removeTemplateConditionalFormatting,styleHeaderCell,styleDataCell,applyValueHighlight,toNumber,normalizeDateKey,toExcelDate,reportTimeKey,sortReports,clone,normalizeType,uniqueTypes,collectTypesFromReports,mergeTypes,sumDetailValues,detailValue,safeFolderName,getMonthlyTarget,readMonthlyCacheMetadata,writeMonthlyCacheMetadata,captureCellStyle,applyCellStyle,TEMPLATE_SOURCE,resolveTemplatePath,ExcelJS,trainingFactor,calculateCountedNg,removeQuietly,cleanupOldExports };
