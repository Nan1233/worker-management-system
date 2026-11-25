'use strict';

const { COLORS } = require('./monthlyWorkbookStyles.cjs');
const { asText, NUMBER_FORMATS, resolvedNumberFormat } = require('./monthlyWorkbookValues.cjs');
const { PROCESS_SHEETS } = require('./monthlyWorkbookSchemas.cjs');
const { linesOf } = require('./gcMachineExportRows.cjs');

function createMonthlySummarySheets({
  applyCellStyle, applyAllBorders, sortReports, formulaSettingsFor,
  settingsForReport, reportSnapshot, reportDetailItems, detailValue,
}) {
function addSummary(workbook, payload, yearMonth) {
  const sheet = workbook.addWorksheet('TỔNG HỢP THÁNG', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
  const columns = [
    ['Công đoạn', 24], ['Số báo cáo', 12], ['Số nhân viên', 14], ['Tổng thời gian', 16], ['Thời gian thực tế', 16],
    ['Tổng thời gian trừ', 14], ['Tổng OK', 12], ['Tổng NG', 12], ['Tổng SP', 12], ['Tỷ lệ NG', 12]
  ];
  columns.forEach(([, width], index) => { sheet.getColumn(index + 1).width = width; });
  sheet.mergeCells(1, 1, 2, columns.length);
  sheet.getCell(1, 1).value = `TỔNG HỢP BÁO CÁO SẢN XUẤT THÁNG ${yearMonth.slice(5, 7)}/${yearMonth.slice(0, 4)}`;
  applyCellStyle(sheet.getCell(1, 1), { fill: COLORS.navy, fontColor: COLORS.white, bold: true, size: 18, border: false });
  columns.forEach(([header], index) => {
    sheet.getCell(4, index + 1).value = header;
    applyCellStyle(sheet.getCell(4, index + 1), { fill: COLORS.blue, fontColor: COLORS.white, bold: true });
  });
  let rowNumber = 5;
  for (const [code, config] of Object.entries(PROCESS_SHEETS)) {
    const processData = payload.processes?.[code] || {};
    const reports = sortReports(processData.reports);
    const employees = new Set(reports.map((item) => asText(item.worker_code)).filter(Boolean));
    const settings = formulaSettingsFor(payload, code);
    const totals = reports.reduce((sum, report) => {
      const itemSettings = settingsForReport(report, settings, processData.formulaSettingsByDate || {});
      const item = reportSnapshot(report, itemSettings);
      sum.working += item.workingTime || 0;
      sum.actual += item.actualTime || 0;
      sum.deduction += item.deductionTime || 0;
      sum.ok += item.ok || 0;
      sum.ng += item.ng || 0;
      sum.output += item.output || 0;
      return sum;
    }, { working: 0, actual: 0, deduction: 0, ok: 0, ng: 0, output: 0 });
    const values = [config.title, reports.length, employees.size, totals.working, totals.actual, totals.deduction, totals.ok, totals.ng, totals.output, totals.ok + totals.ng > 0 ? totals.ng / (totals.ok + totals.ng) : null];
    values.forEach((value, index) => {
      const cell = sheet.getCell(rowNumber, index + 1);
      cell.value = value;
      if ([1, 2, 6, 7, 8].includes(index)) cell.numFmt = NUMBER_FORMATS.INTEGER;
      if (index >= 3 && index <= 5) cell.numFmt = resolvedNumberFormat(value, NUMBER_FORMATS.DECIMAL);
      if (index === 9) cell.numFmt = NUMBER_FORMATS.PERCENT;
      applyCellStyle(cell, { fill: rowNumber % 2 ? COLORS.white : COLORS.blueLight, align: index === 0 ? 'left' : 'right' });
    });
    rowNumber += 1;
  }
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
  applyAllBorders(sheet, { fromRow: 4, toRow: rowNumber - 1, fromCol: 1, toCol: columns.length });
  addPhysicalTimeSummary(workbook,payload);
  return sheet;
}

// These totals describe distinct approved machine events, not the sum of
// Worker credit rows. Missing event links make coverage incomplete.
function addPhysicalTimeSummary(workbook,payload){
  const sheet=workbook.addWorksheet('GIỜ MÁY VẬT LÝ',{views:[{state:'frozen',ySplit:2}]});
  const data=payload.processes?.GC||{};
  const events=new Map();
  for(const event of data.physicalMachineEvents||[]){
    const id=Number(event.id),raw=event.machine_time_hours,hours=Number(raw);
    if(!Number.isSafeInteger(id)||id<=0||events.has(id)||raw==null||String(raw).trim()===''||!Number.isFinite(hours)||hours<0)throw Object.assign(new Error('Sự kiện máy GC không hợp lệ: '+id),{code:'EXCEL_MACHINE_EVENT_INVALID'});
    events.set(id,hours);
  }
  let missing=0,unlinked=0,workerRows=0;
  for(const report of data.reports||[]){
    if(asText(report.operation_mode).toUpperCase()!=='MACHINE')continue;
    const lines=linesOf(report);
    if(!lines.length)missing++;
    for(const line of lines){
      workerRows++;
      const id=Number(line.machine_event_id||0);
      if(!id)unlinked++;else if(!events.has(id))missing++;
    }
  }
  sheet.addRow(['Số sự kiện máy đã duyệt','Tổng giờ máy đã xác nhận','Dòng công nhân–máy','Dòng chưa liên kết','Liên kết thiếu','Phạm vi']);
  sheet.addRow([events.size,[...events.values()].reduce((a,b)=>a+b,0),workerRows,unlinked,missing,missing||unlinked?'CHƯA ĐẦY ĐỦ':'SỰ KIỆN ĐÃ DUYỆT']);
  sheet.addRow(['Giờ máy chỉ cộng theo event ID; giờ trên dòng công nhân là giờ tham gia theo máy, không phải thời gian chấm công.']);
  [26,28,24,22,22,28].forEach((width,index)=>{sheet.getColumn(index+1).width=width;applyCellStyle(sheet.getCell(1,index+1),{fill:COLORS.blue,fontColor:COLORS.white,bold:true});});
  sheet.getCell(2,2).numFmt=NUMBER_FORMATS.DECIMAL;
  return sheet;
}

function addReconciliationSheet(workbook, payload) {
  const sheet = workbook.addWorksheet('ĐỐI CHIẾU DỮ LIỆU', { views: [{ state: 'frozen', ySplit: 3, showGridLines: false }] });
  const headers = ['Công đoạn','ID','Ngày','Mã NV','Tên NV','Tổng TG trừ','Cộng chi tiết trừ','Chênh lệch TG','Tổng NG','Cộng chi tiết NG','Chênh lệch NG','Kết quả'];
  headers.forEach((header, index) => {
    sheet.getCell(3, index + 1).value = header;
    applyCellStyle(sheet.getCell(3, index + 1), { fill: COLORS.gray, fontColor: COLORS.white, bold: true });
    sheet.getColumn(index + 1).width = [20,10,13,11,24,14,17,14,11,16,13,12][index];
  });
  sheet.mergeCells(1, 1, 1, headers.length);
  sheet.getCell(1, 1).value = 'ĐỐI CHIẾU DỮ LIỆU TIỂU TIẾT VỚI BÁO CÁO ĐÃ DUYỆT';
  applyCellStyle(sheet.getCell(1, 1), { fill: COLORS.navy, fontColor: COLORS.white, bold: true, size: 16, border: false });
  let rowNumber = 4;
  for (const [code, config] of Object.entries(PROCESS_SHEETS)) {
    const processData = payload.processes?.[code] || {};
    const baseSettings = formulaSettingsFor(payload, code);
    for (const report of sortReports(processData.reports)) {
      const itemSettings = settingsForReport(report, baseSettings, processData.formulaSettingsByDate || {});
      const item = reportSnapshot(report, itemSettings);
      const detailDeduction = reportDetailItems(report, code, 'deduction')
        .reduce((sum, value) => sum + (detailValue(value, 'deduction') || 0), 0);
      const detailNg = reportDetailItems(report, code, 'defect')
        .reduce((sum, value) => sum + (detailValue(value, 'defect') || 0), 0);
      const deductionDiff = (item.deductionTime || 0) - detailDeduction;
      const ngDiff = (item.ng || 0) - detailNg;
      const ok = Math.abs(deductionDiff) < 0.0001 && Math.abs(ngDiff) < 0.0001;
      const values = [config.title,item.id,item.date,item.workerCode,item.workerName,item.deductionTime,detailDeduction,deductionDiff,item.ng,detailNg,ngDiff,ok?'OK':'LỆCH'];
      values.forEach((value, index) => {
        const cell = sheet.getCell(rowNumber, index + 1);
        cell.value = value;
        if (index === 1 || [8,9,10].includes(index)) cell.numFmt = NUMBER_FORMATS.INTEGER;
        if (index === 2) cell.numFmt = NUMBER_FORMATS.DATE;
        if ([5,6,7].includes(index)) cell.numFmt = resolvedNumberFormat(value, NUMBER_FORMATS.DECIMAL);
        applyCellStyle(cell, { fill: ok ? COLORS.white : COLORS.warning, align: [0,4].includes(index) ? 'left' : 'right' });
      });
      rowNumber += 1;
    }
  }
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  applyAllBorders(sheet, { fromRow: 3, toRow: rowNumber - 1, fromCol: 1, toCol: headers.length });
  return sheet;
}




  return { addSummary, addReconciliationSheet };
}

module.exports = { createMonthlySummarySheets };
