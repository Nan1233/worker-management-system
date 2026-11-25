"use strict";
// KTC process-specific original workbook adapter. Never substitute a GC layout for another process.
const fs = require("fs");
const path = require("path");
const TEMPLATE_ROOT = process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, "templates"))
  ? path.join(process.resourcesPath, "templates")
  : path.resolve(__dirname, "../../backend/templates");
const { FORMS, WORKBOOK1_FORMS } = require('./originalProcessTemplateRegistry.cjs');
const { trimOriginalTemplateSheet } = require('./originalTemplateSheetTrimming.cjs');
const { cloneExcelStyle } = require('./excelStyleClone.cjs');
const { reportWorkDate, reportRowValues } = require('./originalProcessReportProjection.cjs');
const { rowIdentityKey } = require('./gcMachineExportRows.cjs');
const norm = (value) => String(value == null ? "" : value)
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D")
  .toLowerCase().replace(/[^a-z0-9]/g,"");
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
const { createOriginalProcessTemplateHelpers } = require('./originalProcessTemplateHelpers.cjs');
const {
  boundWorkbook1ConditionalFormats, workbook1RateFill, workbook1SolidFill,
  completeBorder, matchMasterValue, masterAliases, defectDisplayName, makeDefectColumns,
} = createOriginalProcessTemplateHelpers({ norm });

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
  // Only a single exact master identity can be an editable detail column.
  const resolveDetailKey=(type,kind,col)=>{
    const ids=[...new Set([type?.key,...(type?.aliases||[])].filter(key=>/^id:[1-9]\d*$/.test(String(key))))];
    return ids.length===1?kind+":"+ids[0]:"readonly:"+kind+":"+col;
  };
  for(const d of detailCols){
    const name=norm(d.header);
    const matches=deductionTypes.filter(type=>[type.label,...(type.aliases||[])].some(alias=>{
      const raw=String(alias);
      return !raw.startsWith("id:")&&!raw.startsWith("code:")&&norm(raw.replace(/^name:/,""))===name;
    }));
    mapping.push({index:d.col,key:resolveDetailKey(matches.length===1?matches[0]:null,"deduction",d.col),header:d.header});
  }
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
    const ordinal = d.col-toNumber(config.defects[0])+1;
    const expectedCode = workbook1
      ? norm(code === 'GC' && ordinal > 10
        ? 'LONG' + String(ordinal - 10).padStart(2, '0')
        : workbook1DefectPrefix[code] + String(ordinal).padStart(2, '0'))
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
      mapping.push({index:d.col,key:resolveDetailKey(type,"defect",d.col),header:label});
    }else{
      // Keep the source heading rather than silently assigning another NG code.
      mappedDefects.push(d);
      mapping.push({index:d.col,key:"readonly:defect:"+d.col,header:d.header});
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
    mapping.push({index:col,key:resolveDetailKey(type,"defect",col),header:label});
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
        style:cell.hasStyle?cloneExcelStyle(cell.style):null,
        fill:cell.fill?cloneExcelStyle(cell.fill):null
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
      ? cloneExcelStyle(separatorTemplate.getCell(1).fill) : null,
    cells: Array.from({length:sheet.columnCount},(_,i)=>{
      const cell=separatorTemplate.getCell(i+1);
      return cell.hasStyle ? cloneExcelStyle(cell.style) : null;
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
  const reportRowIdentity = new Map();
  const workbook1DataRows = [];
  const workbook1SeparatorRows = [];
  let currentDay=null;
  let dayStt=0;
  for (let index=0;index<reports.length;index++) {
    const report=reports[index];
    const day=reportWorkDate(report, code, yearMonth, helpers.dateKey);
    if(day!==currentDay){
      currentDay=day;dayStt=0;
      const separator=sheet.getRow(rowIndex++);
      if (workbook1) workbook1SeparatorRows.push(separator.number);
      if (separatorStyle) {
        separator.height=separatorStyle.height;
        separatorStyle.cells.forEach((style,index)=>{
          const cell = separator.getCell(index+1);
          if (style) cell.style=cloneExcelStyle(style);
          // Source Workbook1 paints the entire date row pink. Applying only
          // per-cell styles lets previously styled data cells keep white fills
          // on later separators (e.g. the second MÀI day).
          if (separatorStyle.fill) {
            cell.style = {
              ...cloneExcelStyle(cell.style || {}),
              fill: cloneExcelStyle(separatorStyle.fill)
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
        if(seed.hasStyle) cell.style=cloneExcelStyle(seed.style);
      }
    }
    if(originalBodyStyle){
      row.height=originalBodyStyle.height;
      for(let col=1;col<=lastMappedCol;col++){
        const snapshot=originalBodyStyle.cells[col-1];
        if(snapshot?.style)row.getCell(col).style=cloneExcelStyle(snapshot.style);
        if(snapshot?.fill)row.getCell(col).fill=cloneExcelStyle(snapshot.fill);
      }
    }
    const snapshot=helpers.reportSnapshot(report,helpers.settingsForReport(report,settings,processData?.formulaSettingsByDate||processData?.settingsByDate||{}));
    const extra=helpers.parseExtraData(report);
    const values = reportRowValues({ snapshot, day, stt: ++dayStt, code, report, extra });
    const identityKey=rowIdentityKey(report);
    if(reportRowIdentity.has(identityKey))throw new Error('Trùng định danh dòng Excel: '+identityKey);
    reportRowIdentity.set(identityKey,{row:targetRowIndex,day,stt:dayStt});
    for (const [col,key] of Object.entries(config.fields)) {
      const value=key.startsWith("extra:")?extra[key.slice(6)]:values[key];
      if(value!==undefined && value!==null) {
        const cell=row.getCell(toNumber(col));
        cell.value=value instanceof Date ? value : (typeof value==="number" && !Number.isFinite(value) ? null:value);
        // reportSnapshot.training is already a 0..1 factor (100% = 1).
        // Format only; dividing again would incorrectly turn 100% into 1%.
        // Applies to every process template that maps a training column.
        if(key==="training") cell.numFmt="0.##%";
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
          ? cloneExcelStyle(original.style) : {};
        independentStyle.fill = original?.fill
          ? cloneExcelStyle(original.fill)
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
          ? cloneExcelStyle(separatorStyle.cells[col-1]) : {};
        independentStyle.fill = separatorStyle?.fill
          ? cloneExcelStyle(separatorStyle.fill)
          : { type:'pattern', pattern:'none' };
        cell.style = independentStyle;
      }
    }
  }
  if (workbook1) {
    // Blank formatted sample rows are not data. Remove them entirely, not just
    // their values, otherwise Excel/WPS shows a long empty bordered table.
    const lastDataRow = Math.max(config.header, rowIndex - 1);
    // Remove the blank template sample area using supported worksheet APIs.
    const lastDataCol = Math.max(lastMappedCol,...extraDefects.map(d=>d.col));
    trimOriginalTemplateSheet(sheet, lastDataRow, lastDataCol);
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
          ...(cell.font ? cloneExcelStyle(cell.font) : {}),
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
    // Time and deduction amounts retain source column widths. Display at
    // most two decimals, without modifying underlying numeric precision.
    const timeColumns=new Set(Object.entries(config.fields)
      .filter(([,field])=>/(?:time|hours|minutes|duration)/i.test(field))
      .map(([letter])=>toNumber(letter)));
    if(config.deductions)
      for(let col=toNumber(config.deductions[0]);col<=toNumber(config.deductions[1]);col++)
        timeColumns.add(col);
    for(let col=1;col<=lastDataCol;col++){
      const heading=templateCellText(sheet.getCell(config.header,col));
      if(/(?:thời gian|thoi gian|giờ|phút|hours?|minutes?)/i.test(heading))
        timeColumns.add(col);
    }
    for(const rowNumber of workbook1DataRows)
      for(const col of timeColumns){
        const cell=sheet.getRow(rowNumber).getCell(col);
        if(typeof cell.value==="number" && Number.isFinite(cell.value))
          cell.numFmt='#,##0.##';
      }
    // Size columns from visible report values. ExcelJS has no font metrics;
    // widths include padding for Times New Roman 12 and percentage symbols.
    const visibleCellText = cell => {
      const v = cell.value;
      if (v == null) return "";
      if (v instanceof Date) return "00/00/0000";
      if (typeof v === "number") {
        if (cell.numFmt && cell.numFmt.includes("%"))
          return (v*100).toLocaleString("en-US",{maximumFractionDigits:2})+"%";
        return String(v);
      }
      if (typeof v === "object")
        return String(v.result ?? v.text ?? (Array.isArray(v.richText)
          ? v.richText.map(item=>item.text).join("") : v.formula ?? ""));
      return String(v);
    };
    for (let col=1;col<=lastDataCol;col++) {
      const column=sheet.getColumn(col);
      let longestData=0;
      let longestHeaderWord=0;
      for (let rowNumber=1;rowNumber<=lastDataRow;rowNumber++) {
        const cell=sheet.getRow(rowNumber).getCell(col);
        if (cell.type===ExcelJS.ValueType.Merge) continue;
        const content=visibleCellText(cell);
        if (!content) continue;
        if (rowNumber<=config.header) {
          for (const word of content.split(/\s+/))
            longestHeaderWord=Math.max(longestHeaderWord,word.length);
        } else {
          for (const line of content.split(/\n/))
            longestData=Math.max(longestData,line.length);
        }
      }
      const sourceWidth=Number(column.width)||0;
      if (timeColumns.has(col)) continue; // Keep company time column width.
      if (col>=8) {
        // H onward: preserve the company's width. Only enlarge when an
        // ACTUAL report value will be clipped. Ignore the pink day separator,
        // header text (which wraps), and blank styled cells.
        let longestActual=0;
        for (const rowNumber of workbook1DataRows) {
          const cell=sheet.getRow(rowNumber).getCell(col);
          if (cell.type===ExcelJS.ValueType.Merge)continue;
          for (const line of visibleCellText(cell).split(/\n/))
            longestActual=Math.max(longestActual,line.length);
        }
        const minimum=dateColumns.has(col)?16:0;
        const required=longestActual ? longestActual+3 : 0;
        if (required>sourceWidth || minimum>sourceWidth)
          column.width=Math.min(255,Math.ceil(Math.max(sourceWidth,required,minimum)));
      } else {
        // A-G: allow normal content-based fitting, including header words.
        const requested=Math.max(sourceWidth,longestData+4,
          Math.min(longestHeaderWord+4,36),dateColumns.has(col)?16:0,12);
        column.width=Math.min(255,Math.ceil(requested));
      }
    }
    // Header alignment applies to every retained column and every header row.
    for (let rowNumber=1;rowNumber<=config.header;rowNumber++) {
      const row=sheet.getRow(rowNumber);
      let rowLines=1;
      for (let col=1;col<=lastDataCol;col++) {
        const cell=row.getCell(col);
        if (cell.type===ExcelJS.ValueType.Merge) continue;
        cell.alignment={
          ...(cell.alignment||{}),
          horizontal:"center",vertical:"middle",wrapText:true
        };
        const value=visibleCellText(cell);
        if (!value)continue;
        const width=Math.max(1,Number(sheet.getColumn(col).width)||12);
        const lines=value.split(/\n/).reduce((total,line)=>{
          const words=line.split(/\s+/).filter(Boolean);
          let used=0,count=1;
          for (const word of words) {
            if (used && used+word.length+1>width-3){count++;used=0;}
            used+=word.length+1;
          }
          return total+Math.max(1,count);
        },0);
        rowLines=Math.max(rowLines,lines);
      }
      row.height=Math.max(Number(row.height)||0,Math.min(240,rowLines*17+8));
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
  // Apply after template styles have been restored, otherwise the source
  // sample's numeric format overwrites the percentage display again.
  for (const [letter,field] of Object.entries(config.fields)) {
    if(field!=="training")continue;
    const col=toNumber(letter);
    const trainingRows=workbook1 ? workbook1DataRows
      : Array.from({length:reports.length},(_,i)=>config.first+i);
    for(const rowNumber of trainingRows){
      const cell=sheet.getRow(rowNumber).getCell(col);
      if(typeof cell.value==="number" && Number.isFinite(cell.value))
        cell.numFmt="0.##%";
    }
  }
  // Keep the company template print header/footer untouched. Some source sheets
  // have headerFooter=null, so assigning oddHeader would crash the export.
  sheet.views=[{state:"frozen",ySplit:config.header,xSplit:3,showGridLines:false}];
  workbook.creator="KTC Production Control";
  workbook.modified=new Date();
  return {workbook,sheet,result:{processCode:code,reportCount:reports.length,templateKind:"original-company",templatePath:filename},mapping,reportRowIdentity};
}
module.exports={FORMS,WORKBOOK1_FORMS,TEMPLATE_ROOT,templatePath,renderOriginalProcessTemplate};
