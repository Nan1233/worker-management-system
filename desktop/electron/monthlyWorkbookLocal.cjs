const path = require('node:path');
const fs = require('node:fs');
const ExcelJS = require('exceljs');
const { isKqdDefect } = require('../../shared/kqdPolicy.cjs');

const GROUPS = Object.freeze({
  GIA_CONG: {
    code: 'GIA_CONG',
    title: 'Gia công',
    template: 'bao-cao-cat-long-export.xlsx',
    fileName: ({ month, year }) => `A+B GIA CÔNG THÁNG ${month}-${year}.xlsx`,
    sheets: [{ processCodes: ['GC'], sheetName: 'Cắt lồng', layout: 'GIA_CONG' }]
  },
  MAI_DO: {
    code: 'MAI_DO',
    title: 'Mài - Đo',
    template: 'bao-cao-mai-do-export.xlsx',
    fileName: ({ month, year }) => `A+B MÀI - ĐO THÁNG ${month}-${year}.xlsx`,
    sheets: [
      { processCodes: ['MAI'], sheetName: 'TT Mài', layout: 'MAI' },
      { processCodes: ['DO'], sheetName: 'TT Đo', layout: 'DO' }
    ]
  }
});

const LAYOUTS = Object.freeze({
  GIA_CONG: {
    headerSearchColumn: 31,
    headerPattern: /ngày\s*\/?\s*tháng/i,
    lastReportColumn: 54,
    fixed: { sequence: 1, workerCode: 2, workerName: 3, machine: 4, shift: 5, training: 6, totalTime: 7, actualTime: 8, changeCount: 9, deductionTotal: 10, product: 27, standardOutput: 28, actualOutput: 29, achievement: 30, workDate: 31, outputPerHour: 32, ok: 33, totalNg: 34, ngRate: 35 },
    deductions: [11, 26], defects: [36, 53],
    deductionCodeColumns: { THIEU_SP:11, BAT_MAY:12, CHUYEN_MA:13, CHINH_MAY:14, CHO_CHINH_MAY:15, MAT_DIEN:16, MAT_KHI:17, CHO_HANG:18, BAO_DUONG:19, NGHI_GIAI_LAO:20, GIAO_CA:21, HO_TRO:22, GIAT_CAN_TUOT:23, '5S':24, HOC_VIEC:25, DI_MUON_VE_SOM:26 },
    defectCodeColumns: { KQD:36, VO_CAO_SU:37, K_XUOC_CONG_GAY:38, CAO_SU_XOAY:39, CAT_KHONG_DUT:40, BAVIA:41, CSH:42, PPCM:43, KT_LON:44, KT_NHO:45, LCS:46, CAT_LEM:47, RACH_NVL:48, CHAN_NGAN_DAI:49, SOT_VIA:50, FURE_TRUC:51, LAN_CS:52, BAVIA_CAT_HUT:53, THIEU_CAO_SU:54 }
  },
  MAI: { blockStrategy:'date-anchor', headerSearchColumn:36, headerPattern:/ngày/i, blockStartOffset:2, blockEndOffset:1, lastReportColumn:46, fixed:{sequence:1,workerCode:2,workerName:3,shift:4,machine:5,training:8,actualTime:9,totalTime:10,deductionTotal:11,product:32,standardOutput:33,actualOutput:34,achievement:35,workDate:36,outputPerHour:37,ok:38,totalNg:39}, deductions:[12,31], defects:[40,46] },
  DO: { headerSearchColumn:32, headerPattern:/ngày/i, lastReportColumn:49, fixed:{sequence:1,workerCode:2,workerName:3,shift:4,machine:5,training:7,totalTime:8,actualTime:9,deductionTotal:10,product:28,standardOutput:29,actualOutput:30,achievement:31,workDate:32,outputPerHour:33,ok:34,totalNg:35,ngRate:36}, deductions:[11,27], defects:[37,49] }
});

const safeText = (value) => { if (value === null || value === undefined) return ''; if (typeof value === 'object') { if (Array.isArray(value.richText)) return value.richText.map((x)=>String(x?.text??'')).join(''); if (value.text !== undefined) return String(value.text??''); if (value.result !== undefined) return String(value.result??''); if (value.formula !== undefined) return String(value.result??''); } return String(value); };
const num = (value) => { const parsed=Number(safeText(value??0).replace(/,/g,'').trim()); return Number.isFinite(parsed)?parsed:0; };
const normalizeCode=(value)=>safeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'').toUpperCase();
const dateKey=(value)=>{if(!value)return '';if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}/.test(value))return value.slice(0,10);const date=new Date(value);if(Number.isNaN(date.getTime()))return '';return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;};
const toExcelDate=(value)=>{const key=dateKey(value);if(!key)return null;const [year,month,day]=key.split('-').map(Number);return new Date(year,month-1,day);};
const setCell=(row,column,value,format)=>{if(!column)return;const cell=row.getCell(column);cell.value=value;if(format)cell.numFmt=format;};
const uniqueBy=(items,keyFn)=>{const result=[],seen=new Set();for(const item of items||[]){const key=keyFn(item);if(!key||seen.has(key))continue;seen.add(key);result.push(item);}return result;};
function getMergedCellValue(cell){try{if(cell?.isMerged&&cell.master&&cell.master!==cell)return cell.master.value??'';return cell?.value??'';}catch{return '';}}
function getFormulaText(value){if(value&&typeof value==='object'&&typeof value.formula==='string')return value.formula.trim();if(typeof value==='string'&&value.trim().startsWith('='))return value.trim().slice(1);return '';}
function normalizedFormula(value){return getFormulaText(value).replace(/^=/,'').replace(/\s+/g,'').toUpperCase();}
function isCopiedHeaderRow(sheet,rowNumber){const nextRow=sheet.getRow(rowNumber+1);return normalizedFormula(getMergedCellValue(nextRow.getCell(2))).includes('$B$2')||normalizedFormula(getMergedCellValue(nextRow.getCell(1))).includes('$A$2');}
function isDateAnchorCell(value){if(value instanceof Date&&!Number.isNaN(value.getTime()))return true;return /^\+?\$?A\$?\d+\+1$/i.test(normalizedFormula(value));}
function findDateAnchorRows(sheet){const candidates=[];for(let rowNumber=1;rowNumber<sheet.rowCount;rowNumber++){const row=sheet.getRow(rowNumber),anchorValue=getMergedCellValue(row.getCell(1)),columnBValue=getMergedCellValue(row.getCell(2));if(!isDateAnchorCell(anchorValue)||safeText(columnBValue).trim()||getFormulaText(columnBValue)||!isCopiedHeaderRow(sheet,rowNumber))continue;candidates.push(rowNumber);}if(candidates.length<=1)return candidates;const gaps=candidates.slice(1).map((row,index)=>row-candidates[index]),gapCounts=new Map();for(const gap of gaps){if(gap<20||gap>300)continue;gapCounts.set(gap,(gapCounts.get(gap)||0)+1);}const dominantGap=[...gapCounts.entries()].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0]?.[0];if(!dominantGap)return candidates.slice(0,31);let best=[],current=[candidates[0]];for(let index=1;index<candidates.length;index++){const gap=candidates[index]-candidates[index-1];if(Math.abs(gap-dominantGap)<=2)current.push(candidates[index]);else{if(current.length>best.length)best=current;current=[candidates[index]];}}if(current.length>best.length)best=current;return(best.length?best:candidates).slice(0,31);}
function findTextHeaderRows(sheet,layout){const headers=[],candidateColumns=[layout.headerSearchColumn];for(let column=1;column<=Math.min(sheet.columnCount,layout.lastReportColumn||sheet.columnCount);column++)if(!candidateColumns.includes(column))candidateColumns.push(column);for(let rowNumber=1;rowNumber<=sheet.rowCount;rowNumber++){for(const column of candidateColumns){const text=safeText(getMergedCellValue(sheet.getRow(rowNumber).getCell(column))).trim();if(!text)continue;layout.headerPattern.lastIndex=0;if(layout.headerPattern.test(text)){headers.push(rowNumber);break;}}}return[...new Set(headers)];}
function findBlocks(sheet,layout){let headers=[],startOffset=Number(layout.blockStartOffset||1),endOffset=Number(layout.blockEndOffset||2);if(layout.blockStrategy==='date-anchor')headers=findDateAnchorRows(sheet);if(!headers.length){headers=findTextHeaderRows(sheet,layout);startOffset=1;endOffset=2;}if(!headers.length)throw new Error(`Không tìm thấy cấu trúc ngày hợp lệ trong sheet ${sheet.name}`);if(headers.length>31)headers=headers.slice(0,31);return headers.map((headerRow,index)=>({headerRow,startRow:headerRow+startOffset,endRow:(headers[index+1]||(sheet.rowCount+endOffset))-endOffset})).filter((block)=>block.endRow>=block.startRow);}
function materializeSharedFormulas(workbook){workbook.eachSheet((sheet)=>{sheet.eachRow({includeEmpty:false},(row)=>{row.eachCell({includeEmpty:false},(cell)=>{const value=cell.value;if(!value||typeof value!=='object'||!value.sharedFormula)return;try{const formula=cell.formula;cell.value=formula?{formula,result:value.result??cell.result??null}:(value.result??null);}catch{cell.value=value.result??null;}});});});}

const MONTH_NAMES_EN=Object.freeze([['January','Jan'],['February','Feb'],['March','Mar'],['April','Apr'],['May','May'],['June','Jun'],['July','Jul'],['August','Aug'],['September','Sep'],['October','Oct'],['November','Nov'],['December','Dec']]);
const escapeRegExp=(value)=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function replaceWorkbookPeriodText(value,year,month){if(typeof value!=='string'||!value)return value;const monthNumber=Number(month);const [longMonth,shortMonth]=MONTH_NAMES_EN[monthNumber-1];let next=value;next=next.replace(/\b(?:0?[1-9]|1[0-2])[\/-](?:19|20)\d{2}\b/g,`${month}-${year}`).replace(/\b(?:19|20)\d{2}[\/-](?:0?[1-9]|1[0-2])\b/g,`${year}-${month}`).replace(/\btháng\s+(?:0?[1-9]|1[0-2])\b/gi,`Tháng ${monthNumber}`).replace(/\bmonth\s+(?:0?[1-9]|1[0-2])\b/gi,`Month ${monthNumber}`);for(const [sourceLong,sourceShort] of MONTH_NAMES_EN){next=next.replace(new RegExp(`\\b${escapeRegExp(sourceLong)}\\b`,'gi'),longMonth).replace(new RegExp(`\\b${escapeRegExp(sourceShort)}\\b`,'gi'),shortMonth);}return next.replace(/\b(?:19|20)\d{2}\b/g,String(year));}
function updateWorkbookPeriod(workbook,year,month){workbook.eachSheet((sheet)=>{sheet.eachRow({includeEmpty:false},(row)=>{row.eachCell({includeEmpty:false},(cell)=>{if(typeof cell.value==='string')cell.value=replaceWorkbookPeriodText(cell.value,year,month);});});});}
function assertWorkbookPeriod(workbook,year,month){const expected=`${String(month).padStart(2,'0')}-${year}`;let found=false;workbook.eachSheet((sheet)=>{sheet.eachRow({includeEmpty:false},(row)=>{row.eachCell({includeEmpty:false},(cell)=>{const text=safeText(cell.value);if(text.includes(expected))found=true;});});});if(!found)throw new Error(`Không xác nhận được kỳ Excel ${expected}`);}
function setWorkbookCalculationProperties(workbook){if(workbook?.calcProperties){workbook.calcProperties.fullCalcOnLoad=true;workbook.calcProperties.forceFullCalc=true;workbook.calcProperties.calcMode='auto';}}

function getTemplatePath(templateRoot,template){return path.join(templateRoot,template);}
function ensureTemplateExists(templateRoot,template){const templatePath=getTemplatePath(templateRoot,template);if(!fs.existsSync(templatePath))throw new Error(`Không tìm thấy file mẫu Excel: ${templatePath}`);return templatePath;}

function normalizeReport(report={}){return {...report,workerCode:report.workerCode??report.worker_code??'',workerName:report.workerName??report.worker_name??'',machine:report.machine??report.machineCode??report.machine_code??'',shift:report.shift??'',trainingPercent:report.trainingPercent??report.training_percent??report.training_percent_snapshot??100,totalTime:report.totalTime??report.total_time??0,actualTime:report.actualTime??report.actual_time??0,changeCount:report.changeCount??report.change_count??0,deductionTotal:report.deductionTotal??report.deduction_total??0,product:report.product??report.productCode??report.product_code??'',standardOutput:report.standardOutput??report.standard_output??report.standard_output_per_hour??0,actualOutput:report.actualOutput??report.actual_output??report.actual_quantity??report.quantity??0,achievement:report.achievement??report.achievement_percent??0,workDate:report.workDate??report.work_date??report.date??null,outputPerHour:report.outputPerHour??report.output_per_hour??0,ok:report.ok??report.ok_quantity??report.total_ok??0,totalNg:report.totalNg??report.total_ng??report.ng_quantity??0,ngRate:report.ngRate??report.ng_rate??0,deductions:report.deductions??report.timeDeductions??{},defects:report.defects??report.ngDetails??{}};}
function collectReportRows(reports){return (reports||[]).map(normalizeReport);}
function getReportCellValue(report,key){if(key==='workDate')return toExcelDate(report.workDate);if(key==='training')return num(report.trainingPercent)/100;if(key==='totalTime'||key==='actualTime')return num(report[key]);return report[key]??'';}
function writeReportRow(row,report,layout,sequence){const f=layout.fixed;setCell(row,f.sequence,sequence);setCell(row,f.workerCode,report.workerCode);setCell(row,f.workerName,report.workerName);setCell(row,f.machine,report.machine);setCell(row,f.shift,report.shift);setCell(row,f.training,getReportCellValue(report,'training'),'0%');setCell(row,f.totalTime,num(report.totalTime),'0.00');setCell(row,f.actualTime,num(report.actualTime),'0.00');setCell(row,f.changeCount,num(report.changeCount),'0.00');setCell(row,f.deductionTotal,num(report.deductionTotal),'0.00');setCell(row,f.product,report.product);setCell(row,f.standardOutput,num(report.standardOutput),'0.00');setCell(row,f.actualOutput,num(report.actualOutput),'0.00');setCell(row,f.achievement,num(report.achievement)/100,'0.00%');setCell(row,f.workDate,toExcelDate(report.workDate),'dd/mm/yyyy');setCell(row,f.outputPerHour,num(report.outputPerHour),'0.00');setCell(row,f.ok,num(report.ok),'0.00');setCell(row,f.totalNg,num(report.totalNg),'0.00');if(f.ngRate)setCell(row,f.ngRate,num(report.ngRate)/100,'0.00%');const deductionCols=layout.deductionCodeColumns||{};for(const [code,column] of Object.entries(deductionCols))setCell(row,column,num(report.deductions?.[code]??report.deductions?.[normalizeCode(code)]??0),'0.00');const defectCols=layout.defectCodeColumns||{};for(const [code,column] of Object.entries(defectCols))setCell(row,column,num(report.defects?.[code]??report.defects?.[normalizeCode(code)]??0),'0.00');}

function findReportStartRow(block){return block.startRow;}
function clearReportRows(sheet,startRow,endRow,lastColumn){for(let rowNumber=startRow;rowNumber<=endRow;rowNumber++){const row=sheet.getRow(rowNumber);for(let column=1;column<=lastColumn;column++){const cell=row.getCell(column);if(!cell.isMerged)cell.value=null;}}}
function writeReportsToSheet(sheet,reports,layout,blocks){const rows=collectReportRows(reports);let cursor=0;for(const block of blocks){clearReportRows(sheet,findReportStartRow(block),block.endRow,layout.lastReportColumn);for(let rowNumber=block.startRow;rowNumber<=block.endRow&&cursor<rows.length;rowNumber++){writeReportRow(sheet.getRow(rowNumber),rows[cursor],layout,cursor+1);cursor++;}}return cursor;}

async function loadWorkbook(templatePath){const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(templatePath);materializeSharedFormulas(workbook);return workbook;}
async function buildCompanyExcelLocal({templateRoot,outputPath,year,month,reportsByProcess}){const group=GROUPS.GIA_CONG;const templatePath=ensureTemplateExists(templateRoot,group.template);const workbook=await loadWorkbook(templatePath);updateWorkbookPeriod(workbook,year,month);assertWorkbookPeriod(workbook,year,month);const reportRows=reportsByProcess?.GC||[];const sheet=workbook.getWorksheet('Cắt lồng');const layout=LAYOUTS.GIA_CONG;const blocks=findBlocks(sheet,layout);writeReportsToSheet(sheet,reportRows,layout,blocks);setWorkbookCalculationProperties(workbook);await fs.promises.mkdir(path.dirname(outputPath),{recursive:true});await workbook.xlsx.writeFile(outputPath);return outputPath;}

module.exports={GROUPS,LAYOUTS,safeText,num,normalizeCode,dateKey,toExcelDate,setCell,collectReportRows,writeReportRow,writeReportsToSheet,findBlocks,materializeSharedFormulas,updateWorkbookPeriod,assertWorkbookPeriod,setWorkbookCalculationProperties,buildCompanyExcelLocal};
