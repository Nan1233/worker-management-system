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
// FE and export receive the same per-process defect master data from the API.
// Resolve by stable ID/code first; names are only a fallback for legacy reports.
function masterAliases(item) {
  const keys=[];
  for(const value of [item?.defect_type_id,item?.type_id,item?.id]) {
    const n=Number(value);if(Number.isInteger(n)&&n>0)keys.push("id:"+n);
  }
  for(const value of [item?.defect_type_code,item?.defect_code,item?.type_code,item?.code]) {
    if(value!=null&&String(value).trim())keys.push("code:"+norm(value));
  }
  for(const value of [item?.defect_type_name,item?.defect_name,item?.type_name,item?.display_name,item?.label,item?.name]) {
    if(value!=null&&String(value).trim())keys.push("name:"+norm(value));
  }
  return [...new Set(keys)];
}
function defectDisplayName(item) {
  return String(item?.defect_type_name ?? item?.defect_name ?? item?.display_name ?? item?.type_name ?? item?.label ?? item?.name ?? item?.defect_type_code ?? item?.defect_code ?? item?.code ?? "").trim();
}
function makeDefectColumns(defectTypes,reports,helpers,code,slots) {
  const masters=Array.isArray(defectTypes)?defectTypes:[];
  const buckets=new Map();
  const canonical=(item)=>{
    const aliases=masterAliases(item);
    const matched=masters.find(master=>{
      const known=new Set([master.key,...(master.aliases||[])].map(String));
      return aliases.some(a=>known.has(a));
    });
    return matched || item;
  };
  for(let index=0;index<reports.length;index++){
    const details=helpers.reportDetailItems(reports[index],code,"defect");
    for(const item of details){
      const quantity=Number(item?.defect_quantity ?? item?.ng_quantity ?? item?.quantity ?? item?.qty ?? item?.value ?? 0);
      if(!Number.isFinite(quantity)||quantity<=0)continue;
      const master=canonical(item);
      const key=String(master.key || masterAliases(master)[0] || masterAliases(item)[0] || "name:"+norm(defectDisplayName(item)));
      if(!key||key==="name:")throw new Error("Không xác định được loại NG của "+code+" tại báo cáo "+(index+1));
      let entry=buckets.get(key);
      if(!entry){entry={key,label:String(master.label || defectDisplayName(master) || defectDisplayName(item) || key),values:new Map()};buckets.set(key,entry);}
      entry.values.set(index,(entry.values.get(index)||0)+quantity);
    }
  }
  if(buckets.size>slots.length)throw new Error("Mẫu "+code+" chỉ có "+slots.length+" cột NG nhưng dữ liệu cần "+buckets.size+" cột; không thể xuất mà không mất dữ liệu.");
  return [...buckets.values()];
}
async function renderOriginalProcessTemplate({ExcelJS, code, processData, yearMonth, settings, helpers, onTemplateLoaded}) {
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
  if (typeof onTemplateLoaded === "function") {
    await onTemplateLoaded({ processCode: code, templatePath: filename, sheetName: sheet.name,
      reportCount: (processData?.reports || []).length, templateKind: "original-company" });
  }
  const sourceReports = processData?.reports ?? [];
  if (!Array.isArray(sourceReports)) throw new Error("Dữ liệu báo cáo "+code+" không phải danh sách.");
  const reports = helpers.sortReports(sourceReports);
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
  const detailCols=buildDetailColumns("deduction",config.deductions,config.deductionHeader);
  // Preserve every named NG category in the company's form, including zero-count types.
  // Resolve its display label from the FE/API master list, never from sample daily totals.
  const defectCols=buildDetailColumns("defect",config.defects);
  const mappedDefects=[];
  for(const d of defectCols){
    const headerNorm=norm(d.header);
    const matches=defectTypes.filter(t=>[t.label,...(t.aliases||[])].some(v=>{
      const raw=String(v);return !raw.startsWith("id:")&&!raw.startsWith("code:")&&norm(raw.replace(/^name:/,""))===headerNorm;
    }));
    if(matches.length===1){
      const type=matches[0];
      const label=String(type.label||d.header);
      sheet.getCell(config.header,d.col).value=label;
      mappedDefects.push({...d,type});
      mapping.push({index:d.col,key:"defect:"+type.key,header:label});
    }else{
      // Keep the source heading rather than silently assigning another NG code.
      mappedDefects.push(d);
    }
    sheet.getColumn(d.col).hidden=false;
  }
  // FE/API master list is authoritative; retain every configured NG even at zero.
  const usedDefectKeys=new Set(mappedDefects.filter(d=>d.type).map(d=>String(d.type.key)));
  const extraDefects=[];
  const lastDefectCol=config.defects?toNumber(config.defects[1]):0;
  const lastMappedCol=Math.max(...Object.keys(config.fields).map(toNumber),lastDefectCol);
  const originalColumnCount=sheet.columnCount;
  let nextDefectCol=originalColumnCount+1;
  for(const type of defectTypes){
    const key=String(type.key);
    if(usedDefectKeys.has(key))continue;
    usedDefectKeys.add(key);
    const label=String(type.label||key);
    const col=nextDefectCol++;
    sheet.getCell(config.header,col).value=label;
    sheet.getColumn(col).width=Math.max(12,Math.min(30,label.length+3));
    sheet.getColumn(col).hidden=false;
    extraDefects.push({col,header:label,type});
    mapping.push({index:col,key:"defect:"+key,header:label});
  }
  // Hide obsolete right-hand daily OK/NG/% statistics and sample columns.
  // The original left-hand headings, their colors and date separator rows stay.
  for(let col=lastMappedCol+1;col<=originalColumnCount;col++){
    sheet.getColumn(col).hidden=true;
  }
  const distinct = new Set();
  for (const field of mapping) {
    if (distinct.has(field.index)) throw new Error("Duplicate template column index "+code);
    distinct.add(field.index);
  }
  // A copied source template has 50 blank styled rows. Additional rows
  // are made with the same styles without altering source headers/column widths.
  const dateOf=(report)=>{
    const raw=report?.work_date;
    if(raw instanceof Date&&!Number.isNaN(raw.getTime()))return raw.toISOString().slice(0,10);
    const match=String(raw??"").match(/^\\d{4}-\\d{2}-\\d{2}/);
    if(!match)throw new Error("Báo cáo "+code+" thiếu ngày sản xuất hợp lệ");
    return match[0];
  };
  // Clear old sample body cells, while preserving each company's formatting.
  const bodyEnd=sheet.rowCount;
  for(let r=config.first;r<=bodyEnd;r++){
    const row=sheet.getRow(r);
    row.eachCell({includeEmpty:false},cell=>{if(cell.type!==ExcelJS.ValueType.Merge)cell.value=null;});
  }
  let rowIndex=config.first;
  let currentDay=null;
  let dayStt=0;
  for (let index=0;index<reports.length;index++) {
    const report=reports[index];
    const day=dateOf(report);
    if(day!==currentDay){
      currentDay=day;dayStt=0;
      const separator=sheet.getRow(rowIndex++);
      separator.height=18;
      const first=separator.getCell(1);
      first.value=day.slice(8,10)+"/"+day.slice(5,7)+"/"+day.slice(0,4);
      first.font={...(first.font||{}),bold:true};
      // Keep the source workbook palette rather than importing GC's pink.
      const sourceFill=sheet.getCell(config.header,1).fill;
      if(sourceFill&&sourceFill.type==="pattern"){
        for(let col=1;col<=lastMappedCol;col++)separator.getCell(col).fill=JSON.parse(JSON.stringify(sourceFill));
      }
    }
    const targetRowIndex=rowIndex++;
    const baseStyle=sheet.getRow(config.first);
    const row=sheet.getRow(targetRowIndex);
    if (targetRowIndex>config.first+49) {
      row.height=baseStyle.height;
      for(let col=1;col<=sheet.columnCount;col++){
        const seed=baseStyle.getCell(col), cell=row.getCell(col);
        if(seed.hasStyle) cell.style=JSON.parse(JSON.stringify(seed.style));
      }
    }
    const snapshot=helpers.reportSnapshot(report,helpers.settingsForReport(report,settings,processData?.settingsByDate||{}));
    const extra=helpers.parseExtraData(report);
    const values={...snapshot,stt:++dayStt,expectedOutput:(asNumeric(snapshot.standard)||0)*(asNumeric(snapshot.actualTime)||0)};
    for (const [col,key] of Object.entries(config.fields)) {
      const value=key.startsWith("extra:")?extra[key.slice(6)]:values[key];
      if(value!==undefined && value!==null) {
        const cell=row.getCell(toNumber(col));
        cell.value=value instanceof Date ? value : (typeof value==="number" && !Number.isFinite(value) ? null:value);
      }
    }
    const deductionDetails=helpers.detailMap(helpers.reportDetailItems(report,code,"deduction"),"deduction");
    for(const d of detailCols){
      const value=matchMasterValue(d.header,deductionTypes,deductionDetails);
      if(value!==null)row.getCell(d.col).value=value;
    }
    const defectDetails=helpers.detailMap(helpers.reportDetailItems(report,code,"defect"),"defect");
    for(const d of [...mappedDefects,...extraDefects]){
      const value=d.type ? [d.type.key,...(d.type.aliases||[])].map(key=>defectDetails.get(key)).find(v=>v!==undefined) ?? null : matchMasterValue(d.header,defectTypes,defectDetails);
      if(value!==null)row.getCell(d.col).value=value;
    }
  }
  // Replace fixed October sample dates/month captions with the requested period.
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(yearMonth || ""))) {
    throw new Error("Kỳ báo cáo Excel không hợp lệ cho "+code+": "+yearMonth);
  }
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
  // Keep the company template print header/footer untouched. Some source sheets
  // have headerFooter=null, so assigning oddHeader would crash the export.
  sheet.views=[{state:"frozen",ySplit:config.header,xSplit:3,showGridLines:false}];
  workbook.creator="KTC Production Control";
  workbook.modified=new Date();
  return {workbook,sheet,result:{processCode:code,reportCount:reports.length,templateKind:"original-company",templatePath:filename},mapping};
}
module.exports={FORMS,TEMPLATE_ROOT,templatePath,renderOriginalProcessTemplate};
