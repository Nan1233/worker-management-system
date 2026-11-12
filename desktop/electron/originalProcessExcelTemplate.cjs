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
// Each process uses its own worksheet from the user-approved six-sheet workbook.
// Keep the original column positions, headings, styles and formulas.
const WORKBOOK1_FORMS = Object.freeze({
  GC: { file:"Workbook1.xlsx", sheet:"Gia công", header:3, first:5, fields:{A:"stt",B:"entryDate",C:"workerCode",D:"workerName",E:"training",F:"machine",G:"shift",H:"workingTime",I:"actualTime",J:"deductionTime",AA:"product",AB:"standard",AC:"output",AD:"achievement",AE:"date",AF:"ok",AG:"ng",AH:"ngRate"}, deductions:["K","Z"], defects:["AI","AZ"] },
  MAI: { file:"Workbook1.xlsx", sheet:"Mài", header:1, first:3, fields:{A:"stt",B:"entryDate",C:"workerCode",D:"workerName",E:"shift",F:"machine",I:"training",J:"workingTime",K:"actualTime",L:"deductionTime",AG:"product",AH:"standard",AI:"output",AJ:"achievement",AK:"date",AL:"outputPerHour",AM:"ok",AN:"ng",AO:"ngRate"}, deductions:["M","AF"], defects:["AP","AV"] },
  DO: { file:"Workbook1.xlsx", sheet:"Đo", header:1, first:3, fields:{A:"stt",B:"entryDate",C:"workerCode",D:"workerName",E:"shift",F:"machine",H:"training",I:"workingTime",J:"actualTime",K:"deductionTime",AC:"product",AD:"standard",AE:"output",AF:"achievement",AG:"date",AH:"outputPerHour",AI:"ok",AJ:"ng",AK:"ngRate"}, deductions:["L","AB"], defects:["AL","AW"] },
  XLBV: { file:"Workbook1.xlsx", sheet:"XLBV", header:1, first:3, fields:{A:"stt",B:"entryDate",C:"workerCode",D:"workerName",H:"deductionTime",J:"training",K:"ok",L:"shift",M:"actualTime",N:"product",P:"expectedOutput",Q:"output",R:"achievement",S:"date",T:"outputPerHour",U:"ng",V:"ngRate"}, defects:["W","AI"] },
  EP: { file:"Workbook1.xlsx", sheet:"Ép", header:1, first:3, fields:{A:"stt",B:"entryDate",C:"workerCode",D:"workerName",E:"shift",F:"machine",G:"deductionTime",H:"actualTime",I:"product",J:"product",K:"standard",L:"output",M:"achievement",N:"date",O:"outputPerHour",P:"ng",AG:"workingTime",AH:"note"}, deductions:["X","AF"], defects:["Q","W"] },
  CAN: { file:"Workbook1.xlsx", sheet:"Cán", header:1, first:3, fields:{A:"stt",B:"entryDate",C:"workerCode",D:"workerName",E:"shift",F:"machine",G:"actualTime",H:"extra:material_code",I:"product",J:"expectedOutput",K:"output",L:"achievement",M:"date",N:"outputPerHour",O:"ng",P:"ngRate",AA:"workingTime"}, deductions:["U","Z"], defects:["Q","T"] }
});
const norm = (value) => String(value == null ? "" : value)
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D")
  .toLowerCase().replace(/[^a-z0-9]/g,"");
const asNumeric = (value) => value == null || value === "" ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const templateCellText = (cell) => {
  const value = cell?.value;
  if (value && typeof value === "object") return String(value.result ?? value.text ?? "").trim();
  return String(value ?? "").trim();
};
const toNumber = (column) => column.split("").reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
const templatePath = (code) => {
  const form = WORKBOOK1_FORMS[code] || FORMS[code];
  return form ? path.join(TEMPLATE_ROOT,form.file) : null;
};
// Apply the source workbook's conditional color rules only to actual
// report rows. Date separators and trailing blank template rows have no CF.
function boundWorkbook1ConditionalFormats(sheet, firstDataRow, dataRows) {
  const originals = Array.isArray(sheet.conditionalFormattings)
    ? sheet.conditionalFormattings.slice() : [];
  const byColumn = new Map();
  for (const entry of originals) {
    for (const segment of String(entry.ref || "").split(/\s+/)) {
      const match = /^([A-Z]{1,3})(\d+)(?::([A-Z]{1,3})(\d+))?$/.exec(segment);
      if (!match) continue;
      const [, beginCol, beginText, endCol = beginCol, endText = beginText] = match;
      if (beginCol !== endCol || Number(endText) < firstDataRow) continue;
      const previous = byColumn.get(beginCol);
      // Some company templates contain duplicated rules. Prefer the
      // complete palette rather than stacking conflicting duplicates.
      if (!previous || (entry.rules || []).length > previous.rules.length) {
        byColumn.set(beginCol, {
          startRow:Number(beginText),
          rules:entry.rules || []
        });
      }
    }
  }
  sheet.conditionalFormattings = [];
  const sorted = [...dataRows].sort((a,b) => a-b);
  const ranges = [];
  for (const row of sorted) {
    const current = ranges[ranges.length-1];
    if (current && current.end === row-1) current.end=row;
    else ranges.push({start:row,end:row});
  }
  for (const [column,original] of byColumn) {
    for (const range of ranges) {
      const rules = JSON.parse(JSON.stringify(original.rules));
      const offset = range.start-original.startRow;
      for (const rule of rules) {
        if (rule.type !== "expression" || !Array.isArray(rule.formulae)) continue;
        rule.formulae = rule.formulae.map(formula => String(formula).replace(
          /(?<![A-Z0-9_])([A-Z]{1,3})(\d+)(?![A-Z0-9_])/g,
          (match,col,number) => {
            const target=Number(number)+offset;
            return target>0 ? col+target : match;
          }
        ));
      }
      sheet.addConditionalFormatting({
        ref:column+range.start+":"+column+range.end,
        rules
      });
    }
  }
}
// Shared with Gia công's monthly report rules in monthlyWorkbookLocal.cjs.
// >= 100% / <= 1% green; 90-<100% / >1-3% yellow; other orange-red.
const KTC_RATE_COLORS = Object.freeze({
  good:"FFC6E0B4", warning:"FFFFE699", bad:"FFF4B084"
});
const workbook1RateFill = (field,value) => {
  const n=Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(n)) return null;
  if (field === "achievement")
    return n >= 1 ? KTC_RATE_COLORS.good : n >= 0.9 ? KTC_RATE_COLORS.warning : KTC_RATE_COLORS.bad;
  if (field === "ngRate")
    return n <= 0.01 ? KTC_RATE_COLORS.good : n <= 0.03 ? KTC_RATE_COLORS.warning : KTC_RATE_COLORS.bad;
  return null;
};
const workbook1SolidFill = argb => ({
  type:"pattern", pattern:"solid", fgColor:{argb}
});
const defaultGridBorder = () => ({
  top:{style:"thin",color:{argb:"FF333333"}},
  bottom:{style:"thin",color:{argb:"FF333333"}},
  left:{style:"thin",color:{argb:"FF333333"}},
  right:{style:"thin",color:{argb:"FF333333"}}
});
const completeBorder = source => {
  const border=source ? JSON.parse(JSON.stringify(source)) : {};
  const fallback=defaultGridBorder();
  for (const edge of ["top","bottom","left","right"]) {
    if (!border[edge] || !border[edge].style) border[edge]=fallback[edge];
  }
  return border;
};
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
  const config = WORKBOOK1_FORMS[code] || FORMS[code];
  const workbook1 = Boolean(WORKBOOK1_FORMS[code]);
  if (!config) return null;
  const filename = path.join(TEMPLATE_ROOT, config.file);
  if (!fs.existsSync(filename)) {
    const error = new Error("Chưa cài mẫu Excel gốc cho "+code+": "+filename+". Chạy scripts/installProcessTemplates.cjs trước khi xuất.");
    error.code = "KTC_ORIGINAL_EXCEL_TEMPLATE_MISSING";
    throw error;
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filename);
  const sheet = workbook.getWorksheet(config.sheet);
  if (!sheet) throw new Error("Mẫu "+code+" thiếu sheet "+config.sheet);
  // Each exported process file contains only its own source worksheet.
  if (workbook1) {
    for (const other of [...workbook.worksheets]) {
      if (other.id !== sheet.id) workbook.removeWorksheet(other.id);
    }
    // Some supplied header labels are circular/linked formulas with a cached
    // string. Fix the heading as text so Excel recalculation cannot erase it.
    sheet.getRow(config.header).eachCell({ includeEmpty: false }, cell => {
      if (cell.value && typeof cell.value === "object" && typeof cell.value.result === "string") {
        cell.value = cell.value.result;
      }
    });
  }
  if (typeof onTemplateLoaded === "function") {
    await onTemplateLoaded({ processCode: code, templatePath: filename, sheetName: sheet.name,
      reportCount: (processData?.reports || []).length, templateKind: workbook1 ? "workbook1-sheet" : "original-company" });
  }
  const sourceReports = processData?.reports ?? [];
  if (!Array.isArray(sourceReports)) throw new Error("Dữ liệu báo cáo "+code+" không phải danh sách.");
  const reports = helpers.sortReports(sourceReports);
  const deductionTypes = helpers.processDetailTypes(code,processData,"deductionTypes","deductions","deduction");
  const defectTypes = helpers.processDetailTypes(code,processData,"defectTypes","defects","defect");
  const mapping = [];
  const putMap = (letter,key) => mapping.push({index:toNumber(letter),key,header:templateCellText(sheet.getCell(config.header,toNumber(letter)))});
  Object.entries(config.fields).forEach(([c,k])=>putMap(c,k));
  const buildDetailColumns = (kind,range,headerRow) => {
    if (!range) return [];
    const list=[];
    for(let col=toNumber(range[0]);col<=toNumber(range[1]);col++){
      const header=templateCellText(sheet.getCell(headerRow||config.header,col));
      if(header)list.push({col,header,kind});
    }
    return list;
  };
  const detailCols=buildDetailColumns("deduction",config.deductions,config.deductionHeader);
  // Preserve every named NG category in the company's form, including zero-count types.
  // Resolve its display label from the FE/API master list, never from sample daily totals.
  const defectCols=buildDetailColumns("defect",config.defects);
  // MAI's production form has exactly seven active NG types (AN:AT).
  // Historical/inactive API masters must not generate duplicate, unstyled columns.
  const maiDefectLabels=["KQD ĐẢO","Xô cs","PPCM Mất điện","Hàng rơi","K-coleet","Thiếu - lẫn cs CSH","Lỗi cao su"];
  if(code==="MAI" && !workbook1){
    for(let i=0;i<7;i++){
      const col=toNumber("AN")+i;
      sheet.getCell(config.header,col).value=maiDefectLabels[i];
      sheet.getColumn(col).hidden=false;
    }
  }
  const workbook1DefectPrefix = { GC:"CAT", MAI:"MAI_NG_", DO:"DO_NG_", XLBV:"XLBV", EP:"EP", CAN:"CAN" };
  const mappedDefects=[];
  for(const [defectIndex,d] of defectCols.entries()){
    const headerNorm=norm(d.header);
    // The company's workbook headers are descriptions, while the API sends
    // stable coded defects (MAI_NG_01, DO_NG_01, etc.). Match the exact
    // positional code first; a display-name match cannot resolve code-only
    // payloads and can leave genuine NG quantities blank.
    const expectedCode = workbook1
      ? norm(workbook1DefectPrefix[code] + String(d.col-toNumber(config.defects[0])+1).padStart(2,"0"))
      : "";
    const codedMatches = expectedCode ? defectTypes.filter(t=>
      [t.key,...(t.aliases||[])].some(v=> {
        const raw=String(v);
        return raw.startsWith("code:") && norm(raw.slice(5))===expectedCode;
      })
    ) : [];
    const matches=codedMatches.length===1 ? codedMatches : workbook1
      ? defectTypes.filter(t=>[t.label,...(t.aliases||[])].some(v=>{
          const raw=String(v); const normalized=norm(raw.replace(/^(name:|code:)/,""));
          if(raw.startsWith("id:") || !normalized) return false;
          return normalized===headerNorm || (raw.startsWith("code:") && headerNorm.startsWith(normalized) && normalized.length>=4)
            || (raw.startsWith("name:") && headerNorm.endsWith(normalized) && normalized.length>=5);
        }))
      : code==="MAI"
        ? defectTypes.filter(t=>[t.key,...(t.aliases||[])].some(v=>norm(v).includes("maing"+String(defectIndex+1).padStart(3,"0")) || norm(v)===norm(maiDefectLabels[defectIndex])))
        : defectTypes.filter(t=>[t.label,...(t.aliases||[])].some(v=>{
            const raw=String(v);return !raw.startsWith("id:")&&!raw.startsWith("code:")&&norm(raw.replace(/^name:/,""))===headerNorm;
          }));
    if(matches.length===1){
      const type=matches[0];
      const label=workbook1 ? d.header : (code==="MAI"?maiDefectLabels[defectIndex]:String(type.label||d.header));
      if (!workbook1) sheet.getCell(config.header,d.col).value=label;
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
  // New real NG categories belong immediately after the final mapped column,
  // not after hundreds of blank preformatted template columns.
  let nextDefectCol=lastMappedCol+1;
  for(const type of (code==="MAI" && !workbook1 ? [] : defectTypes)){
    const key=String(type.key);
    if(usedDefectKeys.has(key))continue;
    if(workbook1 && !reports.some(report => helpers.reportDetailItems(report,code,"defect").some(item => {
      const quantity = Number(item?.defect_quantity ?? item?.ng_quantity ?? item?.quantity ?? item?.qty ?? item?.value ?? 0);
      return quantity>0 && masterAliases(item).some(alias => [type.key,...(type.aliases||[])].includes(alias));
    }))) continue;
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
  if (!workbook1) for(let col=lastMappedCol+1;col<=originalColumnCount;col++){
    sheet.getColumn(col).hidden=true;
  }
  const distinct = new Set();
  for (const field of mapping) {
    if (distinct.has(field.index)) throw new Error("Duplicate template column index "+code);
    distinct.add(field.index);
  }
  // A copied source template has 50 blank styled rows. Additional rows
  // are made with the same styles without altering source headers/column widths.
  // Use the same local date normalization as the established GC exporter.
  // Backend work_date can be a Date, ISO timestamp, or SQL date string.
  const dateOf=(report)=>{
    // Diagnostic only: log date values before normalization, without exposing worker details.
    if(String(report?.id)==="1170007"||String(report?.id)==="1050001"){
      const raw=report?.work_date;
      console.log("[KTC_EXCEL_DATE_DIAGNOSTIC]",JSON.stringify({
        processCode:code,reportId:report?.id,yearMonth,
        workDateValue:raw instanceof Date?raw.toISOString():raw??null,
        workDateType:raw instanceof Date?"Date":typeof raw,
        normalizedDate:helpers.dateKey(raw),
        dateFields:Object.keys(report||{}).filter(key=>/date|ngay/i.test(key))
      }));
    }
    // Export payloads may use snake_case or camelCase; only accept a date
    // within the requested month, never substitute the sync/creation date.
    const candidates=[report?.work_date,report?.workDate,report?.production_date,report?.productionDate,report?.report_date,report?.reportDate];
    for(const raw of candidates){
      const key=helpers.dateKey(raw);
      if(/^\d{4}-\d{2}-\d{2}$/.test(key)&&key.slice(0,7)===yearMonth)return key;
    }
    const fields=Object.keys(report||{}).filter(key=>/date|ngay/i.test(key)).join(",");
    throw new Error("Báo cáo "+code+" (id="+String(report?.id??"?")+") thiếu ngày sản xuất thuộc "+yearMonth+"; dateFields="+fields);
  };
  // Capture an untouched template body style before inserting date separators.
  // Reuse the original cell formatting for every MAI data row, including rows
  // beyond the template's preformatted sample area.
  const originalBodyStyle={
    height:sheet.getRow(config.first).height,
    cells:Array.from({length:Math.max(sheet.columnCount,lastMappedCol)},(_,i)=>{
      const cell=sheet.getRow(config.first).getCell(i+1);
      // Capture effective colors separately: imported Excel cells may derive
      // their fills from row/column styles even when cell.style.fill is absent.
      return {
        style:cell.hasStyle?JSON.parse(JSON.stringify(cell.style)):null,
        fill:cell.fill?JSON.parse(JSON.stringify(cell.fill)):null
      };
    })
  };
  // Workbook1's pink separator is the sample row directly above the first
  // report row. Reuse that row rather than leaving its obsolete sample date
  // and creating an unstyled separator beneath it.
  const separatorTemplate = workbook1 ? sheet.getRow(config.first-1) : null;
  const separatorStyle = separatorTemplate ? {
    height: separatorTemplate.height,
    fill: separatorTemplate.getCell(1).fill
      ? JSON.parse(JSON.stringify(separatorTemplate.getCell(1).fill)) : null,
    cells: Array.from({length:sheet.columnCount},(_,i)=>{
      const cell=separatorTemplate.getCell(i+1);
      return cell.hasStyle ? JSON.parse(JSON.stringify(cell.style)) : null;
    })
  } : null;
  if (workbook1) sheet.getColumn(2).hidden = true; // Thời gian nộp báo cáo
  // Clear old sample body cells, while preserving each company's formatting.
  const bodyEnd=sheet.rowCount;
  for(let r=workbook1 ? config.first-1 : config.first;r<=bodyEnd;r++){
    const row=sheet.getRow(r);
    row.eachCell({includeEmpty:false},cell=>{if(cell.type!==ExcelJS.ValueType.Merge)cell.value=null;});
  }
  let rowIndex=workbook1 ? config.first-1 : config.first;
  const workbook1DataRows = [];
  const workbook1SeparatorRows = [];
  let currentDay=null;
  let dayStt=0;
  for (let index=0;index<reports.length;index++) {
    const report=reports[index];
    const day=dateOf(report);
    if(day!==currentDay){
      currentDay=day;dayStt=0;
      const separator=sheet.getRow(rowIndex++);
      if (workbook1) workbook1SeparatorRows.push(separator.number);
      if (separatorStyle) {
        separator.height=separatorStyle.height;
        separatorStyle.cells.forEach((style,index)=>{
          const cell = separator.getCell(index+1);
          if (style) cell.style=JSON.parse(JSON.stringify(style));
          // Source Workbook1 paints the entire date row pink. Applying only
          // per-cell styles lets previously styled data cells keep white fills
          // on later separators (e.g. the second MÀI day).
          if (separatorStyle.fill) {
            cell.style = {
              ...JSON.parse(JSON.stringify(cell.style || {})),
              fill: JSON.parse(JSON.stringify(separatorStyle.fill))
            };
          }
        });
      } else {
        separator.height=18;
      }
      const first=separator.getCell(1);
      first.value=day.slice(8,10)+"/"+day.slice(5,7)+"/"+day.slice(0,4);
      first.font={...(first.font||{}),bold:true};
      // The pink separator's fill comes from the workbook's source row,
      // never from a hard-coded color or a normal data row.
    }
    const targetRowIndex=rowIndex++;
    if (workbook1) workbook1DataRows.push(targetRowIndex);
    const baseStyle=sheet.getRow(config.first);
    const row=sheet.getRow(targetRowIndex);
    if (targetRowIndex>config.first+49) {
      row.height=baseStyle.height;
      for(let col=1;col<=sheet.columnCount;col++){
        const seed=baseStyle.getCell(col), cell=row.getCell(col);
        if(seed.hasStyle) cell.style=JSON.parse(JSON.stringify(seed.style));
      }
    }
    if(originalBodyStyle){
      row.height=originalBodyStyle.height;
      for(let col=1;col<=lastMappedCol;col++){
        const snapshot=originalBodyStyle.cells[col-1];
        if(snapshot?.style)row.getCell(col).style=JSON.parse(JSON.stringify(snapshot.style));
        if(snapshot?.fill)row.getCell(col).fill=JSON.parse(JSON.stringify(snapshot.fill));
      }
    }
    const snapshot=helpers.reportSnapshot(report,helpers.settingsForReport(report,settings,processData?.settingsByDate||{}));
    const extra=helpers.parseExtraData(report);
    // ExcelJS stores Date values as UTC serial dates. Construct at UTC
    // midnight, otherwise a +07 local midnight is displayed one day early.
    const [dayYear,dayMonth,dayNumber]=day.split("-").map(Number);
    const excelWorkDate=new Date(Date.UTC(dayYear,dayMonth-1,dayNumber));
    const values={...snapshot,stt:++dayStt, date:excelWorkDate,
      expectedOutput:(asNumeric(snapshot.standard)||0)*(asNumeric(snapshot.actualTime)||0)};
    // Preserve the established GC work-type codes when the row represents
    // non-product work; never replace them with an invented product code.
    if (code === "GC") {
      const nonProduct = extra.non_product_work === true || extra.non_product_work === 1
        || String(extra.non_product_work || "").toLowerCase() === "true";
      if (nonProduct) {
        const raw = String(extra.work_type ?? extra.workType ?? report.work_type ?? "").trim().toUpperCase();
        const types = { TAIPP:"TPP", TPP:"TPP", XUATNHAP:"XN", XN:"XN", KTCD:"KTCD" };
        values.product = types[raw] || raw || null;
      }
    }
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
  if (workbook1) {
    // Date separators are copied from the pink sample row, but DATA rows
    // must always retain the individual column fills of the original body
    // (white / green / yellow / red / etc). Reapply from the immutable
    // source snapshot after building all rows so style sharing or repeated
    // separators cannot tint normal reports pink.
    for (const dataRowIndex of workbook1DataRows) {
      const row = sheet.getRow(dataRowIndex);
      for (let col = 1; col <= lastMappedCol; col++) {
        const original = originalBodyStyle.cells[col-1];
        const cell = row.getCell(col);
        // Replace the WHOLE style model with an independent copy. Assigning
        // cell.fill alone mutates a shared ExcelJS style and recolors adjacent
        // date/data rows on serialization.
        const independentStyle = original?.style
          ? JSON.parse(JSON.stringify(original.style)) : {};
        independentStyle.fill = original?.fill
          ? JSON.parse(JSON.stringify(original.fill))
          : { type:'pattern', pattern:'none' };
        cell.style = independentStyle;
      }
    }
    // Apply separator fills LAST. ExcelJS imported cells can share an
    // underlying style model; styling a later data row may otherwise clear
    // the earlier pink row (observed on day 2 in MÀI and ĐO).
    for (const separatorRowIndex of workbook1SeparatorRows) {
      const row = sheet.getRow(separatorRowIndex);
      for (let col = 1; col <= sheet.columnCount; col++) {
        const cell = row.getCell(col);
        const independentStyle = separatorStyle?.cells[col-1]
          ? JSON.parse(JSON.stringify(separatorStyle.cells[col-1])) : {};
        independentStyle.fill = separatorStyle?.fill
          ? JSON.parse(JSON.stringify(separatorStyle.fill))
          : { type:'pattern', pattern:'none' };
        cell.style = independentStyle;
      }
    }
  }
  if (workbook1) {
    // Blank formatted sample rows are not data. Remove them entirely, not just
    // their values, otherwise Excel/WPS shows a long empty bordered table.
    const lastDataRow = Math.max(config.header, rowIndex - 1);
    // ExcelJS.spliceRows(start, count) moves rows but does not reliably
    // reduce worksheet.rowCount when the template has pre-styled empty rows.
    // Those old row objects keep the exported dimension at row 115.
    // Remove the trailing row models themselves so Excel/WPS does not draw
    // a large empty bordered table after the final approved report.
    if (sheet.rowCount > lastDataRow) {
      sheet._rows.length = lastDataRow;
    }
    // Trim the source form's unused right-hand styled columns as well as its
    // unused bottom rows. Preserve any genuinely appended NG columns.
    const lastDataCol = Math.max(lastMappedCol,...extraDefects.map(d=>d.col));
    for (const row of sheet._rows) {
      if (row && row._cells && row._cells.length > lastDataCol) {
        row._cells.length=lastDataCol;
      }
    }
    if (sheet._columns && sheet._columns.length > lastDataCol) {
      sheet._columns.length=lastDataCol;
    }
    // Remove only merged blocks fully outside the retained table; they
    // otherwise expand the worksheet dimension back into blank columns.
    if (sheet._merges) for (const [key,range] of Object.entries(sheet._merges)) {
      if (range.left > lastDataCol) delete sheet._merges[key];
    }
    // Keep a complete four-sided grid through the last actual report. The
    // source form can omit edges on styled sample rows; writing only cell
    // values must never make adjacent report cells look borderless.
    for (const rowNumber of [...workbook1SeparatorRows,...workbook1DataRows]) {
      const row = sheet.getRow(rowNumber);
      const isDaySeparator = workbook1SeparatorRows.includes(rowNumber);
      for (let col=1;col<=lastDataCol;col++) {
        const cell=row.getCell(col);
        const sourceBorder=isDaySeparator
          ? separatorStyle?.cells[col-1]?.border
          : originalBodyStyle.cells[col-1]?.style?.border;
        cell.border=completeBorder(sourceBorder);
      }
    }
    // Percentage values stay numeric ratios, with Excel percentage display.
    // Use the configured field keys rather than column positions so that
    // %TT and %PP stay correct across all six different company layouts.
    const percentageColumns = Object.entries(config.fields)
      .filter(([,field]) => field === "achievement" || field === "ngRate")
      .map(([letter,field]) => ({col:toNumber(letter),field}));
    for (const rowNumber of workbook1DataRows) {
      const row = sheet.getRow(rowNumber);
      for (const {col,field} of percentageColumns) {
        const cell = row.getCell(col);
        cell.numFmt = "0.##%";
        const fillColor = workbook1RateFill(field,cell.value);
        if (fillColor) {
          cell.fill = workbook1SolidFill(fillColor);
          cell.font = {...(cell.font || {}),bold:true,
            color:{argb:"FF1F2937"}};
        }
      }
    }
    // One font throughout the exported company form. Preserve each cell's
    // bold/italic/color properties; only standardize family and point size.
    for (let rowNumber = 1; rowNumber <= lastDataRow; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      for (let col = 1; col <= lastDataCol; col++) {
        const cell = row.getCell(col);
        if (cell.type === ExcelJS.ValueType.Merge) continue;
        cell.font = {
          ...(cell.font ? JSON.parse(JSON.stringify(cell.font)) : {}),
          name: "Times New Roman",
          size: 12
        };
      }
    }
    // Auto-fit date-bearing columns for Times New Roman 12. ExcelJS does
    // not calculate font metrics, so reserve a safe width for dd/mm/yyyy
    // plus cell padding; never shrink a wider company-template column.
    // Column A contains the pink day separator date for all six forms.
    const dateColumns = new Set([1]);
    for (const [letter,field] of Object.entries(config.fields)) {
      if (field === "date" || field === "entryDate") dateColumns.add(toNumber(letter));
    }
    for (const col of dateColumns) {
      const column=sheet.getColumn(col);
      column.width=Math.max(Number(column.width)||0,16);
      if(col!==1) {
        for(const rowNumber of workbook1DataRows) {
          const cell=sheet.getRow(rowNumber).getCell(col);
          if(cell.value instanceof Date) cell.numFmt="dd/mm/yyyy";
        }
      }
    }
    // Preserve each sheet's original %TT/NG color logic, but constrain
    // it to actual report rows: no pink date rows and no 100+ empty rows.
    boundWorkbook1ConditionalFormats(sheet,config.first,workbook1DataRows);
    // Existing company-template conditional formats must not override the
    // shared Gia công percentage colors applied above.
    const fixedRateColumns=new Set(percentageColumns.map(item=>sheet.getColumn(item.col).letter));
    sheet.conditionalFormattings = (sheet.conditionalFormattings || [])
      .filter(rule=>!fixedRateColumns.has(String(rule.ref||"").split(/[0-9:]/)[0]));
    const lastDataColumn = sheet.getColumn(lastDataCol).letter;
    sheet.pageSetup.printArea = `A1:${lastDataColumn}${lastDataRow}`;
    sheet.autoFilter = undefined;
  }
  // Replace fixed October sample dates/month captions with the requested period.
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(yearMonth || ""))) {
    throw new Error("Kỳ báo cáo Excel không hợp lệ cho "+code+": "+yearMonth);
  }
  const [reportYear,reportMonth]=yearMonth.split("-").map(Number);
  if (!workbook1 && (code==="MAI" || code==="DO")) {
    const dateRow=sheet.getRow(1);
    dateRow.eachCell({includeEmpty:false},cell=>{
      if(typeof cell.value==="number" && cell.value>=46296 && cell.value<=46326) {
        const day=cell.value-46295;
        const candidate=new Date(reportYear,reportMonth-1,day);
        cell.value=(candidate.getMonth()===reportMonth-1) ? candidate : null;
      }
    });
  }
  if (!workbook1 && code==="EP") {
    sheet.getCell("A2").value=new Date(reportYear,reportMonth-1,1);
    sheet.getCell("M3").value=new Date(reportYear,reportMonth-1,1);
  }
  if(code==="K1" || (code==="XLBV" && !workbook1)) sheet.getCell("A1").value="THÁNG "+reportMonth+"/"+reportYear;
  // Remove fixed example totals and product codes left in extracted header-only samples.
  if(code==="CAN" && !workbook1) { sheet.getCell("U1").value=null; sheet.getCell("V1").value=null; }
  if(code==="K2") sheet.getRow(1).eachCell({includeEmpty:false},cell=>{
    if(typeof cell.value==="number") cell.value=null;
  });
  if(code==="K1") sheet.getRow(3).eachCell({includeEmpty:false},cell=>{
    if(typeof cell.value==="number") cell.value=null;
  });
  if (workbook1 && reports.length===0) {
    // A blank month still displays its month in the preserved pink sample row.
    sheet.getCell(config.first-1,1).value = new Date(Date.UTC(reportYear,reportMonth-1,1));
  }
  // Keep the company template print header/footer untouched. Some source sheets
  // have headerFooter=null, so assigning oddHeader would crash the export.
  sheet.views=[{state:"frozen",ySplit:config.header,xSplit:3,showGridLines:false}];
  workbook.creator="KTC Production Control";
  workbook.modified=new Date();
  return {workbook,sheet,result:{processCode:code,reportCount:reports.length,templateKind:"original-company",templatePath:filename},mapping};
}
module.exports={FORMS,WORKBOOK1_FORMS,TEMPLATE_ROOT,templatePath,renderOriginalProcessTemplate};
