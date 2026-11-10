"use strict";
// KTC process-specific original workbook adapter. Never substitute a GC layout for another process.
const fs = require("fs");
const path = require("path");
const TEMPLATE_ROOT = process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, "templates"))
  ? path.join(process.resourcesPath, "templates")
  : path.resolve(__dirname, "../../backend/templates");
const FORMS = Object.freeze({
  MAI: { file:"01_MAU_MAI.xlsx", sheet:"MÀI", header:2, first:3, fields:{A:"stt",B:"workerCode",C:"workerName",D:"shift",E:"machine",H:"training",I:"workingTime",J:"actualTime",K:"deductionTime",AF:"product",AG:"standard",AH:"output",AI:"achievement",AK:"outputPerHour",AL:"ok",AM:"ng"}, deductions:["L","AE"], defects:["AN","AT"] },
  DO: { file:"02_MAU_DO.xlsx", sheet:"ĐO", header:2, first:3, fields:{A:"stt",B:"workerCode",C:"workerName",D:"shift",E:"machine",G:"training",H:"workingTime",I:"actualTime",J:"deductionTime",AB:"product",AC:"standard",AD:"output",AE:"achievement",AG:"outputPerHour",AH:"ok",AI:"ngRate",AJ:"ng"}, deductions:["K","AA"], defects:["AK","AO"] },
  K1: { file:"03_MAU_KIEM_1.xlsx", sheet:"KIỂM 1", header:4, first:5, fields:{A:"stt",B:"workerCode",C:"workerName",D:"product",F:"extra:press_date",G:"machine",H:"extra:press_box_shift",I:"deductionTime",J:"extra:deduction_work",K:"extra:late_early_hours",L:"extra:xlbv_deduction_worker",N:"actualTime",O:"expectedOutput",P:"output",Q:"achievement",S:"outputPerHour",T:"ok",U:"ng",V:"ngRate"}, defects:["W","BE"] },
  K2: { file:"04_MAU_KIEM_2.xlsx", sheet:"KIỂM 2", header:4, first:5, fields:{A:"stt",B:"workerCode",C:"workerName",D:"training",E:"deductionTime",V:"workingTime",W:"actualTime",X:"product",Y:"standard",Z:"output",AA:"achievement",AC:"outputPerHour",AD:"ok",AE:"ng",AF:"ngRate"}, deductions:["F","T"], deductionHeader:2, defects:["AG","CE"] },
  CAN: { file:"05_MAU_CAN.xlsx", sheet:"CÁN", header:2, first:3, fields:{A:"stt",B:"workerCode",C:"workerName",D:"shift",E:"machine",F:"actualTime",G:"product",H:"extra:material_code",I:"expectedOutput",J:"output",K:"achievement",M:"outputPerHour",N:"ngRate",O:"ng"}, defects:["P","S"] },
  EP: { file:"06_MAU_EP.xlsx", sheet:"ÉP", header:3, first:4, fields:{A:"stt",B:"workerCode",C:"workerName",D:"shift",E:"machine",F:"deductionTime",G:"actualTime",H:"product",I:"product",J:"standard",K:"output",L:"achievement",N:"outputPerHour",O:"ng",AF:"workingTime"}, deductions:["W","AE"], defects:["P","V"] },
  XLBV: { file:"07_MAU_XLBV.xlsx", sheet:"XLBV", header:4, first:5, fields:{A:"stt",B:"workerCode",C:"workerName",J:"ok",K:"actualTime",M:"product",O:"expectedOutput",P:"output",Q:"achievement",S:"outputPerHour",T:"ng",U:"ngRate"}, defects:["V","AI"] }
});
const norm = (value) => String(value == null ? "" : value)
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D")
  .toLowerCase().replace(/[^a-z0-9]/g,"");
const asNumeric = (value) => value == null || value === "" ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const toNumber = (column) => column.split("").reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
const templatePath = (code) => FORMS[code] ? path.join(TEMPLATE_ROOT,FORMS[code].file) : null;
function matchMasterValue(header, types, values) {
  const name = norm(header);
  if (!name) return null;
  const matches = types.filter(item => [item.label, ...(item.aliases || [])].some(a => {
    if (String(a).startsWith("id:") || String(a).startsWith("code:")) return false;
    return norm(String(a).replace(/^name:/,"")) === name;
  }));
  if (matches.length !== 1) return null;
  return [matches[0].key,...(matches[0].aliases||[])].map(key=>values.get(key)).find(v=>v!==undefined) ?? null;
}
async function renderOriginalProcessTemplate({ExcelJS, code, processData, yearMonth, settings, helpers}) {
  const config = FORMS[code];
  if (!config) return null;
  const filename = templatePath(code);
  if (!fs.existsSync(filename)) {
    const error = new Error("Chưa cài mẫu Excel gốc cho "+code+": "+filename+". Chạy scripts/installProcessTemplates.cjs trước khi xuất.");
    error.code = "KTC_ORIGINAL_EXCEL_TEMPLATE_MISSING";
    throw error;
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filename);
  const sheet = workbook.getWorksheet(config.sheet);
  if (!sheet) throw new Error("Mẫu "+code+" thiếu sheet "+config.sheet);
  const reports = helpers.sortReports(processData?.reports || []);
  const deductionTypes = helpers.processDetailTypes(code,processData,"deductionTypes","deductions","deduction");
  const defectTypes = helpers.processDetailTypes(code,processData,"defectTypes","defects","defect");
  const mapping = [];
  const putMap = (letter,key) => mapping.push({index:toNumber(letter),key,header:String(sheet.getCell(config.header,toNumber(letter)).value || "")});
  Object.entries(config.fields).forEach(([c,k])=>putMap(c,k));
  const buildDetailColumns = (kind,range,headerRow) => {
    if (!range) return [];
    const list=[];
    for(let col=toNumber(range[0]);col<=toNumber(range[1]);col++){
      const header=String(sheet.getCell(headerRow||config.header,col).value||"").trim();
      if(header)list.push({col,header,kind});
    }
    return list;
  };
  const detailCols=[
    ...buildDetailColumns("deduction",config.deductions,config.deductionHeader),
    ...buildDetailColumns("defect",config.defects)
  ];
  const distinct = new Set();
  for (const field of mapping) {
    if (distinct.has(field.index)) throw new Error("Duplicate template column index "+code);
    distinct.add(field.index);
  }
  // A copied source template has 50 blank styled rows. Additional rows
  // are made with the same styles without altering source headers/column widths.
  for (let index=0;index<reports.length;index++) {
    const report=reports[index];
    const rowIndex=config.first+index;
    const baseStyle=sheet.getRow(config.first);
    const row=sheet.getRow(rowIndex);
    if (rowIndex>config.first+49) {
      row.height=baseStyle.height;
      for(let col=1;col<=sheet.columnCount;col++){
        const seed=baseStyle.getCell(col), cell=row.getCell(col);
        if(seed.hasStyle) cell.style=JSON.parse(JSON.stringify(seed.style));
      }
    }
    const snapshot=helpers.reportSnapshot(report,helpers.settingsForReport(report,settings,processData?.settingsByDate||{}));
    const extra=helpers.parseExtraData(report);
    const values={...snapshot,stt:index+1,expectedOutput:(asNumeric(snapshot.standard)||0)*(asNumeric(snapshot.actualTime)||0)};
    for (const [col,key] of Object.entries(config.fields)) {
      const value=key.startsWith("extra:")?extra[key.slice(6)]:values[key];
      if(value!==undefined && value!==null) {
        const cell=row.getCell(toNumber(col));
        cell.value=value instanceof Date ? value : (typeof value==="number" && !Number.isFinite(value) ? null:value);
      }
    }
    for(const kind of ["deduction","defect"]) {
      const types=kind==="deduction"?deductionTypes:defectTypes;
      const details=helpers.detailMap(helpers.reportDetailItems(report,code,kind),kind);
      for (const d of detailCols.filter(item=>item.kind===kind)) {
        const value=matchMasterValue(d.header,types,details);
        if(value!==null) row.getCell(d.col).value=value;
      }
    }
  }
  // Replace fixed October sample dates/month captions with the requested period.
  const [reportYear,reportMonth]=yearMonth.split("-").map(Number);
  if (code==="MAI" || code==="DO") {
    const dateRow=sheet.getRow(1);
    dateRow.eachCell({includeEmpty:false},cell=>{
      if(typeof cell.value==="number" && cell.value>=46296 && cell.value<=46326) {
        const day=cell.value-46295;
        const candidate=new Date(reportYear,reportMonth-1,day);
        cell.value=(candidate.getMonth()===reportMonth-1) ? candidate : null;
      }
    });
  }
  if (code==="EP") {
    sheet.getCell("A2").value=new Date(reportYear,reportMonth-1,1);
    sheet.getCell("M3").value=new Date(reportYear,reportMonth-1,1);
  }
  if(code==="K1" || code==="XLBV") sheet.getCell("A1").value="THÁNG "+reportMonth+"/"+reportYear;
  // Remove fixed example totals and product codes left in extracted header-only samples.
  if(code==="CAN") { sheet.getCell("U1").value=null; sheet.getCell("V1").value=null; }
  if(code==="K2") sheet.getRow(1).eachCell({includeEmpty:false},cell=>{
    if(typeof cell.value==="number") cell.value=null;
  });
  if(code==="K1") sheet.getRow(3).eachCell({includeEmpty:false},cell=>{
    if(typeof cell.value==="number") cell.value=null;
  });
  // Label the actual report month without replacing the original headers.
  sheet.headerFooter.oddHeader = "KTC "+code+" - "+yearMonth;
  sheet.views=[{state:"frozen",ySplit:config.header,xSplit:3,showGridLines:false}];
  workbook.creator="KTC Production Control";
  workbook.modified=new Date();
  return {workbook,sheet,result:{processCode:code,reportCount:reports.length,templateKind:"original-company",templatePath:filename},mapping};
}
module.exports={FORMS,TEMPLATE_ROOT,templatePath,renderOriginalProcessTemplate};
