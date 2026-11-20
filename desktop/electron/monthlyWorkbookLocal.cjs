const ExcelJS = require('exceljs');
const { PROCESS_SHEETS, PROCESS_TEMPLATE_SCHEMAS } = require('./monthlyWorkbookSchemas.cjs');
const { PROCESS_FILE_PREFIXES, processWorkbookFileName, summaryWorkbookFileName } = require('./monthlyWorkbookNaming.cjs');
const { createPhysicalMachineMetadata } = require('./monthlyWorkbookPhysicalEvents.cjs');
const { FORMS: ORIGINAL_KTC_FORMS, WORKBOOK1_FORMS, renderOriginalProcessTemplate } = require('./originalProcessExcelTemplate.cjs');
const { calculateProductionMetrics, DEFAULT_SETTINGS, trainingFactor, calculateNg } = require('./productionCalculationEngine.cjs');
const { EXCEL_SYNC_CONTRACT_VERSION } = require(typeof process.resourcesPath === 'string' && require('node:fs').existsSync(require('node:path').join(process.resourcesPath, 'shared', 'excelSyncContract.cjs')) ? require('node:path').join(process.resourcesPath, 'shared', 'excelSyncContract.cjs') : '../../shared/excelSyncContract.cjs');

const EXCEL_CONTRACT_VERSION = EXCEL_SYNC_CONTRACT_VERSION;

// KTC Excel color contract: bám hệ màu file tháng 07/2026.
// Tất cả mã màu được quản lý tập trung tại đây; không rải mã màu trực tiếp trong code.
const { COLORS } = require('./monthlyWorkbookStyles.cjs');
const { createGcModeHelper } = require('./monthlyWorkbookGcHelper.cjs');
const { createMonthlySummarySheets } = require('./monthlyWorkbookSummarySheets.cjs');

const { asText, asNumber, asInteger, NUMBER_FORMATS, resolvedNumberFormat,
  asDate, asDateTime, normalize, pad2, dateKey } = require('./monthlyWorkbookValues.cjs');

function assertApprovedDatabasePayload(payload) {
  if (!payload || payload.dataSource !== 'tidb.production_reports.approved') {
    throw new Error('Excel chỉ được xuất từ production_reports đã duyệt trong TiDB.');
  }
  for (const [code, data] of Object.entries(payload.processes || {})) {
    for (const report of data?.reports || []) {
      if (report?.dataSource !== 'production_reports' || report?.isApprovedDatabaseRecord !== true) {
        throw new Error(`Báo cáo ${report?.id || '?'} của ${code} không phải dữ liệu đã duyệt từ TiDB.`);
      }
    }
  }
}

function machineDisplay(report) {
  const lines = Array.isArray(report.machineLines) ? report.machineLines : [];
  const values = lines
    .map((item) => asText(item.machine_code || item.machine_no || item.machine_name))
    .filter(Boolean);
  return values.length ? [...new Set(values)].join(', ') : asText(report.machine_no);
}

function productDisplay(report) {
  const lines = Array.isArray(report.machineLines) ? report.machineLines : [];
  const values = lines.map((item) => asText(item.product_code)).filter(Boolean);
  return values.length ? [...new Set(values)].join(', ') : (asText(report.product_code) || asText(report.product_name));
}

function countedNg(report) {
  return calculateNg(report).countedNg;
}

function reportTimeKey(report) {
  return asText(report.approved_at || report.created_at || report.entry_date || report.work_date);
}

function formulaSettingsFor(payload, processCode) {
  const source = payload?.formulaSettings || {};
  return source[String(processCode || '').toUpperCase()] || source.GLOBAL || DEFAULT_SETTINGS;
}

function excelOperationTypeLabel(value) {
  const text = asText(value).toUpperCase();
  if (['CUT', 'CẮT', 'CAT'].includes(text)) return 'CẮT';
  if (['NEST', 'NESTING', 'LỒNG', 'LONG'].includes(text)) return 'LỒNG';
  return asText(value);
}

function excelOperationModeLabel(value) {
  const text = asText(value).toUpperCase();
  if (['MACHINE', 'MÁY', 'MAY'].includes(text)) return 'MÁY';
  if (['MANUAL', 'TAY', 'THỦ CÔNG', 'THU CONG'].includes(text)) return 'TAY';
  return asText(value);
}

function reportSnapshot(report, settings = {}) {
  const metrics = report.calculationSnapshot || calculateProductionMetrics(report, settings);
  return {
    id: asNumber(report.id),
    date: asDate(report.work_date),
    entryDate: asDateTime(report.created_at),
    workerCode: asText(report.worker_code),
    workerName: asText(report.full_name),
    shift: asText(report.shift),
    operationType: excelOperationTypeLabel(report.operation_type),
    operationMode: excelOperationModeLabel(report.operation_mode),
    machine: machineDisplay(report),
    product: productDisplay(report),
    training: metrics.trainingFactor,
    standard: metrics.standard,
    workingTime: metrics.workingTime,
    actualTime: metrics.actualTime,
    deductionTime: metrics.deductionTime,
    ok: metrics.ok,
    ng: metrics.allNg,
    countedNg: metrics.countedNg,
    enteredOutput: metrics.enteredOutput,
    output: metrics.adjustedOutput,
    outputPerHour: metrics.outputPerHour,
    achievement: metrics.achievement,
    ngRate: metrics.ngRate,
    status: asText(report.status),
    note: asText(report.note)
  };
}

function achievementColor(value, settings) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const percentValue = Number(value) * 100;
  // Quy tắc màu thống nhất: >=100% xanh; 90-<100% vàng; <90% cam đỏ.
  if (percentValue >= 100) return COLORS.rateGood;
  if (percentValue >= 90) return COLORS.rateWarning;
  return COLORS.rateBad;
}

function detailId(item, kind) {
  const value = kind === 'deduction'
    ? item?.deduction_type_id ?? item?.type_id ?? item?.id
    : item?.defect_type_id ?? item?.type_id ?? item?.id;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function detailCode(item, kind) {
  return asText(kind === 'deduction'
    ? item?.deduction_type_code ?? item?.deduction_code ?? item?.type_code ?? item?.code
    : item?.defect_type_code ?? item?.defect_code ?? item?.type_code ?? item?.code);
}

function detailLabel(item, kind) {
  return asText(kind === 'deduction'
    ? item?.deduction_type_name ?? item?.deduction_name ?? item?.type_name ?? item?.display_name ?? item?.label ?? item?.name ?? item?.deduction_type_code ?? item?.deduction_code ?? item?.code
    : item?.defect_type_name ?? item?.defect_name ?? item?.type_name ?? item?.display_name ?? item?.label ?? item?.name ?? item?.defect_type_code ?? item?.defect_code ?? item?.code);
}

function detailKey(item, kind) {
  const id = detailId(item, kind);
  if (id !== null) return `id:${id}`;
  const code = detailCode(item, kind);
  if (code) return `code:${normalize(code)}`;
  const name = detailLabel(item, kind);
  return name ? `name:${normalize(name)}` : '';
}

function parseDetailArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

// GC MACHINE parent-level deductions are intentionally empty. The Worker
// deduction credit lives on each machine line, so read those line snapshots
// without borrowing shared physical-event deductions.
function reportDetailItems(report, processCode, kind) {
  const reportKey = kind === 'deduction' ? 'deductions' : 'defects';
  const reportItems = Array.isArray(report?.[reportKey]) ? report[reportKey] : [];
  const isGcMachine = normalize(processCode) === 'GC'
    && normalize(report?.operation_mode) === 'MACHINE';
  const lines = Array.isArray(report?.machineLines) ? report.machineLines : [];
  if (!isGcMachine || !lines.length) return reportItems;

  const lineItems = lines.flatMap((line) => {
    const direct = parseDetailArray(line?.[kind]);
    if (direct.length) return direct;
    return parseDetailArray(line?.[kind === 'deduction' ? 'deductions_json' : 'defects_json']);
  });

  if (kind === 'defect') return reportItems.length ? reportItems : lineItems;
  if (lineItems.length) return lineItems;
  return lines.length === 1 ? reportItems : [];
}

function detailAliases(item, kind) {
  const aliases = new Set();
  const id = detailId(item, kind);
  const code = detailCode(item, kind);
  const label = detailLabel(item, kind);
  if (id !== null) aliases.add(`id:${id}`);
  if (code) aliases.add(`code:${normalize(code)}`);
  if (label) aliases.add(`name:${normalize(label)}`);
  return [...aliases];
}

function labelQuality(label, kind) {
  const text = asText(label);
  if (!text) return 0;
  const normalized = normalize(text);
  let score = text.length;
  if (/^\d+$/.test(text)) score -= 30;
  if (/^(KHAC|OTHER|NG|TRU GIO)$/.test(normalized)) score -= 20;
  if (kind === 'deduction' && /TRU GIO/.test(normalized)) score += 2;
  if (kind === 'defect' && normalized.length > 2) score += 2;
  if (text.includes(' ')) score += 5;
  return score;
}

function processDetailTypes(processCode, processData, masterKey, reportKey, kind) {
  const result = [];
  const byAlias = new Map();
  const append = (item) => {
    const aliases = detailAliases(item, kind);
    if (!aliases.length) return;
    const candidateLabel = detailLabel(item, kind) || (kind === 'deduction' ? 'Trừ giờ khác' : 'NG khác');
    let current = aliases.map((alias) => byAlias.get(alias)).find(Boolean);
    if (!current) {
      current = { key: detailKey(item, kind), label: candidateLabel, aliases: new Set(aliases) };
      result.push(current);
    } else {
      aliases.forEach((alias) => current.aliases.add(alias));
      if (labelQuality(candidateLabel, kind) > labelQuality(current.label, kind)) current.label = candidateLabel;
    }
    current.aliases.forEach((alias) => byAlias.set(alias, current));
  };
  const templateLabels = PROCESS_TEMPLATE_SCHEMAS[processCode]?.[kind === 'deduction' ? 'deductions' : 'defects'] || [];
  for (const label of templateLabels) append({ code: normalize(label), name: label });
  for (const item of processData?.[masterKey] || []) append(item);
  for (const report of processData?.reports || []) {
    for (const item of reportDetailItems(report, processCode, kind)) append(item);
  }
  return result.map((item) => ({ key: item.key, label: item.label, aliases: [...item.aliases] }));
}

function detailValue(item, kind) {
  const value = asNumber(kind === 'deduction'
    ? item?.deduction_hours ?? item?.duration_hours ?? item?.time_hours ?? item?.hours ?? item?.value
    : item?.defect_quantity ?? item?.ng_quantity ?? item?.quantity ?? item?.qty ?? item?.value);
  return kind === 'defect' && value !== null ? Math.round(value) : value;
}

function detailMap(items, kind) {
  const map = new Map();
  for (const item of items || []) {
    const value = detailValue(item, kind) || 0;
    for (const alias of detailAliases(item, kind)) map.set(alias, (map.get(alias) || 0) + value);
  }
  return map;
}

function thinBorder() {
  return {
    top: { style: 'thin', color: { argb: COLORS.border } },
    left: { style: 'thin', color: { argb: COLORS.border } },
    bottom: { style: 'thin', color: { argb: COLORS.border } },
    right: { style: 'thin', color: { argb: COLORS.border } }
  };
}

function solidFill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function applyAllBorders(sheet, { fromRow = 1, toRow = null, fromCol = 1, toCol = null } = {}) {
  const lastRow = Math.max(fromRow, Number(toRow || sheet.rowCount || 0));
  const lastCol = Math.max(fromCol, Number(toCol || sheet.columnCount || 0));
  for (let row = fromRow; row <= lastRow; row += 1) {
    for (let col = fromCol; col <= lastCol; col += 1) {
      sheet.getCell(row, col).border = thinBorder();
    }
  }
}

function applyCellStyle(cell, options = {}) {
  // Ghi đè đầy đủ style để Excel luôn hiển thị nội dung ngay khi mở file.
  cell.font = {
    name: 'Arial',
    size: options.size ?? 8,
    bold: Boolean(options.bold),
    italic: Boolean(options.italic),
    color: { argb: options.fontColor || COLORS.black }
  };
  cell.fill = solidFill(options.fill || COLORS.white);
  cell.border = options.border === false ? {} : thinBorder();
  cell.alignment = {
    horizontal: options.align || 'center',
    vertical: 'middle',
    wrapText: options.wrap === true,
    shrinkToFit: options.shrink === true,
    textRotation: 0,
    indent: options.indent || 0
  };
  cell.protection = { locked: true, hidden: false };
}

function addCover(workbook, yearMonth, diagnostics) {
  const [year, month] = yearMonth.split('-');
  const sheet = workbook.addWorksheet('BÌA', { views: [{ showGridLines: false }] });
  sheet.columns = Array.from({ length: 12 }, () => ({ width: 12 }));
  sheet.mergeCells('B3:L5');
  sheet.getCell('B3').value = 'BÁO CÁO SẢN XUẤT THÁNG';
  applyCellStyle(sheet.getCell('B3'), { fill: COLORS.navy, fontColor: COLORS.white, bold: true, size: 22, border: false });
  sheet.mergeCells('B6:L7');
  sheet.getCell('B6').value = `THÁNG ${month}/${year}`;
  applyCellStyle(sheet.getCell('B6'), { fill: COLORS.blue, fontColor: COLORS.white, bold: true, size: 18, border: false });

  const totalReports = Object.values(diagnostics || {}).reduce((sum, item) => sum + Number(item?.reports || 0), 0);
  const activeProcesses = Object.values(diagnostics || {}).filter((item) => Number(item?.reports || 0) > 0).length;
  const info = [
    ['Nguồn dữ liệu', 'TiDB - production_reports đã duyệt'],
    ['Số báo cáo', totalReports],
    ['Công đoạn có dữ liệu', `${activeProcesses}/9`],
    ['Ngày tạo file', new Date()]
  ];
  info.forEach(([label, value], index) => {
    const row = 10 + index;
    sheet.mergeCells(row, 3, row, 5);
    sheet.mergeCells(row, 6, row, 10);
    sheet.getCell(row, 3).value = label;
    sheet.getCell(row, 6).value = value;
    applyCellStyle(sheet.getCell(row, 3), { fill: COLORS.blueLight, bold: true, align: 'left' });
    applyCellStyle(sheet.getCell(row, 6), { fill: COLORS.white, align: 'left' });
    if (value instanceof Date) sheet.getCell(row, 6).numFmt = 'dd/mm/yyyy hh:mm';
  });
  sheet.mergeCells('C16:J18');
  sheet.getCell('C16').value = 'File được tạo tự động từ dữ liệu quản lý đã duyệt. Không sử dụng dữ liệu minh họa trong file mẫu.';
  applyCellStyle(sheet.getCell('C16'), { fill: COLORS.grayLight, bold: false, align: 'center', border: false });
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  return sheet;
}

function detailColumnWidth(label) {
  const length = asText(label).length;
  if (length <= 5) return 9;
  if (length <= 9) return 11;
  if (length <= 14) return 13;
  if (length <= 20) return 15;
  return 17;
}

function makeColumns(processCode, deductionTypes, defectTypes) {
  const columns = [
    { key: 'stt', header: 'STT', group: 'general', width: 7, format: NUMBER_FORMATS.INTEGER },
    { key: 'entryDate', header: 'Thời gian nhập', group: 'general', width: 18, format: NUMBER_FORMATS.DATETIME },
    { key: 'workerCode', header: 'Mã NV', group: 'general', width: 11 },
    { key: 'workerName', header: 'Tên NV', group: 'general', width: 24, align: 'left' },
    { key: 'shift', header: 'Ca', group: 'general', width: 7 },
    { key: 'operationType', header: 'Loại thao tác', group: 'general', width: 13 },
    { key: 'operationMode', header: 'Chế độ', group: 'general', width: 11 },
    { key: 'machine', header: 'Máy', group: 'general', width: 16, align: 'left' },
    { key: 'product', header: 'Mã SP', group: 'general', width: 18, align: 'left' },
    ...(PROCESS_TEMPLATE_SCHEMAS[processCode]?.extras || []).map((field) => ({
      key: `extra:${field.key}`,
      header: field.header,
      group: 'general',
      width: detailColumnWidth(field.header),
      align: field.kind === 'text' ? 'left' : 'right',
      format: field.kind === 'integer' ? NUMBER_FORMATS.INTEGER : field.kind === 'decimal' ? NUMBER_FORMATS.DECIMAL : field.kind === 'date' ? NUMBER_FORMATS.DATE : undefined
    })),
    { key: 'training', header: '% học việc', group: 'general', width: 9, format: NUMBER_FORMATS.PERCENT },
    { key: 'standard', header: 'Định mức', group: 'general', width: 12, format: NUMBER_FORMATS.RATE },
    { key: 'workingTime', header: 'Tổng thời gian', group: 'time', width: 12, format: NUMBER_FORMATS.DECIMAL },
    { key: 'actualTime', header: 'Thời gian thực tế', group: 'time', width: 12, format: NUMBER_FORMATS.DECIMAL },
    { key: 'deductionTime', header: 'Tổng thời gian trừ', group: 'time', width: 13, format: NUMBER_FORMATS.DECIMAL }
  ];
  deductionTypes.forEach((type) => {
    const header = asText(type.label) || 'Trừ giờ';
    columns.push({
      key: `deduction:${type.key}`,
      header,
      group: 'deduction',
      width: detailColumnWidth(header),
      format: NUMBER_FORMATS.DECIMAL
    });
  });
  columns.push(
    { key: 'ok', header: 'OK', group: 'result', width: 10, format: NUMBER_FORMATS.INTEGER },
    { key: 'ng', header: 'Tổng NG', group: 'result', width: 10, format: NUMBER_FORMATS.INTEGER }
  );
  defectTypes.forEach((type) => {
    const header = asText(type.label) || 'NG';
    columns.push({
      key: `defect:${type.key}`,
      header,
      group: 'defect',
      width: detailColumnWidth(header),
      format: NUMBER_FORMATS.INTEGER
    });
  });
  columns.push(
    { key: 'enteredOutput', header: 'SP công nhân nhập', group: 'summary', width: 15, format: NUMBER_FORMATS.INTEGER },
    { key: 'output', header: 'Tổng SP quy đổi', group: 'summary', width: 14, format: NUMBER_FORMATS.INTEGER },
    { key: 'outputPerHour', header: 'SP/giờ', group: 'summary', width: 10, format: NUMBER_FORMATS.RATE },
    { key: 'achievement', header: 'Tỷ lệ đạt', group: 'summary', width: 11, format: NUMBER_FORMATS.PERCENT },
    { key: 'ngRate', header: 'Tỷ lệ NG', group: 'summary', width: 11, format: NUMBER_FORMATS.PERCENT },
    { key: 'status', header: 'Trạng thái', group: 'summary', width: 13 },
    { key: 'note', header: 'Ghi chú', group: 'summary', width: 28, align: 'left' },
    { key: 'id', header: 'ID', group: 'summary', width: 10, format: NUMBER_FORMATS.INTEGER }
  );

  // Mỗi công đoạn có cấu trúc xuất riêng, đối chiếu theo các file báo cáo
  // thực tế tháng 10/2026 và các trường trong processFormSchemas.ts.
  // Các cột đối soát không có trong form giấy vẫn được giữ ở cuối bảng.
  const layouts = {
    GC: {
      fields: ['stt','workerCode','workerName','shift','machine','product','operationType','operationMode','training','workingTime','actualTime','deductionTime','@deduction','standard','enteredOutput','output','achievement','outputPerHour','ok','ng','ngRate','@defect'],
      headers: { machine: 'Số máy Cắt/Lồng', product: 'Mã SP', output: 'KQSX', outputPerHour: 'SL/H', achievement: '% thực tích' }
    },
    MAI: {
      fields: ['stt','workerCode','workerName','shift','machine','training','workingTime','actualTime','deductionTime','@deduction','product','standard','enteredOutput','output','achievement','outputPerHour','ok','ng','@defect','ngRate'],
      headers: { workerName: 'Người mài', machine: 'Số máy mài', workingTime: 'Thời gian làm việc', actualTime: 'Thời gian mài thực tế', output: 'KQSX Mài', outputPerHour: 'SL/H Mài', ng: 'TỔNG PP', achievement: '% thực tích' }
    },
    DO: {
      fields: ['stt','workerCode','workerName','shift','machine','training','workingTime','actualTime','deductionTime','@deduction','product','standard','enteredOutput','output','achievement','outputPerHour','ok','ng','ngRate','@defect'],
      headers: { workerName: 'Người đo', machine: 'Máy đo', workingTime: 'Thời gian đo', actualTime: 'Thời gian đo thực tế', output: 'KQSX Đo', outputPerHour: 'SL/H Đo', ng: 'Tổng lỗi Đo', achievement: '% thực tích' }
    },
    K1: {
      fields: ['stt','workerCode','workerName','shift','product','machine','extra:press_date','extra:press_box_shift','extra:deduction_work','extra:late_early_hours','extra:xlbv_deduction_worker','training','workingTime','actualTime','deductionTime','@deduction','standard','enteredOutput','output','achievement','outputPerHour','ok','ng','ngRate','@defect'],
      headers: { product: 'MÃ SẢN PHẨM', machine: 'Máy/vị trí Kiểm 1', output: 'TT Kiểm 1', outputPerHour: 'NS/H Kiểm 1', achievement: '% năng suất', ng: 'Tổng NG Kiểm 1' }
    },
    K2: {
      fields: ['stt','workerCode','workerName','shift','training','deductionTime','@deduction','workingTime','actualTime','product','machine','standard','enteredOutput','output','achievement','outputPerHour','ok','ng','ngRate','@defect'],
      headers: { product: 'Mã SP Kiểm 2', machine: 'Máy/vị trí Kiểm 2', output: 'TT Kiểm 2', outputPerHour: 'Năng suất/giờ', achievement: '% năng suất', ng: 'Tổng NG Kiểm 2' }
    },
    CAN: {
      fields: ['stt','workerCode','workerName','shift','machine','extra:material_code','product','extra:rolling_hours','workingTime','actualTime','deductionTime','@deduction','standard','enteredOutput','output','achievement','outputPerHour','ngRate','ng','@defect','ok','extra:stop_reason'],
      headers: { machine: 'Số máy cán', product: 'Mã SP Cán', standard: 'Định mức (kg/h)', enteredOutput: 'Thực tích nhập (kg)', output: 'Thực tích cán (kg)', outputPerHour: 'KG/H', achievement: '% thực tích', ng: 'Tổng lỗi Cán' },
      decimalFields: ['enteredOutput','output','ok','ng']
    },
    EP: {
      fields: ['stt','workerCode','workerName','shift','machine','product','extra:press_box_shift','extra:handler','workingTime','actualTime','deductionTime','standard','enteredOutput','output','achievement','outputPerHour','ok','ng','ngRate','@defect','@deduction'],
      headers: { machine: 'Số máy Ép', product: 'Mã SP Ép', workingTime: 'Tổng thời gian Ép', actualTime: 'Thời gian Ép thực tế', output: 'KQSX Ép', outputPerHour: 'NS/H Ép', achievement: '% năng suất', ng: 'TỔNG PP Ép' }
    },
    XLBV: {
      fields: ['stt','workerCode','workerName','shift','product','machine','workingTime','actualTime','extra:stop_operation_hours','extra:deduction_work','extra:shortage_hours','deductionTime','@deduction','standard','enteredOutput','output','achievement','outputPerHour','ok','ng','ngRate','@defect'],
      headers: { product: 'Mã SP XLBV', machine: 'Vị trí XLBV', output: 'Thực tích XLBV', outputPerHour: 'SLSP/H', achievement: '% thực tích', ng: 'Tổng NG XLBV' }
    },
    SX3: {
      fields: ['stt','workerCode','workerName','shift','machine','product','extra:work_minutes','extra:assembly_minutes','extra:tray_minutes','extra:plan_quantity','workingTime','actualTime','deductionTime','standard','enteredOutput','output','achievement','outputPerHour','ok','ng','ngRate','@deduction','@defect'],
      headers: { machine: 'Dây chuyền SX3', product: 'Mã SP lắp ráp', output: 'Thực tích lắp ráp', ng: 'Tổng NG Part', outputPerHour: 'SL/H Lắp ráp', achievement: '% kế hoạch' }
    },
    CVK: {
      fields: ['stt','workerCode','workerName','shift','extra:work_type','product','machine','workingTime','actualTime','deductionTime','@deduction','standard','enteredOutput','output','achievement','outputPerHour','ok','ng','@defect'],
      headers: { product: 'Mã công việc/SP', output: 'Khối lượng CVK', outputPerHour: 'SL/H CVK' }
    }
  };
  const layout = layouts[String(processCode || '').toUpperCase()];
  if (!layout) throw new Error(`Thiếu định nghĩa form Excel cho công đoạn ${processCode}`);
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const ordered = [];
  const used = new Set();
  const append = (column) => {
    if (!column || used.has(column.key)) return;
    used.add(column.key);
    ordered.push({
      ...column,
      header: layout.headers?.[column.key] || column.header,
      format: layout.decimalFields?.includes(column.key) ? NUMBER_FORMATS.DECIMAL : column.format
    });
  };
  for (const key of layout.fields) {
    if (key === '@deduction') {
      columns.filter((column) => column.group === 'deduction').forEach(append);
    } else if (key === '@defect') {
      columns.filter((column) => column.group === 'defect').forEach(append);
    } else {
      if (!byKey.has(key)) throw new Error(`Form ${processCode} tham chiếu cột không tồn tại: ${key}`);
      append(byKey.get(key));
    }
  }
  // Giữ toàn bộ trường nghiệp vụ và metadata (ngày nhập, trạng thái, ID,...)
  // để không mất dữ liệu khi cấu trúc form thay đổi.
  columns.forEach(append);
  if (ordered.length !== columns.length) throw new Error(`Form ${processCode} làm thiếu cột dữ liệu`);
  return ordered;
}

function groupStyle(group) {
  // Rule tháng 07/2026: toàn bộ header dùng cùng một hệ xanh, không chia màu theo nhóm.
  if (group === 'general') return { fill: COLORS.blue, light: COLORS.white, label: 'THÔNG TIN CHUNG' };
  if (group === 'time') return { fill: COLORS.blue, light: COLORS.white, label: 'THỜI GIAN' };
  if (group === 'deduction') return { fill: COLORS.blue, light: COLORS.white, label: 'CHI TIẾT THỜI GIAN TRỪ' };
  if (group === 'result') return { fill: COLORS.blue, light: COLORS.white, label: 'KẾT QUẢ SẢN XUẤT' };
  if (group === 'defect') return { fill: COLORS.blue, light: COLORS.white, label: 'CHI TIẾT NG' };
  return { fill: COLORS.blue, light: COLORS.white, label: 'TỔNG HỢP' };
}

function setGroupHeader(sheet, columns, processConfig) {
  let start = 1;
  while (start <= columns.length) {
    const group = columns[start - 1].group;
    let end = start;
    while (end < columns.length && columns[end].group === group) end += 1;
    if (end > start) sheet.mergeCells(4, start, 4, end);
    const style = groupStyle(group);
    const cell = sheet.getCell(4, start);
    cell.value = group === 'deduction' ? processConfig.deductionGroup : group === 'defect' ? processConfig.defectGroup : style.label;
    applyCellStyle(cell, { fill: style.fill, fontColor: COLORS.white, bold: true, size: 11 });
    for (let col = start + 1; col <= end; col += 1) {
      const merged = sheet.getCell(4, col);
      merged.fill = solidFill(style.fill);
      merged.border = thinBorder();
    }
    start = end + 1;
  }
}

function parseExtraData(report) {
  if (!report?.extra_data) return {};
  if (typeof report.extra_data === 'object' && !Array.isArray(report.extra_data)) return report.extra_data;
  try { const value = JSON.parse(String(report.extra_data)); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
}

function rowValues(processCode, report, deductionTypes, defectTypes, settings) {
  const snapshot = reportSnapshot(report, settings);
  const deductions = detailMap(reportDetailItems(report, processCode, 'deduction'), 'deduction');
  const defects = detailMap(reportDetailItems(report, processCode, 'defect'), 'defect');
  const extra = parseExtraData(report);
  const values = {
    ...snapshot,
    stt: null
  };
  for (const field of PROCESS_TEMPLATE_SCHEMAS[processCode]?.extras || []) {
    const raw = extra[field.key];
    values[`extra:${field.key}`] = field.kind === 'integer' ? asInteger(raw) : field.kind === 'decimal' ? asNumber(raw) : field.kind === 'date' ? asDate(raw) : asText(raw);
  }
  deductionTypes.forEach((type) => {
    const value = [type.key, ...(type.aliases || [])]
      .map((key) => deductions.get(key))
      .find((item) => item !== undefined);
    values[`deduction:${type.key}`] = value || 0;
  });
  defectTypes.forEach((type) => {
    const value = [type.key, ...(type.aliases || [])]
      .map((key) => defects.get(key))
      .find((item) => item !== undefined);
    values[`defect:${type.key}`] = value || 0;
  });
  return values;
}

function compareReportsForWorkbook(left, right) {
  return dateKey(left.work_date).localeCompare(dateKey(right.work_date))
    || reportTimeKey(left).localeCompare(reportTimeKey(right))
    || asText(left.worker_code).localeCompare(asText(right.worker_code), undefined, { numeric: true })
    || machineDisplay(left).localeCompare(machineDisplay(right), undefined, { numeric: true })
    || Number(left.id || 0) - Number(right.id || 0);
}

function sortReports(reports) {
  // Do not mutate the caller's report order.
  return [...(reports || [])].sort(compareReportsForWorkbook);
}

function settingsForReport(report, fallback = {}, settingsByDate = {}) {
  const key = dateKey(report?.work_date);
  return (key && settingsByDate && settingsByDate[key]) || fallback || {};
}

function headerFontSize(header) {
  const length = asText(header).length;
  if (length <= 5) return 8;
  if (length <= 10) return 7.5;
  if (length <= 16) return 7;
  if (length <= 22) return 6.5;
  return 6;
}

function renderProcessSheet(workbook, code, processConfig, processData, yearMonth, formulaSettings) {
  const deductionTypes = processDetailTypes(code, processData, 'deductionTypes', 'deductions', 'deduction');
  const defectTypes = processDetailTypes(code, processData, 'defectTypes', 'defects', 'defect');
  const columns = makeColumns(code, deductionTypes, defectTypes);
  const reports = sortReports(processData?.reports);
  const settings = formulaSettings || {};
  const sheet = workbook.addWorksheet(processConfig.sheet, {
    views: [{
      state: 'frozen',
      xSplit: 4,
      ySplit: 5,
      topLeftCell: 'E6',
      activeCell: 'E6',
      showGridLines: false
    }]
  });
  sheet.properties.defaultRowHeight = 20;
  columns.forEach((column, index) => {
    const excelColumn = sheet.getColumn(index + 1);
    excelColumn.hidden = false;
    excelColumn.outlineLevel = 0;
    excelColumn.width = Math.max(5, Number(column.width) || 8);
  });
  const lastColumn = columns.length;

  sheet.mergeCells(1, 1, 2, lastColumn);
  sheet.getCell(1, 1).value = `BÁO CÁO SẢN XUẤT CÔNG ĐOẠN ${processConfig.title}`;
  applyCellStyle(sheet.getCell(1, 1), { fill: COLORS.navy, fontColor: COLORS.white, bold: true, size: 18, border: false });
  sheet.mergeCells(3, 1, 3, lastColumn);
  const [year, month] = yearMonth.split('-');
  sheet.getCell(3, 1).value = `Tháng ${month}/${year} • Nguồn: TiDB - báo cáo đã duyệt`;
  applyCellStyle(sheet.getCell(3, 1), { fill: COLORS.blueLight, fontColor: COLORS.navy, bold: true, size: 11, border: false });

  setGroupHeader(sheet, columns, processConfig);
  columns.forEach((column, index) => {
    const cell = sheet.getCell(5, index + 1);
    const style = groupStyle(column.group);
    const headerText = asText(column.header) || column.key;

    // Rule tháng 07/2026: header cột nền xanh đậm, chữ trắng, đồng nhất toàn bảng.
    cell.value = headerText;
    cell.numFmt = '@';
    cell.font = {
      name: 'Arial',
      size: headerFontSize(headerText),
      bold: true,
      color: { argb: COLORS.white }
    };
    cell.fill = solidFill(COLORS.blue);
    cell.border = thinBorder();
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
      shrinkToFit: false,
      textRotation: 0
    };
    cell.protection = { locked: true, hidden: false };

    const excelColumn = sheet.getColumn(index + 1);
    excelColumn.hidden = false;
    excelColumn.outlineLevel = 0;
  });
  sheet.getRow(4).height = 22;
  sheet.getRow(5).height = 38;
  sheet.getRow(5).hidden = false;
  sheet.getRow(5).outlineLevel = 0;

  const dataStartRow = 6;
  const numericTotals = new Array(columns.length).fill(0);
  let currentRowNumber = dataStartRow;
  let previousDate = null;
  let sequenceInDate = 0;

  reports.forEach((report, reportIndex) => {
    const currentDate = dateKey(report.work_date);

    // Mỗi ngày bắt đầu bằng đúng một hàng phân cách. Ô A của hàng này
    // ghi ngày báo cáo được chọn trên form (work_date). Không tạo thêm
    // hàng trống riêng và không lặp ngày trên từng dòng dữ liệu.
    if (currentDate !== previousDate) {
      const dateRow = sheet.getRow(currentRowNumber);
      dateRow.height = 22;
      dateRow.hidden = false;
      dateRow.outlineLevel = 0;

      for (let col = 1; col <= lastColumn; col += 1) {
        const cell = dateRow.getCell(col);
        cell.value = null;
        cell.fill = solidFill(col <= 4 ? COLORS.blueLight : COLORS.white);
        cell.border = thinBorder();
      }

      // Chỉ gộp A:D trên hàng phân cách ngày. Các dòng dữ liệu phía dưới
      // vẫn giữ cột A là STT, B là thời gian nhập, C là mã NV và D là tên NV.
      sheet.mergeCells(currentRowNumber, 1, currentRowNumber, 4);

      const reportDate = asDate(report.work_date);
      const dateCell = dateRow.getCell(1);
      dateCell.value = reportDate
        ? `${pad2(reportDate.getDate())}/${pad2(reportDate.getMonth() + 1)}/${reportDate.getFullYear()}`
        : asText(report.work_date);
      dateCell.numFmt = '@';
      applyCellStyle(dateCell, {
        fill: COLORS.blueLight,
        fontColor: COLORS.navy,
        bold: true,
        size: 10,
        align: 'left'
      });
      dateCell.alignment = {
        horizontal: 'left',
        vertical: 'middle',
        indent: 1
      };

      currentRowNumber += 1;
      sequenceInDate = 0;
    }

    sequenceInDate += 1;
    const rowNumber = currentRowNumber;
    const reportSettings = settingsForReport(report, settings, processData?.formulaSettingsByDate || {});
    const values = rowValues(code, report, deductionTypes, defectTypes, reportSettings);
    values.stt = sequenceInDate;

    columns.forEach((column, columnIndex) => {
      const cell = sheet.getCell(rowNumber, columnIndex + 1);
      const value = values[column.key];
      cell.value = value === undefined ? null : value;
      if (column.format) cell.numFmt = resolvedNumberFormat(value, column.format);
      const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : null;
      // Rule tháng 07/2026: nền dữ liệu mặc định trắng, không zebra/rainbow.
      // Chỉ các chỉ số tổng hợp chính mới có màu cố định; chi tiết trừ giờ/NG luôn nền trắng.
      let fill = COLORS.white;
      let bold = false;
      let fontColor = COLORS.black;
      const machineMode = asText(report.operation_mode).toUpperCase() === 'MACHINE';
      const editableCore = machineMode
        ? new Set(['training','note'])
        : new Set(['shift','machine','product','training','actualTime','ok','note']);
      const editableCell = editableCore.has(column.key) || (!machineMode && (column.key.startsWith('deduction:') || column.key.startsWith('defect:')));

      if (column.key === 'workingTime' || column.key === 'outputPerHour') fill = COLORS.blueLight;
      else if (column.key === 'deductionTime') fill = COLORS.orangeLight;
      else if (column.key === 'actualTime' || column.key === 'ok') fill = COLORS.greenLight;
      else if (column.key === 'output' || column.key === 'enteredOutput') fill = COLORS.actualOutput;
      else if (column.key === 'ng') fill = COLORS.redLight;

      if (column.group === 'deduction' || column.group === 'defect') {
        fill = COLORS.white;
        bold = numericValue !== null && numericValue > 0;
        fontColor = COLORS.black;
      }

      applyCellStyle(cell, {
        fill,
        fontColor,
        bold,
        size: 8,
        align: column.align || (typeof value === 'number' ? 'right' : 'center'),
        wrap: Boolean(column.wide),
        shrink: false
      });
      if (editableCell) cell.protection = { locked: false, hidden: false };

      if (column.key === 'achievement') {
        const achievementFill = achievementColor(value, reportSettings);
        if (achievementFill) cell.fill = solidFill(achievementFill);
        cell.font = { ...cell.font, color: { argb: COLORS.black }, bold: true };
      } else if (column.key === 'ngRate') {
        const rate = Number(value);
        if (Number.isFinite(rate)) {
          cell.fill = solidFill(rate <= 0.01 ? COLORS.rateGood : rate <= 0.03 ? COLORS.rateWarning : COLORS.rateBad);
          cell.font = { ...cell.font, color: { argb: COLORS.black }, bold: true };
        }
      } else if (column.key === 'status' && asText(value).toLowerCase() === 'approved') {
        // Trạng thái giữ nền trắng để không tạo thêm mảng màu rời rạc.
        cell.font = { ...cell.font, color: { argb: COLORS.black }, bold: true };
      }

      if (typeof value === 'number' && Number.isFinite(value)) numericTotals[columnIndex] += value;
    });

    previousDate = currentDate;
    currentRowNumber += 1;
  });

  const totalRowNumber = currentRowNumber;
  const totalLabelEnd = Math.min(10, lastColumn);
  if (totalLabelEnd > 1) sheet.mergeCells(totalRowNumber, 1, totalRowNumber, totalLabelEnd);
  const totalLabel = sheet.getCell(totalRowNumber, 1);
  totalLabel.value = 'TỔNG CỘNG';
  applyCellStyle(totalLabel, { fill: COLORS.navy, fontColor: COLORS.white, bold: true, size: 11, align: 'left' });
  for (let col = 2; col <= totalLabelEnd; col += 1) {
    sheet.getCell(totalRowNumber, col).fill = solidFill(COLORS.navy);
    sheet.getCell(totalRowNumber, col).border = thinBorder();
  }
  const nonTotalKeys = new Set(['stt','entryDate','workerCode','workerName','shift','operationType','operationMode','machine','product','training','standard','outputPerHour','achievement','ngRate','status','note','id']);
  columns.forEach((column, index) => {
    if (index + 1 <= totalLabelEnd) return;
    const cell = sheet.getCell(totalRowNumber, index + 1);
    const value = nonTotalKeys.has(column.key) ? null : numericTotals[index];
    cell.value = value;
    if (column.format) cell.numFmt = resolvedNumberFormat(value, column.format);
    applyCellStyle(cell, { fill: COLORS.navy, fontColor: COLORS.white, bold: true, align: 'right' });
  });
  sheet.getRow(totalRowNumber).height = 24;
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, totalRowNumber - 1), column: lastColumn } };
  sheet.pageSetup = {
    orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9,
    margins: { left: 0.2, right: 0.2, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 }
  };
  sheet.headerFooter = { oddFooter: '&LKTC Production Control&CTrang &P / &N&R&D &T' };
  // All Borders cho toàn bộ vùng bảng: header nhóm, header cột, hàng ngày, dữ liệu và tổng cộng.
  applyAllBorders(sheet, { fromRow: 4, toRow: totalRowNumber, fromCol: 1, toCol: lastColumn });
  return { code, sheet: processConfig.sheet, reportCount: reports.length, deductionColumnCount: deductionTypes.length, defectColumnCount: defectTypes.length };
}

const { addSummary, addReconciliationSheet } = createMonthlySummarySheets({
  applyCellStyle, applyAllBorders, sortReports, formulaSettingsFor,
  settingsForReport, reportSnapshot, reportDetailItems, detailValue,
});

const GC_HELPER_SHEET = 'TAY MÁY CẮT LỒNG';

const { addGcModeHelperSheet } = createGcModeHelper({ applyCellStyle, solidFill, applyAllBorders });

function typeIdFromSyncKey(key) {
  const match = String(key || '').match(/^id:(\d+)$/);
  return match ? Number(match[1]) : null;
}

function syncOriginalPatch(report) {
  return {
    shift: asText(report.shift),
    operation_type: asText(report.operation_type),
    operation_mode: asText(report.operation_mode),
    machine_no: asText(report.machine_no),
    product_name: asText(report.product_name),
    training_percent: Number.isFinite(Number(report.training_percent)) ? Number(report.training_percent) : 100,
    actual_time: asNumber(report.actual_time),
    tt_ok: asInteger(report.tt_ok),
    note: asText(report.note),
    deductions: (report.deductions || []).map((item) => ({
      deduction_type_id: detailId(item, 'deduction'),
      hours: detailValue(item, 'deduction') || 0
    })).filter((item) => item.deduction_type_id),
    defects: (report.defects || []).map((item) => ({
      defect_type_id: detailId(item, 'defect'),
      quantity: detailValue(item, 'defect') || 0
    })).filter((item) => item.defect_type_id)
  };
}

const { addPhysicalMachineEventsMetadata } = createPhysicalMachineMetadata({ asText, asNumber });

function addExcelDbSyncMetadata(workbook, code, processConfig, processData, yearMonth, templateMapping = null) {
  const deductionTypes = processDetailTypes(code, processData, 'deductionTypes', 'deductions', 'deduction');
  const defectTypes = processDetailTypes(code, processData, 'defectTypes', 'defects', 'defect');
  const columns = makeColumns(code, deductionTypes, defectTypes);
  const editable = (templateMapping || columns.map((column, index) => ({ ...column, index: index + 1 }))).map((column) => {
    const entry = { index: column.index, key: column.key, header: column.header };
    if (column.key.startsWith('deduction:')) entry.typeId = typeIdFromSyncKey(column.key.slice('deduction:'.length));
    if (column.key.startsWith('defect:')) entry.typeId = typeIdFromSyncKey(column.key.slice('defect:'.length));
    return entry;
  });
  // The six approved Workbook1 paper forms have no visible ID column.
  // Store an exact row-to-report mapping in veryHidden metadata, preserving
  // the user-approved sheet widths, column count, headers and printed layout.
  const paperForm = WORKBOOK1_FORMS[code] || ORIGINAL_KTC_FORMS[code] || null;
  const sourceFirstDataRow = paperForm ? paperForm.first + (WORKBOOK1_FORMS[code] ? 0 : 1) : null;
  const reportRows = new Map();
  const reportOrdinals = new Map();
  if (paperForm) {
    let nextRow = sourceFirstDataRow - 2;
    let lastDate = null;
    let dayStt = 0;
    for (const report of sortReports(processData?.reports || [])) {
      const day = dateKey(report.work_date);
      if (day !== lastDate) { nextRow += 1; lastDate = day; dayStt = 0; }
      const id = Number(report.id);
      reportRows.set(id, ++nextRow);
      reportOrdinals.set(id, ++dayStt);
    }
  }
  const sheet = workbook.addWorksheet('_KTC_SYNC');
  sheet.state = 'veryHidden';
  sheet.getCell('A1').value = JSON.stringify({
    version: EXCEL_SYNC_CONTRACT_VERSION,
    processCode: code,
    sheetName: templateMapping && paperForm ? paperForm.sheet : processConfig.sheet,
    generatedAt: new Date().toISOString(),
    yearMonth,
    gcHelperSheet: code === 'GC' ? GC_HELPER_SHEET : null,
    rowIdentityMode: paperForm ? 'KTC_SYNC_ROW_V1' : null,
    firstDataRow: sourceFirstDataRow,
    columns: editable
  });
  sheet.addRow(['report_id', 'expected_updated_at', 'operation_mode', 'original_json', 'source_row', 'worker_code', 'work_date', 'row_stt']);
  for (const report of processData?.reports || []) {
    sheet.addRow([
      Number(report.id),
      report.updated_at || report.created_at || null,
      asText(report.operation_mode).toUpperCase(),
      JSON.stringify(syncOriginalPatch(report)),
      paperForm ? reportRows.get(Number(report.id)) ?? null : null,
      paperForm ? asText(report.worker_code) : null,
      paperForm ? dateKey(report.work_date) : null,
      paperForm ? reportOrdinals.get(Number(report.id)) ?? null : null
    ]);
  }
}

async function buildMonthlyWorkbookLocal({ date, payload }) {
  assertApprovedDatabasePayload(payload);
  const yearMonth = String(payload.yearMonth || date || '').slice(0, 7);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KTC Production Control';
  workbook.created = new Date();
  workbook.modified = new Date();
  addCover(workbook, yearMonth, payload.diagnostics);
  addSummary(workbook, payload, yearMonth);
  const results = [];
  for (const [code, config] of Object.entries(PROCESS_SHEETS)) {
    results.push(renderProcessSheet(workbook, code, config, payload.processes?.[code] || {}, yearMonth, formulaSettingsFor(payload, code)));
  }
  addReconciliationSheet(workbook, payload);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, results, formulaReplacementCount: 0 };
}


/**
 * Tạo một workbook chỉ chứa đúng một sheet công đoạn.
 * Dùng cho Desktop để mỗi công đoạn là một file Excel độc lập, nhẹ và dễ mở/chỉnh.
 */
async function buildProcessWorkbookLocal({ date, payload, processCode, onTemplateLoaded }) {
  assertApprovedDatabasePayload(payload);
  const code = String(processCode || '').trim().toUpperCase();
  const config = PROCESS_SHEETS[code];
  if (!config) throw new Error(`Công đoạn không hợp lệ: ${processCode}`);

  const yearMonth = String(payload.yearMonth || date || '').slice(0, 7);
  const processData = payload.processes?.[code] || {};
  if (WORKBOOK1_FORMS[code] || ORIGINAL_KTC_FORMS[code]) {
    const original = await renderOriginalProcessTemplate({
      ExcelJS, code, processData, yearMonth, settings: formulaSettingsFor(payload,code),
      helpers: { sortReports, dateKey, processDetailTypes, reportSnapshot, settingsForReport,
        parseExtraData, detailMap, reportDetailItems }, onTemplateLoaded
    });
    if (code === 'GC' && WORKBOOK1_FORMS[code]) {
      // Preserve the machine/manual editing helper for the new GC worksheet.
      // Its row 6 references match Workbook1's row 5 date separator + first report.
      const mappedColumns = Array.from({ length: Math.max(...original.mapping.map(x => x.index)) },
        (_, index) => ({ key: original.mapping.find(field => field.index === index + 1)?.key || '' }));
      addGcModeHelperSheet(original.workbook, original.sheet, processData, mappedColumns);
    }
    addExcelDbSyncMetadata(original.workbook, code, config, processData, yearMonth, original.mapping);
    addPhysicalMachineEventsMetadata(original.workbook, processData);
    const buffer = Buffer.from(await original.workbook.xlsx.writeBuffer());
    const originalCols = {};
    for (const field of original.mapping || []) {
      if (typeof field.key === 'string' && !field.key.startsWith('defect:') && !field.key.startsWith('deduction:') && originalCols[field.key] == null) {
        originalCols[field.key] = field.index;
      }
    }
    return {buffer, result:original.result, processCode:code, processName:config.title,
      fileName:processWorkbookFileName(code,date,payload), formulaReplacementCount:0,
      templateKind:WORKBOOK1_FORMS[code] ? "workbook1-sheet" : "original-company", columnContract:{cols:originalCols}};
  }
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KTC Production Control';
  workbook.created = new Date();
  workbook.modified = new Date();
  const result = renderProcessSheet(
    workbook,
    code,
    config,
    processData,
    yearMonth,
    formulaSettingsFor(payload, code)
  );
  if (code === 'GC') {
    const deductionTypes = processDetailTypes(code, processData, 'deductionTypes', 'deductions', 'deduction');
    const defectTypes = processDetailTypes(code, processData, 'defectTypes', 'defects', 'defect');
    addGcModeHelperSheet(workbook, workbook.getWorksheet(config.sheet), processData, makeColumns(code, deductionTypes, defectTypes));
  }
  addExcelDbSyncMetadata(workbook, code, config, processData, yearMonth);
  addPhysicalMachineEventsMetadata(workbook, processData);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    buffer,
    result,
    processCode: code,
    processName: config.title,
    fileName: processWorkbookFileName(code, date, payload),
    formulaReplacementCount: 0
  };
}

/**
 * File số 00: chỉ giữ thông tin chung của tháng. Các sheet công đoạn được tách
 * hoàn toàn sang 10 file riêng để không phải mở một workbook quá rộng/nặng.
 */
async function buildMonthlySummaryWorkbookLocal({ date, payload }) {
  assertApprovedDatabasePayload(payload);
  const yearMonth = String(payload.yearMonth || date || '').slice(0, 7);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KTC Production Control';
  workbook.created = new Date();
  workbook.modified = new Date();
  addCover(workbook, yearMonth, payload.diagnostics);
  addSummary(workbook, payload, yearMonth);
  addReconciliationSheet(workbook, payload);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    buffer,
    fileName: summaryWorkbookFileName(date, payload),
    formulaReplacementCount: 0
  };
}

async function buildSplitMonthlyWorkbooksLocal({ date, payload, onTemplateLoaded }) {
  assertApprovedDatabasePayload(payload);
  const summary = await buildMonthlySummaryWorkbookLocal({ date, payload });
  const processes = [];
  for (const code of Object.keys(PROCESS_SHEETS)) {
    processes.push(await buildProcessWorkbookLocal({ date, payload, processCode: code, onTemplateLoaded }));
  }
  return { summary, processes };
}

async function buildReconciliationWorkbook({ date, payload }) {
  assertApprovedDatabasePayload(payload);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KTC Production Control';
  const sheet = workbook.addWorksheet('DATA_DB', { views: [{ state: 'frozen', ySplit: 1 }] });
  const headers = ['Công đoạn','ID','Ngày báo cáo','Ngày nhập','Mã NV','Tên NV','Ca','Máy','Mã SP','% học việc','Định mức','Tổng thời gian','Thời gian thực tế','Tổng thời gian trừ','OK','NG','SP công nhân nhập','Tổng SP quy đổi','Trừ giờ JSON','NG JSON','Máy JSON','Trạng thái','Ghi chú'];
  sheet.addRow(headers);
  headers.forEach((_, index) => {
    applyCellStyle(sheet.getCell(1, index + 1), { fill: COLORS.navy, fontColor: COLORS.white, bold: true });
    sheet.getColumn(index + 1).width = index >= 18 && index <= 20 ? 35 : [20,10,13,13,11,24,7,18,18,11,12,12,12,12,10,10,14,14][index] || 14;
  });
  let count = 0;
  for (const [code, config] of Object.entries(PROCESS_SHEETS)) {
    const processData = payload.processes?.[code] || {};
    const baseSettings = formulaSettingsFor(payload, code);
    for (const report of sortReports(processData.reports)) {
      const itemSettings = settingsForReport(report, baseSettings, processData.formulaSettingsByDate || {});
      const value = reportSnapshot(report, itemSettings);
      const row = sheet.addRow([config.title,value.id,value.date,value.entryDate,value.workerCode,value.workerName,value.shift,value.machine,value.product,value.training,value.standard,value.workingTime,value.actualTime,value.deductionTime,value.ok,value.ng,value.enteredOutput,value.output,JSON.stringify(report.deductions || []),JSON.stringify(report.defects || []),JSON.stringify(report.machineLines || []),report.status,value.note]);
      row.getCell(2).numFmt = NUMBER_FORMATS.INTEGER;
      row.getCell(3).numFmt = NUMBER_FORMATS.DATE;
      row.getCell(4).numFmt = NUMBER_FORMATS.DATE;
      row.getCell(10).numFmt = NUMBER_FORMATS.PERCENT;
      row.getCell(11).numFmt = resolvedNumberFormat(value.standard, NUMBER_FORMATS.RATE);
      row.getCell(12).numFmt = resolvedNumberFormat(value.workingTime, NUMBER_FORMATS.DECIMAL);
      row.getCell(13).numFmt = resolvedNumberFormat(value.actualTime, NUMBER_FORMATS.DECIMAL);
      row.getCell(14).numFmt = resolvedNumberFormat(value.deductionTime, NUMBER_FORMATS.DECIMAL);
      row.getCell(15).numFmt = NUMBER_FORMATS.INTEGER;
      row.getCell(16).numFmt = NUMBER_FORMATS.INTEGER;
      row.getCell(17).numFmt = NUMBER_FORMATS.INTEGER;
      row.getCell(18).numFmt = NUMBER_FORMATS.INTEGER;
      row.eachCell((cell, column) => applyCellStyle(cell, { fill: count % 2 ? COLORS.blueLight : COLORS.white, align: [1,6,8,9,19,20,21,23].includes(column) ? 'left' : 'center' }));
      count += 1;
    }
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, count + 1), column: headers.length } };
  applyAllBorders(sheet, { fromRow: 1, toRow: Math.max(1, count + 1), fromCol: 1, toCol: headers.length });
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, rowCount: count };
}

module.exports = {
  buildMonthlyWorkbookLocal,
  // Stable unwrapped entry point consumed by excelExportContractPatch.v6.cjs.
  buildCompanyOriginalProcessWorkbookLocal: buildProcessWorkbookLocal,
  buildProcessWorkbookLocal,
  buildMonthlySummaryWorkbookLocal,
  buildSplitMonthlyWorkbooksLocal,
  buildReconciliationWorkbook,
  PROCESS_SHEETS,
  PROCESS_FILE_PREFIXES,
  EXCEL_CONTRACT_VERSION,
  processWorkbookFileName,
  summaryWorkbookFileName,
  _private: {
    assertApprovedDatabasePayload,
    normalize,
    reportSnapshot,
    reportDetailItems,
    detailKey,
    processDetailTypes,
    makeColumns,
    renderProcessSheet,
    sortReports,
    trainingFactor,
    countedNg,
    reportTimeKey,
    applyAllBorders,
    addPhysicalMachineEventsMetadata,
    COLORS
  }
};
